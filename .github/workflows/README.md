# GitHub Actions Workflows

This directory contains all CI/CD workflows for the monorepo.

---

## Continuous Integration Workflows

### Frontend CI (`frontend-ci.yml`)

**Triggers**: PRs and pushes to `main` that affect `frontend/**`

**Runs**:

- Prettier format check
- ESLint linting
- Jest unit & integration tests
- Next.js production build

### Python Backend Lint PR (`python-backend-lint-pr.yml`)

**Triggers**: PRs to `main` that affect `python-backend/**`

**Runs**:

- Black format check
- Flake8 linting
- Import sorting verification

### Supabase Lint PR (`supabase-lint-pr.yml`)

**Triggers**: PRs to `main` that affect `supabase/**`

**Runs**:

- Prettier format check
- ESLint linting
- TypeScript type checking

### Desktop App CI (`desktop-ci.yml`)

**Triggers**: PRs and pushes to `main` that affect `om-desktop/**`

**Runs**:

- Prettier format check
- ESLint linting
- Vitest tests

**Note**: Desktop builds are intentionally excluded from CI to save GitHub Actions costs (macOS runners are 10x more expensive). Production builds are done locally.

### Database Checks (`database-checks.yml`)

**Triggers**: PRs to `main` that affect `supabase/migrations/**`

**Runs**:

- Migration syntax validation
- Destructive operation detection
- RLS policy verification
- Type generation status checks
- Anti-pattern detection

---

## Deployment Workflows

### Deploy Frontend Production (`deploy-vercel-production.yml`)

**Triggers**: Pushes to `main`

**Deploys**: Frontend to Vercel production environment

### Deploy Frontend Preview (`deploy-vercel-preview.yml`)

**Triggers**: PRs to `main`

**Deploys**: Frontend preview deployment on Vercel for PR testing

### Deploy Python Production (`deploy-python-production.yml`)

**Triggers**: Pushes to `main` that affect `python-backend/**`

**Deploys**: Python backend to Google Cloud Run

### Deploy Supabase Production (`deploy-supabase-production.yml`)

**Triggers**: Pushes to `main` that affect `supabase/**`

**Deploys**: Database migrations and Edge Functions to production Supabase

---

## Local Development

### Run All Checks Locally

**Recommended**: Run all PR checks locally before pushing to save GitHub Actions credits:

```bash
npm run check-pr
```

This runs comprehensive checks on:

- Frontend (Prettier, ESLint, tests, build)
- Python (Black, Flake8, pytest)
- Supabase (Prettier, ESLint, TypeScript, Edge Function tests)
- Desktop (Prettier, ESLint, Vitest tests)
- Migrations (syntax, destructive ops, RLS, types, anti-patterns)

### Individual Workspace Checks

```bash
# Frontend
npm run lint:frontend
npm run test:frontend
npm run build:frontend

# Desktop
npm run lint:desktop
npm run test:desktop

# Python (requires venv)
cd python-backend && source venv/bin/activate
black --check .
flake8 .
pytest

# Supabase
npm run lint:backend
deno test supabase/functions/**/*.test.ts
```

---

## Benefits

- ⚡ **Fast**: Path filters ensure only relevant checks run
- 🎯 **Focused**: Feedback only on code you modified
- 🔄 **Consistent**: Same standards across all workspaces
- 💰 **Cost-effective**: Desktop builds excluded from CI
- 🛡️ **Safe**: Database checks prevent destructive operations
