# Database

Database schema, patterns, and migration workflows for Meeting Intelligence Assistant.

---

## Table of Contents

- [Schema Overview](#schema-overview)
- [Core Tables](#core-tables)
- [Row Level Security](#row-level-security)
- [Migration Workflow](#migration-workflow)
- [Database Operations](#database-operations)
- [Type Generation](#type-generation)
- [Best Practices](#best-practices)
- [Disaster Recovery](#disaster-recovery)

---

## Schema Overview

The database follows a simple single-tenant architecture with Row Level Security (RLS) to ensure data isolation between users.

**Database Provider**: Supabase (PostgreSQL)

**Key Principles**:

- All data scoped to individual users via `user_id`
- RLS policies enforce user isolation
- Migrations are the source of truth
- Types auto-generated from schema

---

## Core Tables

### users

Stores user profile information.

**Columns**:

- `id` (uuid, primary key) - Matches `auth.uid()` from Supabase Auth
- `email` (text, unique)
- `full_name` (text)
- `avatar_url` (text, nullable)
- `username` (text, nullable) - Reserved for future use
- `first_login_completed` (boolean) - Tracks onboarding status
- `has_active_subscription` (boolean) - Subscription flag
- `subscription_status` (text, nullable) - Stripe subscription status
- `trial_used` (boolean) - Trial eligibility flag
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**RLS Policy**: Users can only read/update their own record (`id = auth.uid()`)

**Automatic Creation**: Database trigger `handle_new_user()` automatically creates user record when signup occurs in `auth.users`.

### meetings

Stores meeting metadata and recording information.

**Columns**:

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key → users.id)
- `title` (text) - Meeting title
- `start_time` (timestamptz) - Meeting start time
- `end_time` (timestamptz, nullable) - Meeting end time
- `description` (text, nullable) - Meeting description
- `meeting_link` (text, nullable) - Meeting URL
- `meeting_type` (enum) - Type of meeting (one_on_one, small_group, etc.)
- `participant_count` (integer, nullable) - Number of participants
- `user_role` (enum) - User's role in meeting (presenter, participant, etc.)
- `attendees` (jsonb, nullable) - Meeting attendees from calendar lookup
- **Recording metadata**:
  - `recording_filename` (text, nullable)
  - `audio_storage_path` (text, nullable) - Supabase Storage path to audio file
  - `recording_size_mb` (numeric, nullable)
  - `recording_duration_seconds` (integer, nullable)
  - `recording_available_until` (timestamptz, nullable) - Auto-delete after 7 days
- **Transcript data**:
  - `ai_transcript` (jsonb, nullable) - AssemblyAI/Whisper transcript
  - `transcript_metadata` (jsonb, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**RLS Policy**: Users can only access meetings where `user_id = auth.uid()`

**Database Trigger**: `on_meeting_recording_added` creates processing job when `audio_storage_path` is set

### processing_jobs

Tracks video/audio processing status for meeting recordings.

**Columns**:

- `id` (uuid, primary key)
- `meeting_id` (uuid, foreign key → meetings.id)
- `status` (text) - `pending`, `processing`, `completed`, `failed`
- `processing_error` (text, nullable) - Error message if failed
- `processing_type` (enum) - `initial`, `retry`
- `triggered_by` (enum) - `auto`, `manual`
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Status Flow**:

```
pending → processing → completed/failed
```

**RLS Policy**: Users can only access jobs for their meetings

**Auto-Creation**: Trigger on `meetings.audio_storage_path` set creates processing job automatically

### meeting_analysis

Stores AI-generated analysis results.

**Columns**:

- `id` (uuid, primary key)
- `job_id` (uuid, foreign key → processing_jobs.id, unique)
- `user_id` (uuid, foreign key → users.id)
- `transcript` (jsonb) - Full transcript with timestamps and speakers
- `summary` (text) - AI-generated summary
- `speaker_stats` (jsonb) - Talk time, word count, percentages per speaker
- `communication_metrics` (jsonb) - 13 metrics + overall score
- `behavioral_insights` (jsonb, nullable) - Optional video analysis
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Relationship**: One-to-one with `processing_jobs` (via `job_id`)

**RLS Policy**: Users can only access analysis where `user_id = auth.uid()`

**JSONB Structure Examples**:

**transcript**:

```json
{
  "text": "Full transcript...",
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "text": "Hello everyone",
      "speaker": "SPEAKER_00"
    }
  ]
}
```

**speaker_stats**:

```json
{
  "SPEAKER_00": {
    "total_time": 120.5,
    "word_count": 350,
    "segments": 15,
    "percentage": 45.2
  }
}
```

**communication_metrics**:

```json
{
  "clarity": 78,
  "empathy": 82,
  "confidence": 75,
  "collaboration": 85,
  "leadership": 70,
  "listening": 80,
  "engagement": 88,
  "assertiveness": 72,
  "adaptability": 76,
  "influence": 74,
  "authenticity": 79,
  "emotional_intelligence": 81,
  "decision_making": 73,
  "overall_score": 77
}
```

### subscriptions

Stores Stripe subscription data.

**Columns**:

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key → users.id, unique)
- `stripe_customer_id` (text, unique)
- `stripe_subscription_id` (text, unique)
- `stripe_price_id` (text)
- `plan_type` (text) - `monthly` or `annual`
- `status` (text) - `trialing`, `active`, `canceled`, `past_due`, etc.
- `trial_start` (timestamptz, nullable)
- `trial_end` (timestamptz, nullable)
- `current_period_start` (timestamptz)
- `current_period_end` (timestamptz)
- `cancel_at_period_end` (boolean)
- `canceled_at` (timestamptz, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**RLS Policy**: Users can only access their own subscription (`user_id = auth.uid()`)

**Sync**: Automatically kept in sync with Stripe via webhooks

### payment_history

Immutable audit log of all payment attempts.

**Columns**:

- `id` (uuid, primary key)
- `user_id` (uuid, foreign key → users.id)
- `stripe_invoice_id` (text, unique)
- `stripe_payment_intent_id` (text)
- `amount` (integer) - Amount in cents
- `currency` (text)
- `status` (text) - `succeeded`, `failed`, `pending`
- `payment_date` (timestamptz)
- `created_at` (timestamptz)

**RLS Policy**: Users can only view their own payment history

**Use Case**: Billing history, refund tracking, dispute resolution

---

## Row Level Security

All tables have RLS enabled. Users can only access their own data.

### Policy Pattern

**Select Policy**:

```sql
CREATE POLICY "Users can read own data"
ON table_name FOR SELECT
USING (user_id = auth.uid());
```

**Insert Policy**:

```sql
CREATE POLICY "Users can insert own data"
ON table_name FOR INSERT
WITH CHECK (user_id = auth.uid());
```

**Update Policy**:

```sql
CREATE POLICY "Users can update own data"
ON table_name FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

**Delete Policy**:

```sql
CREATE POLICY "Users can delete own data"
ON table_name FOR DELETE
USING (user_id = auth.uid());
```

### Service Role Key

The Python backend uses the service role key to **bypass RLS** for performance. This is safe because:

1. Only Edge Functions can call Python backend (API key protected)
2. Edge Functions are server-side and validate user authentication
3. Python backend includes `user_id` in all database writes

**Never use service role key in frontend** - it would allow users to access all data.

---

## Migration Workflow

### Local Development (Safe Zone)

**1. Start local Supabase**:

```bash
supabase start
```

**2. Create migration**:

```bash
supabase migration new add_feature_name
```

**3. Write SQL** in generated migration file:

```
supabase/migrations/TIMESTAMP_add_feature_name.sql
```

**4. Review migration** carefully for safety issues:

- Avoid `DROP TABLE` unless absolutely necessary
- Use `IF NOT EXISTS` for idempotent operations
- Consider `ALTER TABLE ... ADD COLUMN ... DEFAULT` for safe additions
- Verify RLS policies are included

**5. Test locally**:

```bash
supabase stop && supabase start
```

This applies the new migration to your existing local database (migrations auto-apply on start).

**6. Verify in Supabase Studio**:

```
http://localhost:54323
```

### Deploying to Production (Automated)

**7. Generate types from local DB and sync to frontend**:

```bash
npm run db:types:sync
```

**8. Commit migration and types**:

```bash
git add supabase/migrations/*.sql supabase/database.types.ts frontend/supabase/database.types.ts
git commit -m "Add migration for feature X"
```

**9. Push to GitHub and create PR**

**10. CI validates migration** (`database-checks.yml` workflow):

- Migration syntax validation
- Destructive operation detection
- RLS policy verification
- Type generation status check
- Anti-pattern detection (missing user_id, etc.)

**11. Merge to `production` branch**

**12. GitHub Actions automatically runs `supabase db push`** via `.github/workflows/deploy-supabase-production.yml`

### CRITICAL Safety Rules

- ⛔ **NEVER run `supabase db push` directly!** Always use `./scripts/safe-db-push.sh` if you must push.
- ⛔ **NEVER run `supabase db reset` unless you want to lose all local data!** Test migrations incrementally instead.
- ✅ Migrations are automatically deployed via GitHub Actions
- ✅ Generate TypeScript types locally from your tested database using `supabase gen types typescript --local`
- ✅ Commit both migration files AND generated types together before creating PR
- ✅ Test migrations incrementally by restarting local Supabase (migrations auto-apply on start)
- ⛔ NEVER run manual SQL statements in Supabase SQL Editor - always use migrations
- ✅ Use `supabase migration repair` if history gets out of sync

---

## Database Operations

### Using Supabase CLI

**All database operations use the Supabase CLI**:

```bash
# Schema Operations
supabase db pull                    # Download current schema from remote
supabase db diff -f <name>          # Create migration from local changes
supabase db push                    # Apply migrations to remote database
supabase migration new <name>       # Create new empty migration file

# Local Supabase Development
supabase start                      # Start local Supabase (Studio at http://localhost:54323)
supabase stop                       # Stop local services
supabase db reset                   # Reset local database (⚠️ DESTRUCTIVE)
supabase status                     # Check service status

# Checking Migrations
supabase migration list --local     # List local migrations (ALWAYS use --local during development!)

# Utilities
supabase gen types typescript --local > supabase/database.types.ts  # Generate types from LOCAL schema
```

**IMPORTANT**: Docker Desktop must be running for `supabase db pull` and local Supabase operations.

### Always Use --local Flag

- ⚠️ **ALWAYS use `--local` flag** when checking migrations or generating types during development
- ⚠️ Commands like `supabase migration list` default to remote database if `--local` is omitted
- ⚠️ Use `supabase gen types typescript --local` to generate types from your LOCAL database
- ✅ Safe: `supabase migration list --local`
- ❌ Dangerous: `supabase migration list` (queries remote/production database)

---

## Type Generation

### Generated Types

All database types are auto-generated from the schema:

**Location**: `supabase/database.types.ts`

**Usage**:

```typescript
import type { Database } from '@/supabase/database.types';

type Subscription = Database['public']['Tables']['subscriptions']['Row'];
type SubscriptionInsert =
  Database['public']['Tables']['subscriptions']['Insert'];
type SubscriptionUpdate =
  Database['public']['Tables']['subscriptions']['Update'];
```

### Generation Commands

**Local development** (regenerate after schema changes):

```bash
# Generate types from local DB and sync to frontend (recommended)
npm run db:types:sync

# OR manually:
# 1. Generate types from local database
supabase gen types typescript --local > supabase/database.types.ts

# 2. Sync to frontend (required for monorepo builds)
cp supabase/database.types.ts frontend/supabase/database.types.ts
```

**Production/CI** (for type checking):

```bash
supabase gen types typescript --project-id=YOUR_PROJECT_ID > supabase/database.types.ts
```

**When to regenerate**:

- After creating a new migration locally
- After applying migrations locally (restart Supabase)
- Before committing schema changes

**Important**: The frontend maintains a copy of `database.types.ts` for standalone builds (CI/Vercel). Always run `npm run db:types:sync` after generating types to keep both copies in sync.

---

## Best Practices

### 1. Always Include user_id

Every table that stores user-specific data must have a `user_id` column with RLS policies.

**Anti-pattern**:

```sql
CREATE TABLE meeting_notes (
  id uuid PRIMARY KEY,
  note text
  -- Missing user_id!
);
```

**Correct**:

```sql
CREATE TABLE meeting_notes (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) NOT NULL,
  note text
);

-- Enable RLS
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;

-- Add policy
CREATE POLICY "Users can read own notes"
ON meeting_notes FOR SELECT
USING (user_id = auth.uid());
```

### 2. Use Timestamptz

Always use `timestamptz` (timestamp with timezone) for date/time columns:

```sql
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### 3. Use JSONB for Flexible Data

For AI-generated content or variable structure data, use JSONB:

```sql
analysis_results jsonb
```

**Benefits**:

- Flexible schema
- Queryable with GIN indexes
- Efficient storage

### 4. Idempotent Migrations

Write migrations that can be run multiple times safely:

```sql
-- Good: Idempotent
CREATE TABLE IF NOT EXISTS new_table (
  id uuid PRIMARY KEY
);

ALTER TABLE existing_table
ADD COLUMN IF NOT EXISTS new_column text;

-- Bad: Not idempotent
CREATE TABLE new_table (
  id uuid PRIMARY KEY
);  -- Fails if table exists
```

### 5. Test Migrations Locally First

**Never push untested migrations to production**.

1. Create migration locally
2. Test by restarting Supabase (`supabase stop && supabase start`)
3. Verify in Studio (http://localhost:54323)
4. Test application functionality
5. Only then commit and deploy

### 6. Foreign Key Constraints

Always use foreign key constraints for referential integrity:

```sql
job_id uuid REFERENCES processing_jobs(id) ON DELETE CASCADE
user_id uuid REFERENCES users(id) ON DELETE CASCADE
```

**ON DELETE CASCADE** ensures cleanup when parent records are deleted.

### 7. Unique Constraints

Use unique constraints to prevent duplicates:

```sql
-- One subscription per user
ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);

-- One analysis per job
ALTER TABLE meeting_analysis
ADD CONSTRAINT meeting_analysis_job_id_unique UNIQUE (job_id);
```

---

## Common Operations

### Query Subscription Status

```sql
SELECT
  u.email,
  s.status,
  s.plan_type,
  s.current_period_end,
  s.cancel_at_period_end
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
WHERE u.id = 'user-uuid-here';
```

### View Processing Jobs

```sql
SELECT
  id,
  file_name,
  status,
  processing_error,
  created_at
FROM processing_jobs
WHERE user_id = 'user-uuid-here'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Payment History

```sql
SELECT
  payment_date,
  amount / 100.0 as amount_usd,
  status,
  stripe_invoice_id
FROM payment_history
WHERE user_id = 'user-uuid-here'
ORDER BY payment_date DESC;
```

---

## Troubleshooting

### Migration Out of Sync

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

### RLS Policy Issues

**Error**: `new row violates row-level security policy`

**Debug**:

1. Check if RLS is enabled: `SELECT * FROM pg_tables WHERE tablename = 'your_table'`
2. List policies: `SELECT * FROM pg_policies WHERE tablename = 'your_table'`
3. Verify user authentication: `SELECT auth.uid()` returns current user ID
4. Check policy conditions match your use case

**Common fix**:

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

## Disaster Recovery

For database backup, restoration, and disaster recovery procedures, see **[Disaster Recovery Guide](./disaster-recovery.md)**.

Daily automated backups are enabled in production with 7-day retention. All critical tables (users, meetings, subscriptions, etc.) are protected.

---

## Resources

- [Disaster Recovery Guide](./disaster-recovery.md) - Backup strategy and restoration procedures
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Migration Best Practices](https://supabase.com/docs/guides/cli/local-development#database-migrations)
