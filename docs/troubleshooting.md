# Troubleshooting

Common issues and solutions for Meeting Intelligence Assistant.

---

## Setup Issues

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:

```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill $(lsof -ti:3000)

# Restart frontend
cd frontend && npm run dev
```

### Docker Not Running

**Error**: `Cannot connect to Docker daemon`

**Solution**:

1. Open Docker Desktop application
2. Wait for it to fully start (green icon in menu bar/system tray)
3. Run `docker ps` to verify
4. Restart your command

### Supabase Won't Start

**Error**: `Failed to start Supabase`

**Solution**:

```bash
# Stop Supabase
supabase stop

# Check Docker containers
docker ps -a | grep supabase

# Remove old containers
docker-compose down
supabase stop

# Start fresh
supabase start
```

---

## Development Issues

### Environment Variables Not Loading

**Symptom**: App shows errors about missing configuration

**Solutions**:

1. **Verify .env files exist**:

   ```bash
   ls -la frontend/.env.local
   ls -la python-backend/.env.local
   ```

2. **Check for placeholder values**:

   ```bash
   grep "your_.*_here" frontend/.env.local
   ```

   If found, replace with actual API keys.

3. **Restart services after changing .env files**:
   ```bash
   npm stop
   npm start
   ```

### Python Backend Won't Start

**Error**: `Health check failed`

**Solutions**:

1. **Check Docker logs**:

   ```bash
   cd python-backend && docker-compose logs -f
   ```

2. **Verify .env.local exists**:

   ```bash
   ls -la python-backend/.env.local
   ```

3. **Rebuild container**:
   ```bash
   cd python-backend
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

---

## Stripe Issues

### Stripe Webhooks Not Working

**Symptom**: Subscriptions created but database not updated

**Solutions**:

1. **Check webhook secret is configured**:

   ```bash
   grep STRIPE_WEBHOOK_SECRET frontend/.env.local
   ```

   If empty or placeholder, get the secret:

   ```bash
   docker logs stripe-webhook-forwarder 2>&1 | grep 'whsec_'
   ```

   Add to `frontend/.env.local`:

   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

2. **Check Stripe container is running**:

   ```bash
   docker ps | grep stripe
   ```

   If not running:

   ```bash
   cd python-backend && docker-compose up -d stripe-cli
   ```

3. **Check frontend has service role key** (for database writes):

   ```bash
   grep SUPABASE_SERVICE_ROLE_KEY frontend/.env.local
   ```

   Get from: `supabase status` → "service_role key"

4. **Restart frontend after changing .env.local**

### Webhook Signature Verification Failed

**Error**: `Webhook signature verification failed`

**Cause**: Incorrect `STRIPE_WEBHOOK_SECRET` or raw body not used

**Solution**:

1. Check `STRIPE_WEBHOOK_SECRET` matches Docker logs
2. Ensure raw body is used (not parsed JSON)
3. Use Stripe CLI for local testing

### Rate Limit Exceeded

**Error**: `429 Too Many Requests`

**Cause**: Too many requests to subscription endpoints

**Solution**:

1. Wait for rate limit window to expire
2. Check `Retry-After` header for seconds remaining
3. Implement exponential backoff on frontend
4. For testing: Add `DISABLE_RATE_LIMITING=true` to `.env.local` (remove before production!)

---

## Intercom Issues

### Intercom Messenger Not Appearing

**Symptom**: Intercom widget doesn't show on your pages

**Solutions**:

1. **Check App ID is configured**:

   ```bash
   grep NEXT_PUBLIC_INTERCOM_APP_ID frontend/.env.local
   ```

   If missing, add: `NEXT_PUBLIC_INTERCOM_APP_ID=your_intercom_app_id`

2. **Check browser console for errors**:
   - Look for `[Intercom] Initialized successfully` message
   - Check for any Intercom-related errors

3. **Restart frontend after adding env variables**:
   ```bash
   npm stop
   npm start
   ```

### Custom Attributes Showing as "Unknown"

**Symptom**: User attributes display as "unknown" in Intercom dashboard

**Cause**: Missing JWT identity verification

**Solutions**:

1. **Verify identity verification secret is set**:

   ```bash
   grep INTERCOM_IDENTITY_VERIFICATION_SECRET frontend/.env.local
   ```

2. **Check JWT token is being generated**:
   - Log in to your app
   - Open browser console
   - Look for: `[Intercom] User identified with JWT (secure mode)`
   - If you see `[Intercom] User identified:` (without JWT), the secret is missing

3. **Add the secret to .env.local**:

   ```bash
   INTERCOM_IDENTITY_VERIFICATION_SECRET=your_secret_here
   ```

   Get from: Intercom Settings → Security → Identity Verification

4. **Restart frontend and log out/in again**

5. **Wait 5-10 minutes** for Intercom to process and display attributes

### JWT Token Generation Fails

**Symptom**: User not identified, console shows JWT fetch errors

**Solutions**:

1. **Check API route is accessible**:

   ```bash
   curl -X POST http://localhost:3000/api/intercom/jwt \
     -H "Cookie: your-session-cookie"
   ```

2. **Verify user is authenticated**:
   - JWT endpoint requires valid Supabase session
   - Try logging out and back in

3. **Check server logs** for API route errors

4. **Verify jsonwebtoken package is installed**:
   ```bash
   grep jsonwebtoken frontend/package.json
   ```

---

## Database Issues

### Database Migrations Out of Sync

**Error**: `Migration X not found`

**Solution**:

```bash
# Check migration status
supabase migration list --local

