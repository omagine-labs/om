# Contributing

Guidelines for contributing to Meeting Intelligence Assistant.

---

## Before Submitting a PR

### 1. Run Quality Checks

**Recommended**: Run all PR checks locally to catch issues before pushing and save GitHub Actions credits:

```bash
npm run check-pr
```

This comprehensive check runs:

- **Frontend**: Prettier formatting, ESLint linting, Jest tests, Next.js build
- **Python Backend**: Black formatting, Flake8 linting, pytest with coverage
- **Supabase**: Prettier formatting, ESLint linting, TypeScript type checking, Edge Function tests
- **Desktop App**: Prettier formatting, ESLint linting, Vitest tests
- **Database Migrations**: Syntax validation, destructive operation detection, RLS policy verification, type generation status, anti-pattern detection

**Interactive Auto-Fix**: When formatting or linting issues are detected, the script will prompt you to auto-fix them. Just answer `y` to automatically fix issues with Prettier, Black, and ESLint.

**Individual checks** (if you prefer granular control):

```bash
# Linting
npm run lint

# Formatting
npm run format

# Tests
npm test

# Build verification
npm run build:frontend
```

All checks must pass locally before pushing.

### 2. Update Documentation

- Update README.md if you add new features or change setup
- Update API documentation for new endpoints
- Add JSDoc comments for public functions
- Update this guide if you change workflows

### 3. Write Clear Commit Messages

**Format**: `<type>: <description>`

**Types**:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

**Examples**:

```bash
feat: add speaker diarization to analysis
fix: resolve subscription cancellation bug
docs: update Stripe integration guide
refactor: extract payment logic into helper functions
test: add integration tests for webhooks
```

### 4. Request Automated Review

Comment `@claude` on your PR to trigger automated code review via Claude Haiku 4.5.

**Review Coverage**:

- Code quality
- Security (RLS, secrets, auth)
- Database changes (migrations, types)
- Architecture patterns
- Testing coverage
- Performance considerations

---

## Code Style

### TypeScript/JavaScript

- Follow ESLint configuration
- Use TypeScript strict mode
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Add type annotations for function parameters and return values

**Imports**:

```typescript
// Type imports
import type { Database } from '@/supabase/database.types';

// Regular imports
import { createClient } from '@/lib/supabase';
```

**Naming Conventions**:

- Components: PascalCase (`FileUploadZone`)
- Functions: camelCase (`processUpload`)
- Constants: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- Files: kebab-case (`file-upload-zone.tsx`)

### Python

- Follow PEP 8 style guide
- Use type hints on all function signatures
- Add docstrings for public functions
- Use logging (not print statements)
- Specific exception types (not bare `except`)

**Example**:

```python
async def process_meeting(job_id: str, signed_url: str) -> dict:
    """
    Process meeting recording and generate analysis.

    Args:
        job_id: UUID of the processing job
        signed_url: Signed URL to download file from storage

    Returns:
        dict: Analysis results including transcript and metrics

    Raises:
        TranscriptionError: If audio transcription fails
        AIAnalysisError: If AI analysis fails
    """
    logger.info(f"[Job {job_id}] Starting processing")
    # Implementation...
```

### Formatting

All code is formatted with Prettier:

```bash
# Format all files
npm run format

# Check formatting without modifying
npm run format:check
```

Prettier runs automatically in CI and will fail PRs with formatting issues.

---

## Database Changes

