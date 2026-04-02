# Monitoring & Alerting

Centralized observability, error tracking, and alerting system for Meeting Intelligence Assistant.

---

## Overview

**Strategy**: Multi-layer observability approach:

- **Sentry**: Error tracking + structured logs for application events across all components
- **Langfuse**: LLM-specific observability (prompts, completions, costs)
- **Slack**: Critical error alerts

**Components Monitored**:

1. Python Backend (Cloud Run) - Errors + logs + LLM tracing
2. Desktop App (Electron) - Errors + upload flow logs
3. Frontend API Routes (Next.js) - Errors + API logs
4. Supabase Edge Functions - Errors + orchestration logs

**Complementary Systems** (not replaced):

- Cloud Run logs (verbose debug logs)
- Vercel logs (deployment + build logs)
- Supabase Dashboard logs (database queries + edge function logs)

---

## Architecture

```
┌─────────────────┐
│  Desktop App    │──┐
│   (Electron)    │  │  Errors + Upload Logs
└─────────────────┘  │
                     │
┌─────────────────┐  │
│  Frontend API   │──┤
│   (Next.js)     │  │  Errors + API Logs
└─────────────────┘  │    ┌──────────────────┐      ┌─────────────┐
                     ├───→│     Sentry       │─────→│   Slack     │
┌─────────────────┐  │    │  Errors + Logs   │      │ (Critical   │
│  Edge Functions │──┤    │  + Breadcrumbs   │      │  Alerts)    │
│   (Supabase)    │  │    └──────────────────┘      └─────────────┘
└─────────────────┘  │  Errors + Orchestration Logs
                     │
┌─────────────────┐  │                             ┌──────────────────┐
│ Python Backend  │──┘                             │    Langfuse      │
│  (Cloud Run)    │───────────────────────────────→│  LLM Tracing     │
└─────────────────┘  Errors + Processing Logs      │  + Costs         │
                     + LLM Traces                  └──────────────────┘
```

**Key Features**:

- **Correlated by job_id**: All logs from desktop → API → edge → Python share `job_id`
- **Trace-connected**: Logs automatically linked to error traces and spans
- **Centralized**: Single Sentry UI for all errors + logs across all components
- **LLM-specific**: Langfuse for detailed LLM prompt/completion tracking

---

## Sentry Configuration

### Projects

**Recommended**: Use a single Sentry project called `om` with `component` tags for filtering.

**Alternative**: Create separate projects if you need different alert rules or quotas per component:

- `om-python` - Python backend
- `om-desktop` - Desktop app
- `om-frontend` - Frontend API
- `om-edge` - Edge Functions

**We recommend starting with a single project** for simplicity. You can split later if needed.

### Environment Variables

**Python Backend** (Google Secret Manager):

```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production  # or development
```

**Desktop App** (`.env.local`):

```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_SENTRY_ENVIRONMENT=production
```

**Frontend** (Vercel):

```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx  # For source maps
```

**Edge Functions** (Supabase Secrets):