# If corrupted, reset local database
supabase db reset

# Restart Supabase
supabase stop && supabase start
```

### RLS Policy Violations

**Error**: `new row violates row-level security policy`

**Debug Steps**:

1. Check if RLS is enabled: `SELECT * FROM pg_tables WHERE tablename = 'your_table'`
2. List policies: `SELECT * FROM pg_policies WHERE tablename = 'your_table'`
3. Verify user authentication: `SELECT auth.uid()` returns current user ID
4. Check policy conditions match your use case

**Common Fix**:

```sql
-- Ensure policy allows the operation
CREATE POLICY "Users can insert own data"
ON table_name FOR INSERT
WITH CHECK (user_id = auth.uid());  -- Important: WITH CHECK for INSERT
```

### Type Generation Fails

**Error**: `Error generating types`

**Solution**:

```bash
# Ensure Supabase is running
supabase start

# Check status
supabase status

# Regenerate types
supabase gen types typescript --local > supabase/database.types.ts
```

---

## Processing Issues

### Processing Jobs Stuck in "Processing" State

**Symptom**: Jobs never complete or fail

**Debug Steps**:

1. **Check Python backend logs**:

   ```bash
   cd python-backend && docker-compose logs -f python-backend
   ```

2. **Verify signed URL is valid**:
   - Check if URL has expired (2-hour limit)
   - Verify file exists in Supabase Storage

3. **Check API key authentication**:

   ```bash
   grep PYTHON_BACKEND_API_KEY supabase/functions/.env.local
   grep API_KEY python-backend/.env.local
   ```

   Both should match.

4. **Verify Edge Function secrets** (production):
   - Supabase Dashboard → Edge Functions → Secrets
   - Check `PYTHON_BACKEND_URL` and `PYTHON_BACKEND_API_KEY`

### Failed to Download File

**Error**: `Failed to download file from signed URL`

**Causes**:

1. Signed URL expired (2-hour limit)
2. File was deleted from storage
3. Network connectivity issues

**Solution**:

- Increase signed URL expiry time in Edge Function
- Verify file exists in Supabase Storage
- Check Python backend can reach Supabase

### Transcription Fails

**Error**: `Transcription failed`

**Causes**:

1. Unsupported audio format
2. Audio quality too low
3. API key invalid or quota exceeded

**Solution**:

- Verify AssemblyAI API key is valid
- Check supported formats: MP4, WebM, MOV, MP3, WAV
- Review AssemblyAI dashboard for quota limits

---

## Deployment Issues

### Frontend Build Fails

**Common Causes**:

1. Lint errors
2. Type errors
3. Missing environment variables

**Solution**:

```bash
# Check linting
npm run lint:frontend

