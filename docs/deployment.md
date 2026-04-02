# Deployment

Deployment workflows, environments, and CI/CD automation for Meeting Intelligence Assistant.

---

## Table of Contents

- [Overview](#overview)
- [Environments](#environments)
- [GitHub Workflows](#github-workflows)
- [Deployment Triggers](#deployment-triggers)
- [Environment Configuration](#environment-configuration)
- [Deployment Procedures](#deployment-procedures)
- [Rollback Strategy](#rollback-strategy)
- [Disaster Recovery](#disaster-recovery)
- [Security](#security)

---

## Overview

**Deployment Strategy**: Simple two-environment setup (Local + Production) with automated CI/CD via GitHub Actions.

**Key Decision**: Vercel PR previews use production backend infrastructure for testing. No separate staging environment to reduce complexity.

### Deployment Flow

```
Feature Branch (local dev)
    ↓
    PR → production branch (Vercel preview + production backend)
    ↓
    Merge to production
    ↓
    Auto-deploy ALL SERVICES to PRODUCTION
    - Supabase (migrations + Edge Functions)
    - Python Backend (Cloud Run)
    - Frontend (Vercel)
```

---

## Environments

### Local Development

| Component       | Location     | URL                    |
| --------------- | ------------ | ---------------------- |
| Frontend        | Local        | http://localhost:3000  |
| Supabase        | Docker       | http://localhost:54321 |
| Supabase Studio | Docker       | http://localhost:54323 |
| Python Backend  | Local/Docker | http://localhost:8000  |

**Starting Services**:

```bash
npm start  # Starts all services (frontend, Supabase, Python backend, Stripe)
```

### Production

| Component      | Platform         | URL                         |
| -------------- | ---------------- | --------------------------- |
| Frontend       | Vercel           | https://your-app.vercel.app |
| Supabase       | Supabase Cloud   | https://xxx.supabase.co     |
| Python Backend | Google Cloud Run | https://xxx.run.app         |

**Supabase Project ID**: `YOUR_PROJECT_ID` (for reference)

---

## GitHub Workflows

### 1. Frontend Workflows

**Lint & Test** (`.github/workflows/frontend-lint-pr.yml`)

- **Triggers**: PRs to `main` and `production`, changes to `frontend/**`
- **Jobs**:
  - Formatting check (Prettier)
  - Linting (ESLint)
  - Test suite (Jest)
  - Build verification

**Preview Deployment** (`.github/workflows/deploy-vercel-preview.yml`)

- **Triggers**: PRs to `production`, changes to `frontend/**`
- **Jobs**:
  - Build and deploy to Vercel preview environment
  - Post preview URL as PR comment
- **Uses Production Backend**: Preview environments connect to production Supabase and Python backend

**Production Deployment** (`.github/workflows/deploy-vercel-production.yml`)

- **Triggers**: Push to `production`, changes to `frontend/**`
- **Jobs**:
  - Build and deploy to Vercel production
  - Automatic deployment via Vercel GitHub integration

### 2. Python Backend Workflows

**Lint** (`.github/workflows/python-backend-lint-pr.yml`)

- **Triggers**: PRs to `main` and `production`, changes to `python-backend/**`
- **Jobs**:
  - Linting with flake8 (PEP 8 compliance)
  - Code quality checks

**Production Deployment** (`.github/workflows/deploy-python-production.yml`)

- **Triggers**: Push to `production`, changes to `python-backend/**`
- **Jobs**:
  - Build Docker image via Google Cloud Build
  - Push image to Google Container Registry
  - Deploy to Cloud Run production service
  - Configure environment variables from Google Secret Manager

### 3. Supabase Workflows

**Lint** (`.github/workflows/supabase-lint-pr.yml`)

- **Triggers**: PRs to `main` and `production`, changes to `supabase/**`
- **Jobs**:
  - Formatting check (Prettier)
  - Linting (ESLint for Edge Functions)

**Database Checks** (`.github/workflows/database-checks.yml`)

- **Triggers**: PRs to `main` and `production`, changes to `supabase/migrations/**`
- **Jobs**:
  - Migration syntax validation
  - Destructive operation detection (DROP TABLE, DROP COLUMN, TRUNCATE)
  - RLS policy verification on new tables
  - Type generation status check
  - Anti-pattern detection (missing user_id, etc.)

**Production Deployment** (`.github/workflows/deploy-supabase-production.yml`)

- **Triggers**: Push to `production`, changes to `supabase/**`
- **Jobs**:
  - Run migrations via `./scripts/safe-db-push.sh` (with safety checks)
  - Deploy Edge Functions via `supabase functions deploy`
  - Generate and commit TypeScript types from production DB (backup)

### 4. PR Review Workflow

**Claude Code Review** (`.github/workflows/claude.yml`)

- **Triggers**: PR comments mentioning `@claude`
- **Model**: Claude Haiku 4.5 (cost-effective and fast)
- **Jobs**:
  - Analyzes PR changes
  - Provides structured code review (quality, security, architecture, testing)
  - Posts detailed feedback as PR comment
- **Large PR Handling**: For PRs >2000 lines, focuses on critical files only (migrations, auth, middleware)

---

## Deployment Triggers

### Automatic Deployments

| Service        | Trigger                                       | Workflow File                    |
| -------------- | --------------------------------------------- | -------------------------------- |
| Frontend       | Merge to `production` + `frontend/**` changes | `deploy-vercel-production.yml`   |
| Python Backend | Merge to `production` + `python-backend/**`   | `deploy-python-production.yml`   |
| Supabase       | Merge to `production` + `supabase/**`         | `deploy-supabase-production.yml` |

### Manual Deployments

**Python Backend** (if needed):

```bash
cd python-backend
./deploy.sh  # Interactive deployment script
```

**Supabase Edge Functions** (if needed):

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy process-meeting
```

---

## Environment Configuration

### GitHub Secrets Required

Add these to repository settings (Settings → Secrets and variables → Actions):

**Supabase**:

- `SUPABASE_ACCESS_TOKEN` - Get from Supabase Dashboard → Account → Access Tokens
- `SUPABASE_PROJECT_ID` - `YOUR_PROJECT_ID`
- `SUPABASE_DB_PASSWORD` - Get from Supabase Dashboard → Settings → Database

**Google Cloud**:

- `GCP_PROJECT_ID` - Your GCP project ID
- `GCP_SERVICE_ACCOUNT_KEY` - Service account JSON key for deployments

**Vercel**:

- `VERCEL_TOKEN` - Vercel authentication token (generate at https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` - Organization ID from `.vercel/project.json`
- `VERCEL_PROJECT_ID` - Project ID from `.vercel/project.json`

**Claude Code** (for PR reviews):

- `ANTHROPIC_API_KEY` - Your Anthropic API key

### Google Cloud Secret Manager

Python backend secrets stored in Google Secret Manager:

- `supabase-url`
- `supabase-service-role-key`
- `gemini-api-key`
- `assemblyai-api-key`
- `python-backend-api-key`

**Access**:

```bash
# List secrets
gcloud secrets list

# View secret value
gcloud secrets versions access latest --secret="gemini-api-key"

# Add new secret
gcloud secrets create secret-name --data-file=-
# (then paste value and Ctrl+D)
```

### Supabase Edge Function Secrets

Configure in Supabase Dashboard → Edge Functions → Secrets:

- `PYTHON_BACKEND_URL` - Cloud Run service URL
- `PYTHON_BACKEND_API_KEY` - Must match Python backend API key

### Vercel Environment Variables

Configure in Vercel Dashboard → Project → Settings → Environment Variables:

**Supabase** (Production):

- `NEXT_PUBLIC_SUPABASE_URL_PRODUCTION` - Production Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_PRODUCTION` - Production anonymous key
- `NEXT_PUBLIC_SUPABASE_ENV` - Set to `production`
- `SUPABASE_SERVICE_ROLE_KEY` - Production service role key (for API routes)
- `PYTHON_BACKEND_URL` - Cloud Run backend URL

**Stripe**:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `STRIPE_SECRET_KEY` - Stripe secret key (server-side only)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID` - Monthly subscription price ID
- `NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID` - Annual subscription price ID
- `NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID` - Internal team coupon ID

**Analytics** (PostHog):

- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST` - PostHog host URL (default: https://us.i.posthog.com)

**Customer Communication** (Intercom):

- `NEXT_PUBLIC_INTERCOM_APP_ID` - Intercom app identifier
- `INTERCOM_IDENTITY_VERIFICATION_SECRET` - JWT signing secret (server-side only)

**OAuth Providers** (Optional):

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret (server-side only)
- `NEXT_PUBLIC_MICROSOFT_CLIENT_ID` - Microsoft OAuth client ID
- `MICROSOFT_CLIENT_SECRET` - Microsoft OAuth secret (server-side only)

**Important**: After adding/updating environment variables, trigger a redeploy from the Vercel dashboard.

---

## Deployment Procedures

### Deploying a New Feature

**1. Develop Locally**:

```bash
git checkout -b feature/your-feature-name
# Make changes
npm run lint
npm run format
npm test
npm run build:frontend
```

**2. Create PR**:

```bash
git push origin feature/your-feature-name
# Create PR on GitHub
```

**3. CI Validation**:

- All linting and tests must pass
- Database checks validate migrations (if any)
- Vercel creates preview deployment

**4. Code Review**:

- Request review from team
- Optionally mention `@claude` for automated review

**5. Merge to Production**:

```bash
# After approval, merge PR
# GitHub Actions automatically deploys changed services
```

### Deploying Database Migrations

**Creating migrations**: See [database.md](database.md#migration-workflow) for the complete workflow on creating and testing migrations locally.

**Automated Deployment**:

1. **Create PR** with migration and types
2. **CI validates** migration safety (via `database-checks.yml`)
3. **Merge to production** branch
4. **GitHub Actions automatically runs** `supabase db push` (via `deploy-supabase-production.yml`)

**Safety Mechanisms**:

- Multi-layer protection prevents manual production pushes
- CI checks for destructive operations, RLS policies, and syntax errors
- Safe migration script blocks non-CI execution
- Migrations only deploy through reviewed PRs

### Deploying Python Backend

**Via GitHub Actions** (recommended):

```bash
# Merge changes to production branch
# Workflow automatically deploys to Cloud Run
```

**Manual Deployment** (if needed):

```bash
cd python-backend
./deploy.sh

# Or using gcloud directly
gcloud run deploy meeting-intelligence-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### Deploying Edge Functions

**Via GitHub Actions** (automatic):

```bash
# Merge changes to production branch
# Workflow automatically deploys functions
```

**Manual Deployment** (if needed):

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy process-meeting
```

---

## Rollback Strategy

### Frontend (Vercel)

**Via Vercel Dashboard**:

1. Go to Deployments
2. Find previous successful deployment
3. Click "..." → "Promote to Production"

**Via CLI**:

```bash
vercel rollback
```

### Python Backend (Cloud Run)

**Cloud Run keeps previous revisions**:

**Via GCP Console**:

1. Cloud Run → meeting-intelligence-backend
2. Revisions tab
3. Select previous revision → "Manage Traffic"
4. Route 100% traffic to previous revision

**Via CLI**:

```bash
# List revisions
gcloud run revisions list --service=meeting-intelligence-backend --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic meeting-intelligence-backend \
  --to-revisions=<previous-revision>=100 \
  --region us-central1
```

### Database Migrations

**Migrations are immutable once deployed**:

- To rollback: Create a new "down" migration that reverts changes
- Test rollback migration locally before deploying
- Example:

  ```sql
  -- Original migration: add column
  ALTER TABLE users ADD COLUMN new_field text;

  -- Rollback migration: remove column
  ALTER TABLE users DROP COLUMN new_field;
  ```

### Edge Functions

**Supabase keeps function version history**:

- Manual rollback by redeploying previous version from git
- Example:
  ```bash
  git checkout <previous-commit> -- supabase/functions/
  supabase functions deploy
  git checkout main  # Return to latest
  ```

---

## Disaster Recovery

For catastrophic failures, data loss, or database restoration procedures, see the **[Disaster Recovery Guide](./disaster-recovery.md)**.

**Quick Links**:

- [Database Backup Configuration](./disaster-recovery.md#current-backup-configuration)
- [Data Restoration Procedures](./disaster-recovery.md#recovery-procedures)
- [Critical Data Inventory](./disaster-recovery.md#critical-data-inventory)
- [Incident Response](./disaster-recovery.md#incident-response)

**Key Facts**:

- ✅ Daily automated backups enabled (7-day retention)
- ⚠️ RPO: 24 hours (time since last backup)
- ⏱️ RTO: 2 hours (target recovery time)
- 🔐 2 organization owners can restore backups

---

## Security

### Multi-Layer Production Protection

**Layer 1: GitHub Branch Protection**

- Configure branch protection on `production` branch
- Require PR reviews before merging
- Require CI checks to pass
- Prevent direct pushes to production

**Layer 2: GitHub Actions Only**

- `SUPABASE_ACCESS_TOKEN` secret only available in CI
- Developers should NOT have this token locally
- Use `supabase logout` to ensure no local authentication

**Layer 3: Safe Migration Script**

- `scripts/safe-db-push.sh` blocks non-CI execution
- Verifies running in CI environment ($CI variable)
- Verifies on production branch
- Fails fast with clear error messages

**Layer 4: Supabase Organization Permissions** (Recommended)

- Set member roles to "Developer" (not "Owner") for most team members
- Only CI/CD service account should have Owner access
- Developers can view production, but cannot push migrations manually

**Result**: Even if a developer is logged in locally, they physically cannot push to production without proper permissions.

### Secret Management

**Best Practices**:

1. **API Keys**: Never commit API keys or secrets to git
2. **Rotation**: Plan for regular rotation of API keys and service account keys
3. **Access Control**: Limit who can push to `production` branch
4. **Service Account**: Use minimum required permissions for GCP service account
5. **Environment Variables**: Use `NEXT_PUBLIC_` prefix only for truly public values

---

## Monitoring & Observability

### Production Logs

**Supabase**:

- Dashboard → Logs → API/Database/Edge Functions

**Cloud Run**:

```bash
# View recent logs
gcloud run services logs read meeting-intelligence-backend \
  --region us-central1 \
  --limit 100

# Follow logs in real-time
gcloud run services logs tail meeting-intelligence-backend \
  --region us-central1
```

**Vercel**:

- Vercel Dashboard → Deployments → [production deployment] → Logs

### Key Metrics to Monitor

**Application**:

- Processing job success rate
- Average processing time
- Error rate by service
- API response times

**Infrastructure**:

- Cloud Run instance count
- Memory and CPU usage
- Database connection pool usage
- Storage usage

**Costs**:

- AI API costs (Gemini, AssemblyAI)
- Cloud Run compute costs
- Supabase usage
- Vercel bandwidth

---

## Troubleshooting Deployments

### Frontend Build Fails

**Check**:

1. Lint errors: `npm run lint:frontend`
2. Type errors: `npm run build:frontend`
3. Test failures: `npm run test:frontend`
4. Environment variables in Vercel settings

### Python Backend Deploy Fails

**Check**:

1. Docker build logs in GCP Console → Cloud Build
2. Secrets configured in Secret Manager
3. Service account permissions
4. Requirements.txt dependencies

### Supabase Migration Fails

**Check**:

1. Migration syntax: `supabase migration list --local`
2. Conflicting migrations
3. Missing RLS policies
4. Destructive operations without proper checks

### Edge Function Deploy Fails

**Check**:

1. Deno compatibility (Edge Functions use Deno, not Node.js)
2. Import paths (use `https://` imports for Deno)
3. Secrets configured in Supabase Dashboard
4. Function timeout settings

---

## Resources

- [Vercel Deployment Docs](https://vercel.com/docs/deployments)
- [Cloud Run Deployment Guide](https://cloud.google.com/run/docs/deploying)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