```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

---

## Centralized Logging Strategy

### Overview

**Approach**: Use Sentry Structured Logs for key application events alongside traditional error tracking.

**Benefits**:

- **Trace-connected**: Logs automatically linked to errors and performance traces
- **Searchable**: Query by `job_id`, `user_id`, `meeting_id`, `component`, `stage`
- **Live tailing**: Real-time log monitoring in Sentry UI
- **Unified view**: See logs + errors + traces in one place
- **No context switching**: No need to jump between Cloud Run, Vercel, Supabase logs

### What We Log to Sentry

**Key milestones only** (not verbose debug logs):

| Component      | Event                  | Stage             | Attributes                                                    |
| -------------- | ---------------------- | ----------------- | ------------------------------------------------------------- |
| Desktop App    | Upload completed       | `upload-complete` | `jobId`, `meetingId`, `fileSizeMB`, `durationSeconds`         |
| Frontend API   | API request completed  | `api-complete`    | `jobId`, `meetingId`, `storagePath`, `fileSizeMB`             |
| Edge Function  | Python backend invoked | `edge-complete`   | `jobId`, `meetingId`, `userId`, `pythonJobId`                 |
| Python Backend | Processing started     | `start`           | `jobId`, `meetingId`, `userId`, `storagePath`, `is_anonymous` |
| Python Backend | Processing completed   | `completed`       | `jobId`, `meetingId`, `userId`, `speakers_count`              |

**Consistent attributes across all logs**:

- `job_id` - Primary correlation ID
- `meeting_id` - Links to meetings table
- `user_id` - User who uploaded
- `component` - Which system logged it (`desktop-app`, `frontend-api`, `edge-function`, `python-backend`)
- `stage` - Where in the flow (`upload-complete`, `api-complete`, `edge-complete`, `start`, `completed`)

### What Stays in Platform Logs

**Not sent to Sentry** (remain in Cloud Run/Vercel/Supabase logs):

- Verbose debug logs (`logger.debug()`, `console.log()`)
- High-frequency events (every database query, every HTTP request)
- Infrastructure logs (container startup, health checks, autoscaling)
- Detailed LLM traces (Langfuse handles this)

### Example Usage

**Desktop App (upload-service.ts)**:

```typescript
Sentry.captureMessage('Upload completed successfully', {
  level: 'info',
  extra: {
    jobId: result.jobId,
    meetingId: result.meetingId,
    component: 'desktop-app',
    stage: 'upload-complete',
    fileSizeMB,
    durationSeconds: totalDuration,
  },
});
```

**Python Backend (orchestrator.py)**:

```python
capture_message(
    "Processing job started",
    level="info",
    extras={
        "job_id": job_id,
        "meeting_id": meeting_id,
        "user_id": user_id,
        "component": "python-backend",
        "stage": "start",
    },
)
```

### Querying Structured Logs in Sentry

**Find all logs for a specific job**:

```
job_id:"abc-123-xyz"
```

**Find failed uploads from desktop app**:

```
component:"desktop-app" AND stage:"upload-complete" AND level:error
```

**Trace end-to-end flow for a meeting**:

```
meeting_id:"meeting-uuid-here"
```

Sort by timestamp to see: desktop upload → API → edge → Python start → Python complete

---

## Langfuse Integration (LLM Observability)

### Overview

**Purpose**: Dedicated LLM tracing for prompts, completions, and cost tracking.

**What Langfuse Tracks**:

- LLM prompt templates (versioned in Langfuse UI)
- Prompt input variables
- Model completions and structured outputs
- Token usage and costs per request
- Latency per LLM call
- Model configurations (temperature, max_tokens, etc.)

**Implementation**:

- Located in: `python-backend/app/services/analysis/llm/langfuse_client.py`
- Wraps all LLM analyzer calls with `@langfuse_client.observe()` decorator
- Gracefully degrades if not configured (no-op decorator)

**Key Features**:

- **Prompt management**: Store and version prompts in Langfuse UI
- **Cost tracking**: Track spend per user, meeting, or model
- **A/B testing**: Compare prompt versions and model performance
- **Debugging**: See exact prompts and completions for failed analyses

**Environment Variables**:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-xxx
LANGFUSE_SECRET_KEY=sk-lf-xxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

### Sentry vs Langfuse: When to Use Each

| Use Case              | Tool          | Why                                      |
| --------------------- | ------------- | ---------------------------------------- |
| Application errors    | Sentry        | Error grouping, stack traces, alerts     |
| Upload flow debugging | Sentry        | Trace entire flow across components      |
| Key milestone logs    | Sentry        | Centralized, searchable, trace-connected |
| LLM prompt debugging  | Langfuse      | See exact prompts + completions          |
| LLM cost tracking     | Langfuse      | Per-model, per-user cost breakdowns      |
| Prompt versioning     | Langfuse      | A/B test prompt changes                  |
| Verbose debug logs    | Platform logs | Cloud Run, Vercel, Supabase dashboards   |

---

## Tracing Upload Flow

### End-to-End Breadcrumbs

Each component adds breadcrumbs to trace the upload flow:

#### 1. Desktop App

```typescript
Sentry.addBreadcrumb({
  category: 'upload',
  message: 'Starting upload',
  level: 'info',
  data: {
    sessionId: 'xxx',
    fileSizeMB: 15.3,
    durationSeconds: 1800,
  },
});
```

#### 2. Frontend API (`/api/upload`)

```typescript
Sentry.addBreadcrumb({
  category: 'api',
  message: 'Creating meeting record',
  data: {
    storagePath: 'user_id/2025/11/session.mp3',
    meetingId: 'xxx',
  },
});
```

#### 3. Edge Function (`process-meeting`)

```typescript
Sentry.addBreadcrumb({
  category: 'processing',
  message: 'Calling Python backend',
  data: {
    jobId: 'xxx',
    meetingId: 'xxx',
    pythonUrl: 'https://...',
  },
});
```

#### 4. Python Backend

```python
sentry_sdk.add_breadcrumb(
    category="processing",
    message="Starting transcription",
    level="info",
    data={"job_id": job_id, "segments_count": 0}
)
```

### Context Tags

Set consistent tags across all components for correlation:

```typescript
// All components
Sentry.setTag('user_id', userId);
Sentry.setTag('meeting_id', meetingId);
Sentry.setTag('job_id', jobId);
Sentry.setTag('environment', 'production');
```

---

## Slack Alerts

### Alert Rules

Configure Sentry alerts to notify Slack channel `#meeting-intelligence-alerts`:

**Critical Errors** (immediate notification):

- Python backend processing failures
- Edge Function timeouts
- Desktop app crashes
- Database trigger failures

**Alert Conditions**:

```
IF error.level = "error"
   AND error.count > 1 in 5 minutes
   AND error.tags.component IN ["processing", "upload", "edge-function"]
THEN notify #meeting-intelligence-alerts
```

**Error Grouping**:

- Group by: `error.type`, `user_id`, `job_id`
- Ignore: Development errors, rate limits, expected validation failures

### Slack Integration Setup

1. **Create Slack App**: https://api.slack.com/apps
2. **Add Webhook**: https://api.slack.com/messaging/webhooks
3. **Configure in Sentry**: Project Settings → Integrations → Slack

**Alert Template**:

```
🚨 Error in Production

Component: {component}
User: {user_id}
Meeting: {meeting_id}
Job: {job_id}

Error: {error.message}

View in Sentry: {sentry_url}
```

---

## Monitoring Critical Paths

### Upload Flow Checkpoints

| Step                   | Component     | Success Event        | Failure Alert             |
| ---------------------- | ------------- | -------------------- | ------------------------- |
| 1. Upload to Storage   | Desktop       | `upload.success`     | `upload.storage_failed`   |
| 2. Create Meeting      | Frontend API  | `meeting.created`    | `meeting.creation_failed` |
| 3. Trigger Processing  | Database      | `job.created`        | `trigger.failed`          |
| 4. Call Edge Function  | Trigger       | `edge.called`        | `edge.not_called`         |
| 5. Call Python Backend | Edge Function | `python.called`      | `python.unreachable`      |
| 6. Process File        | Python        | `processing.started` | `processing.failed`       |
| 7. Complete            | Python        | `job.completed`      | `job.failed`              |

### Health Checks

**Python Backend**:

```bash
# Endpoint: /api/health
# Monitor every 5 minutes
curl https://python-backend.run.app/api/health
```

**Edge Function**:

```bash
# Endpoint: /functions/v1/health
# Monitor every 5 minutes via Supabase
```

### Performance Monitoring

**Sentry Performance**:

- Sample 10% of transactions (already configured in Python)
- Track slow operations (>10s transcription, >30s LLM analysis)
- Monitor database query times

---

## Debugging Failed Uploads

### Investigation Checklist

When a user reports "my meeting isn't showing up":

1. **Check Sentry** for errors with `user_id` tag
2. **Check Desktop App Logs** in `~/Library/Logs/meeting-intelligence/`
3. **Query Database**:

   ```sql
   -- Find meetings for user
   SELECT id, title, created_at, audio_storage_path
   FROM meetings
   WHERE user_id = 'xxx'
   ORDER BY created_at DESC
   LIMIT 10;

   -- Find processing jobs
   SELECT pj.id, pj.status, pj.processing_error, pj.created_at, m.title
   FROM processing_jobs pj
   LEFT JOIN meetings m ON pj.meeting_id = m.id
   WHERE m.user_id = 'xxx'
   ORDER BY pj.created_at DESC
   LIMIT 10;
   ```

4. **Check Supabase Storage**:
   ```sql
   -- Verify file exists in storage
   SELECT * FROM storage.objects
   WHERE bucket_id = 'recordings'
   AND name LIKE '%user_id%'
   ORDER BY created_at DESC;
   ```

### Common Issues

| Symptom                   | Likely Cause             | Fix                                |
| ------------------------- | ------------------------ | ---------------------------------- |
| No meeting record         | Frontend API error       | Check Sentry frontend errors       |
| Meeting exists, no job    | Trigger not firing       | Check database trigger logs        |
| Job stuck in "pending"    | Edge Function not called | Check `PYTHON_BACKEND_URL` secrets |
| Job stuck in "processing" | Python backend failed    | Check Cloud Run logs + Sentry      |
| Job "failed"              | Processing error         | Check `processing_error` column    |

---

## Dashboard & Metrics

### Sentry Dashboards

Create custom dashboards for:

1. **Upload Success Rate**
   - Metric: `count(job.completed) / count(job.created) * 100`
   - Target: >95%

2. **Processing Time**
   - Metric: `p95(job.duration_seconds)`
   - Target: <180s (3 minutes)

3. **Error Rate by Component**
   - Metric: `count(errors) by component`
   - Goal: <1% error rate

### Alerts

| Alert                | Condition           | Severity | Notify            |
| -------------------- | ------------------- | -------- | ----------------- |
| High Error Rate      | >5% errors in 15min | Critical | Slack + Email     |
| Processing Timeout   | Job >15min          | High     | Slack             |
| Storage Upload Fails | >3 failures in 5min | High     | Slack             |
| Edge Function Down   | No calls in 10min   | Critical | Slack + PagerDuty |

---

## Local Development

Sentry is **disabled by default** in local development. To enable:

```bash
# .env.local
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=development
```

Use a separate "Development" environment in Sentry to avoid polluting production data.

---

## Cost Optimization

### Sentry Quotas

**Error Tracking**:

- Monthly error cap: 10,000 events
- Transaction sampling: 10% (configured in all SDKs)
- Filter out:
  - Network errors (>429, >502)
  - Expected validation errors
  - Development errors

**Structured Logs**:

- Log only key milestones (5-10 events per upload)
- Avoid high-frequency events
- Use platform logs for verbose debugging

**Pricing**:

- **Developer plan** ($26/month): 5,000 errors + 10,000 transactions + 1GB logs
- **Team plan** ($80/month): 50,000 errors + 100,000 transactions + 10GB logs
- **Structured logs**: ~$10-50/month depending on volume (beyond free tier)

**Current Strategy**:

- Start with Developer plan + minimal structured logging
- Monitor usage and scale as needed
- Estimated cost: $26-76/month (Developer plan + logs)

### Langfuse Costs

**Cloud Pricing**:

- **Hobby** (Free): 50,000 events/month
- **Pro** ($59/month): Unlimited events + team collaboration
- **Enterprise**: Custom pricing

