# Supabase PR Review Guidelines

PostgreSQL + Edge Functions (Deno) + RLS + Database Triggers

## Critical Checks - Migrations

**Safety:**

- No destructive operations without confirmation: `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER COLUMN TYPE`
- Descriptive filename (not generic)

**Schema:**

- RLS enabled on all tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- RLS policies for all operations (SELECT, INSERT, UPDATE, DELETE)
- `user_id` column on all user-scoped tables
- `user_id` references `auth.users(id) ON DELETE CASCADE`
- UUID primary keys with `gen_random_uuid()`
- JSONB for flexible/AI-generated content
- Foreign key constraints defined
- Indexes for frequently queried columns
- Types updated: `supabase gen types typescript --project-id=YOUR_PROJECT_ID > supabase/database.types.ts`

**RLS Policies:**

- Use `auth.uid()` to isolate user data
- Cover all operations (SELECT, INSERT, UPDATE, DELETE)
- No overly permissive policies: `USING (true)` is wrong

## Critical Checks - Edge Functions

**Structure:**

- TypeScript with strict types
- CORS configuration
- Authentication verification (JWT or service role key)
- Error handling with proper HTTP status codes
- Environment variables from `Deno.env`
- No hardcoded secrets
- Idempotent operations

**Supabase Client:**

- Use service role key (not anon key) for operations that bypass RLS
- Generate signed URLs for secure file access

## Common Anti-Patterns

❌ **Missing RLS Policies**

```sql
-- WRONG - Table without RLS
CREATE TABLE public.sensitive_data (
    id UUID PRIMARY KEY,
    user_id UUID,
    secret TEXT
);
-- Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- Missing: CREATE POLICY statements
```

❌ **Destructive Migration Without Safety**

```sql
-- WRONG - No data migration
ALTER TABLE public.users DROP COLUMN username;
```

❌ **Using Anon Key in Edge Functions**

```typescript
// WRONG - Should use service role key
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')! // Limited permissions
);
await supabase.from('processing_jobs').update({ status: 'processing' });
```

❌ **No Foreign Key Constraints**

```sql
-- WRONG - Orphaned records possible
CREATE TABLE public.meeting_analysis (
    id UUID PRIMARY KEY,
    job_id UUID,  -- No foreign key!
    user_id UUID  -- No foreign key!
);
```

❌ **Overly Permissive RLS Policy**

```sql
-- WRONG - Anyone can access any data
CREATE POLICY "Allow all"
    ON public.processing_jobs
    FOR ALL
    USING (true);
```

❌ **Hardcoded Secrets**

```typescript
// WRONG - Secret in code
const apiKey = 'sk-1234567890abcdef';

// ✅ Good
const apiKey = Deno.env.get('PYTHON_BACKEND_API_KEY')!;
```

## Good Migration Example

```sql
BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS public.new_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users view own data"
    ON public.new_table FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own data"
    ON public.new_table FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX idx_new_table_user_id ON public.new_table(user_id);

COMMIT;
```

## Migration Workflow (Golden Path)

**Local Development:**

1. `supabase start` - Local instance running
2. Make schema changes locally
3. `supabase db diff -f descriptive_name` - Generate migration
4. Review SQL for safety issues
5. `supabase stop && supabase start` - Test by applying migration to existing DB
6. Verify in Supabase Studio - Check schema changes applied correctly

**Deploying to Production:**

1. `git add supabase/migrations/*.sql && git commit` - Commit migration
2. Push to GitHub and create PR - CI validates migration
3. Merge to `production` branch - GitHub Actions auto-deploys

**CRITICAL SAFETY RULES:**

- ⛔ **NEVER run `supabase db push` directly!** Always use `./scripts/safe-db-push.sh` if needed.
- ⛔ **NEVER run `supabase db reset` unless you want to lose all data!** Test incrementally instead.
- ✅ Production migrations deploy automatically via GitHub Actions when merged to `production` branch.

**For AI Assistants (Claude Code, etc.):** Never suggest or execute `supabase db push` directly. Migrations deploy via GitHub Actions.

## Trigger Pattern

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        RETURN NEW;
END;
$$;
```

## Security Focus

- No RLS bypass without justification
- No SQL injection vectors
- API keys/secrets not hardcoded
- User data isolated by `user_id`
- Service role key only in trusted contexts (Edge Functions, Python backend)
- Storage policies prevent cross-user access

## Quality Commands

```bash
npm run lint:backend
npm run format:check
grep -E "(DROP|TRUNCATE|ALTER.*DROP)" supabase/migrations/*.sql
```