When making database changes, follow the migration workflow documented in **[Database Guide](database.md#migration-workflow)**.

**Quick summary:**

1. Create migration locally with `supabase migration new`
2. Write idempotent SQL
3. Test by restarting local Supabase
4. Generate types with `supabase gen types typescript --local`
5. Commit both migration and types
6. Migrations deploy automatically via GitHub Actions on merge

See [database.md](database.md) for comprehensive migration workflow, best practices, and safety rules.

---

## Testing Requirements

### Unit Tests

Required for:

- New utility functions
- New React hooks
- Complex component logic
- Helper functions

**Example**:

```typescript
// lib/utils.test.ts
import { formatDuration } from './utils';

describe('formatDuration', () => {
  it('should format seconds as MM:SS', () => {
    expect(formatDuration(125)).toBe('02:05');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('00:00');
  });
});
```

### Integration Tests

Required for:

- New API routes
- Webhook handlers
- Middleware changes

Use mock factories from `__tests__/mocks/factories.ts`.

### Coverage Targets

- API Routes: >80%
- Webhooks: 100% event coverage
- Middleware: >90%
- Components: >70%

---

## Pull Request Process

### 1. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Branch naming:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### 2. Make Changes

Follow code style guidelines and add tests.

### 3. Run Quality Checks

```bash
npm run lint
npm run format
npm test
npm run build:frontend
```

### 4. Push to GitHub

```bash
git push origin feature/your-feature-name
```

### 5. Create Pull Request

- Use descriptive title (follows commit message format)
- Provide context in description
- Link related issues (e.g., "Closes #123")
- Add screenshots for UI changes
- List testing steps

### 6. Request Review

- Tag team members for review
- Comment `@claude` for automated review
- Address feedback
- Keep PR focused and small (<500 lines if possible)

### 7. CI Checks

All checks must pass before merging:

- ✅ Linting
- ✅ Tests
- ✅ Build
- ✅ Database checks (if migrations changed)
- ✅ Formatting

### 8. Merge

After approval and passing CI:

- Squash and merge (default)
- Delete branch after merge

---

## Architecture Patterns

### Frontend

**Server Components by Default**:

```typescript
// app/dashboard/page.tsx
export default async function DashboardPage() {
  const supabase = createServerClient();
  const data = await supabase.from('jobs').select();
  return <Dashboard data={data} />;
}
```

**Client Components Only for Interactivity**:

```typescript
// components/FileUploadZone.tsx
'use client';

export function FileUploadZone() {
  const [file, setFile] = useState<File | null>(null);
  // Interactive component logic
}
```

**No API Routes for Supabase**:

```typescript
// ❌ BAD - Don't create API route for Supabase queries
export async function GET() {
  const supabase = createClient();
  return Response.json(await supabase.from('jobs').select());
}

// ✅ GOOD - Query Supabase directly in Server Component
export default async function Page() {
  const supabase = createServerClient();
  const { data } = await supabase.from('jobs').select();
}
```

### Backend (Python)

**Async Route Handlers**:

```python
@app.post("/api/process")
async def process_meeting(request: ProcessRequest):
    # I/O-bound operations use async
    background_tasks.add_task(process_meeting_background, request)
    return {"success": True}
```

**Background Tasks for Long Operations**:

```python
async def process_meeting_background(job_id: str):
    try:
        # Long-running processing
        result = await transcribe_audio(path)
        await update_job_status(job_id, "completed")
    except Exception as e:
        await update_job_status(job_id, "failed", error=str(e))
    finally:
        cleanup_temp_files(job_id)
```

---

## Security Requirements

### Never Expose Secrets

- ⛔ No hardcoded API keys or secrets
- ⛔ No service role key in frontend
- ⛔ No secrets in git repositories
- ✅ Use environment variables
- ✅ Use `NEXT_PUBLIC_` prefix for client-side variables (only if truly public)

### Row Level Security

All user-scoped tables must have RLS policies:

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT
CREATE POLICY "Users can read own data"
ON table_name FOR SELECT
USING (user_id = auth.uid());

-- Policy for INSERT
CREATE POLICY "Users can insert own data"
ON table_name FOR INSERT
WITH CHECK (user_id = auth.uid());
```

### API Authentication

Python backend routes (except `/api/health`) require API key:

```python
# Middleware checks Authorization: Bearer <key>
from app.middleware.auth import APIKeyMiddleware

app.add_middleware(APIKeyMiddleware)
```

---

## Common Anti-Patterns to Avoid

### Frontend

❌ **Using Service Role Key**:

```typescript
// WRONG - Bypasses RLS
const supabase = createClient(URL, SERVICE_ROLE_KEY);
```

❌ **Client Component for Static Content**:

```typescript
// WRONG - No interactivity needed
'use client';
export default function AboutPage() {
  return <div>Static content</div>;
}
```

❌ **Creating API Routes for Simple Supabase Queries**:

```typescript
// WRONG - Adds unnecessary layer
export async function GET() {
  const supabase = createClient();
  return Response.json(await supabase.from('table').select());
}
```

### Python

❌ **Blocking Operations in Async Code**:

```python
# WRONG - Blocks event loop
def read_file(path: str):
    with open(path, 'rb') as f:
        return f.read()

async def process():
    data = read_file('/tmp/file.mp4')  # Blocks!
```

❌ **Missing Error Status Updates**:

```python
# WRONG - Job stays in "processing" state
try:
    result = await process_file(job_id)
except Exception as e:
    logger.error(f"Failed: {e}")
    return  # Status never updated!
```

❌ **Not Cleaning Up Temp Files**:

```python
# WRONG - Files accumulate in /tmp
async def process():
    path = await download_file(url, job_id)
    result = await transcribe(path)
    return result  # File never deleted!
```

---

## Getting Help

### Documentation

- Read `README.md` for getting started
- Check `docs/` for detailed guides
- Review existing code for patterns

### Team Communication

- Open an issue for bugs or feature requests
- Ask in team Slack/Discord for quick questions
- Use Linear for project management

### External Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Stripe Docs](https://stripe.com/docs)
- [FastAPI Docs](https://fastapi.tiangolo.com/)

---

## Questions?

For questions about contributing, open an issue or ask in team chat.

Thank you for contributing! 🎉