**Current Usage**:

- ~100-200 LLM calls per meeting
- ~3,000 LLM calls per month (15 meetings/month)
- Well within free tier

---

## Testing Monitoring

### Manual Test

1. **Trigger Error in Python**:

   ```python
   # In orchestrator.py, add:
   raise ValueError("Test error for monitoring")
   ```

2. **Check Sentry**: Error should appear within 10 seconds

3. **Verify Slack**: Alert should post to #meeting-intelligence-alerts

4. **Check Breadcrumbs**: Should see full upload flow context

### Automated Test

Create synthetic test that:

1. Uploads test file via desktop app
2. Monitors Sentry for errors
3. Verifies job completes successfully
4. Alerts if any step fails

Run daily via GitHub Actions.

---

## Incident Response

### When Alert Fires

1. **Check Sentry** for recent errors with matching tags
2. **Check component logs**:
   - Python: `gcloud run services logs read meeting-intelligence-backend`
   - Edge: Supabase Dashboard → Edge Functions → Logs
   - Frontend: Vercel Dashboard → Logs
3. **Identify pattern**: Is it user-specific? Time-based? Component-wide?
4. **Mitigate**: Roll back if deployment-related, scale up if load-related
5. **Communicate**: Post status in Slack #incidents

### Escalation

- **<5 affected users**: Fix in next release
- **5-50 users**: Hotfix within 2 hours
- **>50 users or all users**: Immediate rollback + emergency fix

---

## Processing SLA Monitoring

### Overview

Automated detection of jobs stuck in `pending` or `processing` status beyond acceptable thresholds.

**Thresholds**:

- **Pending**: >5 minutes - Indicates Edge Function not called or failed
- **Processing**: >20 minutes - Indicates Python backend hung or failed

### Implementation

**Edge Function**: `stuck-jobs-monitor`

- **Schedule**: Every 5 minutes via pg_cron
- **Queries**: `processing_jobs` table for stuck jobs
- **Alerts**: Sends errors to Sentry with full context

**Detection Logic**:

```typescript
// Pending jobs: created more than 5 minutes ago
SELECT * FROM processing_jobs
WHERE status = 'pending'
AND created_at < NOW() - INTERVAL '5 minutes';

// Processing jobs: not updated in last 20 minutes
SELECT * FROM processing_jobs
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '20 minutes';
```

### Alert Context

When stuck jobs are detected, Sentry receives:

```json
{
  "error": "X jobs stuck in [pending|processing] status",
  "context": {
    "count": 3,
    "status": "pending",
    "threshold_minutes": 5,
    "jobs_details": [
      {
        "job_id": "abc-123",
        "meeting_id": "meeting-456",
        "created_at": "2025-11-26T10:00:00Z",
        "user_id": "user-789",
        "title": "Team standup"
      }
    ]
  }
}
```

**Slack Notification** (if configured):

```
⚠️ Stuck Processing Jobs Detected

Count: 3 jobs
Status: pending
Threshold: 5 minutes

Job IDs: abc-123, def-456, ghi-789

Action Required:
- Check Edge Function logs (pending)
- Verify PYTHON_BACKEND_URL configured
- Check database triggers

View in Sentry: [link]
```

### Investigation Steps

**For stuck pending jobs** (Edge Function not called):

1. Check database triggers: `SELECT * FROM pg_stat_user_functions WHERE funcname LIKE '%process_meeting%';`
2. Verify `PYTHON_BACKEND_URL` in Supabase secrets
3. Check Edge Function logs: Supabase Dashboard → Edge Functions → Logs
4. Check Edge Function invocation count: Should see POST to `/process-meeting`

**For stuck processing jobs** (Python backend hung):

1. Check Python backend logs: `gcloud run services logs read meeting-intelligence-backend`
2. Look for job_id in logs to see where it stopped
3. Check Cloud Run metrics for memory/CPU issues
4. Verify AssemblyAI API is responding
5. Check Langfuse for LLM tracing if it got to analysis stage

