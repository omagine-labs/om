# Resend Email Integration

Technical documentation for Resend integration used for anonymous upload email notifications.

---

## Overview

Resend handles transactional email notifications for anonymous meeting uploads. When an anonymous user uploads a recording for analysis, they receive a beautiful HTML email with meeting insights and a signup link when processing completes.

**Use Cases**:

- Anonymous upload completion notifications
- Marketing/transactional emails separate from Intercom onboarding flow

**Why Resend**:

- Allows custom HTML email templates (full design control)
- Simple API for transactional emails
- Free tier: 3,000 emails/month, 100 emails/day
- Better separation of concerns: Intercom = support/onboarding, Resend = transactional

---

## Environment Variables

**Python Backend** (`.env.local` and production):

```bash
RESEND_API_KEY=re_xxx                           # API key from Resend
EMAIL_FROM_ADDRESS=notifications@omaginelabs.com # Verified sender domain
EMAIL_FROM_NAME=Om by Omagine Labs              # Sender name
FRONTEND_URL=https://app.omagine.com            # For generating signup links
```

**Getting API Keys**:

1. Sign up at [resend.com](https://resend.com)
2. Navigate to [API Keys](https://resend.com/api-keys)
3. Click **Create API Key**
4. Copy key (starts with `re_`)

**Domain Verification** (Required):

1. Navigate to [Domains](https://resend.com/domains) in Resend dashboard
2. Add `omaginelabs.com`
3. Add SPF and DKIM records to DNS (provided by Resend)
4. Verify domain status shows "Verified"

---

## Email Template

Emails are generated using the custom HTML template in `python-backend/app/services/email_preview.py`.

**Features**:

- Gradient CTA buttons
- Meeting metrics (duration, speakers, talk time)
- Personalized insights (dominant speaker, balanced conversation, etc.)
- Signup link with pre-filled email and meeting ID
- 7-day deletion notice

**Example Email**:

```
Subject: 🎉 Your Meeting Analysis is Ready!

[Beautiful HTML with gradient header]

Your Analysis is Ready!

Speaker A dominated the conversation at 75% talk time

Key Meeting Insights:
• 12 min duration
• 2 speakers
• 450 total words
• 3.2 filler words/min
• 5 interruptions

[Gradient CTA Button: See Your Full Analysis]
→ Links to https://app.omagine.com/signup?email=user@example.com&meeting_id=xxx

Note: Your recording will be automatically deleted after 7 days.
```

---

## Implementation

### Backend Client

**File**: `python-backend/app/services/resend_client.py`

```python
from app.services.resend_client import ResendClient

client = ResendClient()  # Uses RESEND_API_KEY from settings

result = await client.send_anonymous_upload_complete(
    email="user@example.com",
    html_body=html_content
)

if result["status"] == "success":
    print(f"Email sent: {result['email_id']}")
elif result["status"] == "skipped":
    print("No API key configured")
else:
    print(f"Error: {result['error']}")
```

**Methods**:

- `send_html_email()` - Generic HTML email sender
- `send_anonymous_upload_complete()` - Convenience method with preset subject

### Email Generation

**File**: `python-backend/app/services/email_preview.py`

```python
from app.services.email_preview import generate_email_preview

html_body = generate_email_preview(
    meeting_id="meeting-123",
    duration_seconds=720,
    speaker_stats={
        "Speaker A": {
            "total_time": 540,
            "percentage": 75,
            "word_count": 350,
            "filler_words_per_minute": 2.5,
            # ... other metrics
        }
    },
    signup_url="https://app.omagine.com/signup?email=user@example.com&meeting_id=meeting-123"
)
```

### Pipeline Integration

**File**: `python-backend/app/services/orchestrator.py`

Emails are sent automatically at the end of the processing pipeline:

```python
# Step 9: Send email notification for anonymous uploads
if is_anonymous:
    duration_seconds = transcription_result.get("duration", 0)
    await self._send_anonymous_notification(
        job_id, meeting_id, speaker_stats, int(duration_seconds)
    )
```

---

## Graceful Degradation

If `RESEND_API_KEY` is not configured:

- ✅ System logs warning: "Resend API key not configured, skipping email"
- ✅ Processing continues normally
- ✅ No job failures
- ✅ Returns `{"status": "skipped", "reason": "api_key_not_configured"}`

If email sending fails:

- ✅ Error logged but not raised
- ✅ Processing completes successfully
- ✅ Returns `{"status": "error", "error": "..."}`

**Philosophy**: Email notifications are optional - never fail the core processing job.

---

## Deployment

### Local Development

**Setup**:

```bash
# python-backend/.env.local
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM_ADDRESS=notifications@omaginelabs.com
EMAIL_FROM_NAME=Om by Omagine Labs
FRONTEND_URL=http://localhost:3000
```

**Testing**:

1. Start services: `npm start`
2. Upload recording anonymously at marketing site
3. Check Python backend logs for email notification
4. Verify email received (use real email for testing)

### Production (Google Cloud Run)

Secrets are managed via Google Secret Manager. The `python-backend/deploy.sh` script handles setup.

**Deploy Steps**:

1. Add Resend API key to `.env.deploy`:

   ```bash
   RESEND_API_KEY=re_xxx
   ```

2. Run deployment:

   ```bash
   cd python-backend
   ./deploy.sh
   ```

3. Script automatically:
   - Creates/updates `resend-api-key` secret
   - Injects secret as `RESEND_API_KEY` environment variable
   - Deploys to Cloud Run

**Verify Deployment**:

```bash
# Check secret exists
gcloud secrets describe resend-api-key

# View Cloud Run environment variables
gcloud run services describe meeting-intelligence-backend \
  --region us-central1 \
  --format="value(spec.template.spec.containers[0].env)"
```

---

## Testing

### Unit Tests

**File**: `python-backend/tests/services/test_resend_client.py`

Run tests:

```bash
cd python-backend
source venv/bin/activate
pytest tests/services/test_resend_client.py -v
```

**Coverage**: 16 tests, 100% code coverage

### Integration Testing

**Test anonymous upload flow**:

1. Upload recording anonymously
2. Wait for processing to complete
3. Check email received with correct content
4. Verify signup link works

**Test graceful degradation**:

1. Temporarily remove `RESEND_API_KEY` from environment
2. Upload recording anonymously
3. Verify processing completes successfully
4. Check logs show "Resend API key not configured, skipping email"

---

## Monitoring

### Email Delivery

**Resend Dashboard**:

- Navigate to [Emails](https://resend.com/emails)
- View all sent emails, delivery status, opens, clicks
- Filter by date, status, recipient

**Metrics to Monitor**:

- Delivery rate (should be >99%)
- Bounce rate (should be <1%)
- Open rate (informational)

### Error Tracking

**Python Backend Logs**:

```bash
# Local development
cd python-backend && docker-compose logs -f python-backend

# Production
gcloud run services logs read meeting-intelligence-backend --region us-central1
```

**Search for email-related logs**:

```bash
# Success
grep "Email sent successfully" logs.txt

# Errors
grep "Failed to send email" logs.txt

# Skipped (no API key)
grep "Resend API key not configured" logs.txt
```

---

## Rate Limits

**Resend Free Tier**:

- 3,000 emails/month
- 100 emails/day
- No credit card required

**Upgrade Triggers**:

- If anonymous uploads exceed 100/day
- If total monthly emails exceed 3,000

**Monitoring Usage**:

- Check [Resend Dashboard → Usage](https://resend.com/usage)
- Set up alerts for 80% usage threshold

---

## Troubleshooting

### Emails not being sent

**Check backend logs**:

```bash
cd python-backend
docker-compose logs -f python-backend | grep -i "email\|resend"
```

**Common issues**:

1. **"Resend API key not configured"**
   - Add `RESEND_API_KEY` to `.env.local`
   - Restart Python backend: `docker-compose restart python-backend`

2. **"The [domain] is not verified"**
   - Verify domain in Resend dashboard
   - Check DNS records (SPF, DKIM) are correctly set
   - Update `EMAIL_FROM_ADDRESS` to use verified domain

3. **"Failed to send email via Resend: [error]"**
   - Check API key is valid
   - Verify rate limits not exceeded
   - Check Resend status page: [status.resend.com](https://status.resend.com)

### Email goes to spam

**Solutions**:

1. Ensure domain is verified (SPF + DKIM)
2. Check sender reputation in Resend dashboard
3. Ask users to whitelist `notifications@omaginelabs.com`
4. Reduce email frequency if sending too many

### Signup link not working

**Check**:

1. `FRONTEND_URL` is set correctly in `.env.local`
2. Link format: `{FRONTEND_URL}/signup?email={email}&meeting_id={meeting_id}`
3. Frontend has route handler at `/signup`

---

## API Reference

### ResendClient.send_html_email()

Send a custom HTML email.

**Parameters**:

- `to_email` (str): Recipient email address
- `subject` (str): Email subject line
- `html_body` (str): Full HTML email content
- `from_email` (str, optional): Sender email (defaults to `EMAIL_FROM_ADDRESS`)
- `from_name` (str, optional): Sender name (defaults to `EMAIL_FROM_NAME`)

**Returns**:

```python
{
    "status": "success" | "error" | "skipped",
    "email_id": "abc123",  # Only if status = "success"
    "to": "user@example.com",  # Only if status = "success"
    "error": "Error message",  # Only if status = "error"
    "reason": "api_key_not_configured"  # Only if status = "skipped"
}
```

### ResendClient.send_anonymous_upload_complete()

Send anonymous upload completion notification with preset subject.

**Parameters**:

- `email` (str): Recipient email address
- `html_body` (str): Pre-generated HTML from `generate_email_preview()`

**Returns**: Same as `send_html_email()`

---

## Security

**API Key Storage**:

- ✅ Stored in environment variables (never in code)
- ✅ Google Secret Manager in production
- ✅ `.env.local` excluded from git (in `.gitignore`)

**Email Content**:

- ✅ No sensitive user data in emails
- ✅ Meeting ID is required to access results (rate-limited)
- ✅ Recordings auto-delete after 7 days

**Domain Security**:

- ✅ SPF records prevent email spoofing
- ✅ DKIM signatures verify email authenticity
- ✅ Verified domain ownership with Resend

---

## Related Documentation

- **Intercom Integration**: `docs/intercom.md` - Onboarding emails, support chat
- **Email Preview**: `python-backend/app/services/email_preview.py` - HTML template
- **Deployment**: `docs/deployment.md` - CI/CD and production deployment