# Check types and build
npm run build:frontend

# Fix errors and retry
```

### Python Backend Deploy Fails

**Check**:

1. Docker build logs in GCP Console → Cloud Build
2. Secrets configured in Google Secret Manager
3. Service account permissions
4. Requirements.txt dependencies

**Solution**:

```bash
# Verify secrets exist
gcloud secrets list

# Check service account permissions
gcloud projects get-iam-policy <project-id>

# View deployment logs
gcloud run services logs read meeting-intelligence-backend --region us-central1
```

### Supabase Migration Fails in CI

**Check**:

1. Migration syntax errors
2. Conflicting migrations
3. Missing RLS policies
4. Destructive operations without proper checks

**Solution**:

1. Review database-checks.yml workflow output
2. Test migration locally before pushing
3. Fix issues and re-commit

---

## Performance Issues

### Slow Upload Times

**Causes**:

1. Large file size
2. Slow network connection
3. Supabase Storage performance

**Solution**:

- Implement client-side compression (if applicable)
- Show upload progress to user
- Consider chunked uploads for very large files

### Slow Processing Times

**Causes**:

1. Large file size / long duration
2. Resource constraints (CPU/memory)
3. AI API rate limiting

**Solutions**:

- Increase Cloud Run memory (2Gi → 4Gi)
- Increase timeout (300s → 600s)
- Optimize audio extraction (lower quality for faster processing)
- Implement queue system for batch processing

---

## Testing Issues

### Tests Fail Locally

**Check**:

1. All dependencies installed: `npm install`
2. Environment variables set (if needed)
3. Mock data factories up to date

**Solution**:

```bash
# Clear jest cache
npm test -- --clearCache

# Run specific failing test
npm test -- path/to/test.test.ts

# Check for console errors
npm test -- --verbose
```

### Mock Not Working

**Cause**: Mock imported after actual module

**Solution**: Always call `jest.mock()` before imports

### Flaky Tests

**Cause**: Timing-dependent tests or shared state

**Solution**:

- Use explicit timeouts with buffer
- Clear mocks in `beforeEach()`
- Avoid shared state between tests

---

## Common Error Messages

### "Unauthorized"

**Cause**: User not authenticated or session expired

**Solution**:

- Check if user is logged in
- Verify session cookie exists
- Try logging out and back in

### "Subscription not found"

**Cause**: Webhook hasn't fired yet or database out of sync

**Solution**:

- Check Stripe Dashboard → Webhooks for delivery status
- Manually trigger webhook with Stripe CLI
- Query database: `SELECT * FROM subscriptions WHERE user_id = 'xxx'`

### "Backend not configured"

**Cause**: `PYTHON_BACKEND_URL` not set in Edge Function secrets

**Solution**:

- Add secret in Supabase Dashboard → Edge Functions → Secrets
- Redeploy Edge Functions

### "Failed to connect to processing service"

**Causes**:

1. Python backend not running
2. Wrong URL in `PYTHON_BACKEND_URL`
3. CORS issues
4. Network connectivity

**Solution**:

```bash
# Test health endpoint
curl https://your-service.run.app/api/health

# Check CORS headers
curl -H "Origin: https://your-frontend.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  https://your-service.run.app/api/process
```

---

## Upload & Processing Issues

### Meeting Not Showing Up After Upload

**Symptom**: Recorded a meeting with desktop app, but it doesn't appear in dashboard

**Debug Steps**:

1. **Check Desktop App Logs** (should show emojis ⬆️ 📤 ✅):

   ```
   [Upload] ⬆️ Starting stitched audio upload: {...}
   [Upload] ✅ User authenticated: <user_id>
   [Upload] 📤 Uploading to Supabase Storage: <path>
   [Upload] ✅ Stitched audio uploaded to storage in XXXms
   [Upload] 📡 Calling frontend API to create meeting record
   [Upload] ✅ Meeting created successfully in XXXms: {...}
   ```

2. **Check if meeting was created**:

   ```sql
   SELECT id, title, created_at, audio_storage_path
   FROM meetings
   WHERE user_id = '<your_user_id>'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