### Cron Job Configuration

**Local Development**: Cron job disabled (not needed for development)

**Production Setup** (run once after deployment):

1. Deploy Edge Function:

   ```bash
   supabase functions deploy stuck-jobs-monitor
   ```

2. Configure cron job via Supabase SQL Editor:

   ```sql
   SELECT cron.schedule(
     'stuck-jobs-monitor',
     '*/5 * * * *',  -- Every 5 minutes
     $$
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/stuck-jobs-monitor',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
       )
     ) AS request_id;
     $$
   );
   ```

3. Verify cron job is scheduled:

   ```sql
   SELECT * FROM cron.job WHERE jobname = 'stuck-jobs-monitor';
   ```

4. View execution history:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'stuck-jobs-monitor')
   ORDER BY start_time DESC LIMIT 10;
   ```

### Manual Testing

**Create a stuck pending job**:

```sql
-- Insert a test job in pending status with old created_at
INSERT INTO processing_jobs (id, meeting_id, status, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM meetings LIMIT 1),
  'pending',
  NOW() - INTERVAL '10 minutes'
);
```

**Trigger monitoring manually**:

```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/stuck-jobs-monitor \
  -H "Authorization: Bearer <service-role-key>"
```

**Expected Result**: Error appears in Sentry with job details, Slack alert fires.

### Disabling SLA Monitoring

If you need to disable alerts temporarily (e.g., during maintenance):

```sql
-- Disable cron job
SELECT cron.unschedule('stuck-jobs-monitor');

-- Re-enable later
-- (Re-run the cron.schedule command above)
```

---

## Anonymous Games Cleanup

### Overview

Automated cleanup of unclaimed anonymous games older than 24 hours. This prevents storage bloat from abandoned game sessions.

**Threshold**: Games with `user_id IS NULL` and `created_at > 24 hours ago`

### Implementation

**Edge Function**: `cleanup-anonymous-games`

- **Schedule**: Every hour via pg_cron
- **Deletes**: Storage files (audio + video) and database records
- **Logging**: Reports deletion counts to Sentry

**Cleanup Logic**:

```sql
-- Find anonymous games older than 24 hours
SELECT id, audio_storage_path, video_storage_path
FROM games
WHERE user_id IS NULL
AND created_at < NOW() - INTERVAL '24 hours';
```

### Cron Job Configuration

**Production Setup** (run once after deployment):

1. Deploy Edge Function:

   ```bash
   supabase functions deploy cleanup-anonymous-games
   ```

2. Configure cron job via Supabase Dashboard or SQL Editor:

   ```sql
   SELECT cron.schedule(
     'cleanup-anonymous-games',
     '0 * * * *',  -- Every hour at minute 0
     $$
     SELECT net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-anonymous-games',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
       ),
       body := '{}'::jsonb
     ) AS request_id;
     $$
   );
   ```

3. Verify cron job is scheduled:

   ```sql
   SELECT * FROM cron.job WHERE jobname = 'cleanup-anonymous-games';
   ```

### Manual Testing

**Trigger cleanup manually**:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-anonymous-games \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json"
```

**Expected Response**:

```json
{
  "success": true,
  "deleted_count": 5,
  "storage_files_deleted": 10,
  "duration_ms": 1234,
  "threshold_hours": 24
}
```

### Monitoring

The cleanup function logs to Sentry on errors and reports metrics:

- `deleted_count`: Number of game records deleted
- `storage_files_deleted`: Number of storage files cleaned up
- `duration_ms`: Execution time

View execution history:

```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-anonymous-games')
ORDER BY start_time DESC LIMIT 10;
```

---

## Related Documentation

- [Architecture](./architecture.md) - System design and data flow
- [Deployment](./deployment.md) - CI/CD and environment setup
- [Troubleshooting](./troubleshooting.md) - Common issues and fixes