3. **Check processing job status**:

   ```sql
   SELECT pj.id, pj.status, pj.processing_error, pj.created_at, m.title
   FROM processing_jobs pj
   LEFT JOIN meetings m ON pj.meeting_id = m.id
   WHERE m.user_id = '<your_user_id>'
   ORDER BY pj.created_at DESC
   LIMIT 5;
   ```

4. **Check Sentry** for errors (see [monitoring.md](./monitoring.md) for details):
   - Go to https://sentry.io
   - Search for `user_id:<your_user_id>` or `meeting_id:<meeting_id>`
   - Look for errors and structured log messages in last hour
   - Filter by component tag: `desktop-app`, `frontend-api`, `edge-function`, `python-backend`

**Common Causes**:

| Symptom                   | Likely Cause                | Fix                                              |
| ------------------------- | --------------------------- | ------------------------------------------------ |
| No meeting record         | Desktop app upload failed   | Check desktop app logs for errors                |
| Meeting exists, no job    | Database trigger not firing | Check trigger exists (see below)                 |
| Job stuck in "pending"    | Edge Function not called    | Check Supabase Edge Function logs                |
| Job stuck in "processing" | Python backend unreachable  | Check PYTHON_BACKEND_URL secret                  |
| Job status "failed"       | Processing error            | Check `processing_error` column + Cloud Run logs |

**Verify Database Trigger**:

```sql
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'on_meeting_recording_added';
```

### Edge Function Fails with "Unsupported lockfile version"

**Error**: `worker boot error: Failed reading lockfile at '.../deno.lock': Unsupported lockfile version '5'`

**Cause**: Your local Deno version is newer than Supabase Edge Runtime's Deno. When you run `deno cache`, `deno test`, `deno fmt`, etc., Deno creates/updates `deno.lock` with version 5, but Supabase Edge Runtime only supports earlier versions.

**Solution**:

```bash
# Delete the incompatible lockfile
rm supabase/functions/deno.lock

# Restart Edge Runtime
docker restart supabase_edge_runtime_*

# Re-trigger any stuck jobs (find job_id in processing_jobs table)
curl -X POST "http://localhost:54321/functions/v1/process-meeting" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service_role_key>" \
  -d '{"jobId": "<job_id>"}'
```

**Prevention**: The `npm start` script automatically removes `deno.lock` before starting Edge Functions. If you run Edge Functions manually, delete the lockfile first.

### Processing Job Stuck in "Pending"

**Symptom**: Meeting created, but processing job never starts

**Debug Steps**:

1. **Check Edge Function was called**:
   - Go to Supabase Dashboard → Edge Functions → process-meeting → Logs
   - Look for: `[process-meeting] Processing job: <job_id>`

2. **Verify Edge Function secrets are configured**:
   - Supabase Dashboard → Edge Functions → Secrets
   - Required: `PYTHON_BACKEND_URL`, `PYTHON_BACKEND_API_KEY`, `SENTRY_DSN`

3. **Get Python backend URL**:

   ```bash
   gcloud run services describe meeting-intelligence-backend \
     --region us-central1 \
     --format="value(status.url)"
   ```

4. **Test Python backend is reachable**:
   ```bash
   curl https://meeting-intelligence-backend-xxx.run.app/api/health
   ```

**Solution**: Add missing secrets in Supabase Dashboard → Edge Functions → Secrets

### Processing Job Stuck in "Processing"

**Symptom**: Job status shows "processing" for >10 minutes

**Debug Steps**:

1. **Check Python backend logs**:

   ```bash
   gcloud run services logs read meeting-intelligence-backend \
     --region=us-central1 \
     --limit=100 \
     --format="table(timestamp,textPayload)" \
     | grep "Job <job_id>"
   ```

2. **Check for processing errors**:

   ```sql
   SELECT id, status, processing_error, created_at
   FROM processing_jobs
   WHERE id = '<job_id>';
   ```

3. **Check Sentry for Python backend errors** (see [monitoring.md](./monitoring.md)):
   - Search for `job_id:<job_id>` or `meeting_id:<meeting_id>`
   - Filter by component: `python-backend`
   - Look for transcription or LLM errors
   - Check structured logs to see which stage failed (start, completed)

**Common Causes**:

- Transcription API timeout (AssemblyAI)
- LLM API failure (Gemini)
- File download error
- Out of memory

**Solution**: Check `processing_error` field for details, retry if transient error

### Desktop App Upload Fails

**Symptom**: Desktop app shows error notification after recording

**Debug Steps**:

1. **Check desktop app console logs**:
   - Look for `[Upload] ❌` error messages
   - Note the error text

2. **Common errors**:
   - `❌ Authentication failed` → User needs to log in again
   - `❌ Storage upload failed` → Check Supabase storage bucket permissions
   - `❌ API request failed (401)` → Access token expired, log in again
   - `❌ API request failed (500)` → Frontend API error, check Vercel logs

3. **Check file exists in Supabase Storage**:
   ```sql
   SELECT * FROM storage.objects
   WHERE bucket_id = 'recordings'
   AND name LIKE '%<user_id>%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

**Solution**: Based on error message, fix authentication, permissions, or API issue

### How to Monitor Uploads End-to-End

With centralized Sentry monitoring (see [monitoring.md](./monitoring.md)), you can trace the full upload flow:

1. **Desktop App** → Logs structured message with `stage: upload-complete`
2. **Frontend API** → Logs structured message with `stage: api-complete`
3. **Database Trigger** → Automatically creates processing_job
4. **Edge Function** → Logs structured message with `stage: edge-complete`
5. **Python Backend** → Logs `stage: start` and `stage: completed`

**View in Sentry** (single centralized dashboard):

- Search for `meeting_id:<meeting_id>` or `job_id:<job_id>`
- See all 5 structured log messages across all components
- Filter by component tag: `desktop-app`, `frontend-api`, `edge-function`, `python-backend`
- Follow breadcrumb trail to see where it failed
- Check correlation with `user_id`, `meeting_id`, and `job_id` tags

**Quick Health Check Script**:

```bash
# Check recent uploads for user
USER_ID="<your_user_id>"

echo "📋 Recent meetings:"
supabase db query "
  SELECT id, title, created_at,
         audio_storage_path IS NOT NULL as has_recording
  FROM meetings
  WHERE user_id = '$USER_ID'
  ORDER BY created_at DESC
  LIMIT 5;"

echo ""
echo "⚙️ Processing jobs:"
supabase db query "
  SELECT pj.id, pj.status, pj.created_at, m.title
  FROM processing_jobs pj
  JOIN meetings m ON pj.meeting_id = m.id
  WHERE m.user_id = '$USER_ID'
  ORDER BY pj.created_at DESC
  LIMIT 5;"
```

---

## Getting Help

If you can't resolve an issue:

1. **Check Logs** (see [monitoring.md](./monitoring.md) for complete guide):
   - **Sentry** (centralized): All errors and structured logs across all components
   - Frontend: Browser console + Vercel logs
   - Python Backend: Docker logs or Cloud Run logs
   - Supabase: Dashboard → Logs (Edge Functions)
   - Stripe: Dashboard → Events and Webhooks
   - Desktop App: Console logs (Help → Developer Tools)

2. **Search Documentation**:
   - Check `docs/` folder for relevant guides
   - Review README.md
   - Check `.claude/CLAUDE.md` for AI assistant context

3. **Ask for Help**:
   - Open an issue on GitHub with error details and logs
   - Ask in team Slack/Discord
   - Include steps to reproduce the issue

---

## Resources

- [Next.js Troubleshooting](https://nextjs.org/docs/messages)
- [Supabase Troubleshooting](https://supabase.com/docs/guides/platform/troubleshooting)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Docker Troubleshooting](https://docs.docker.com/config/daemon/troubleshoot/)
