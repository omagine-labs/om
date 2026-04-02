# Frontend PR Review Guidelines

Next.js 15.5 (App Router) + React 19 + TypeScript + Supabase

## Critical Checks

**TypeScript:**

- No `any` types - use `supabase/database.types.ts`
- Type imports: `import type { Type } from 'module'`
- ESLint + Prettier passing

**Next.js Patterns:**

- Server Components by default (no unnecessary `'use client'`)
- Client Components only for interactivity/hooks/browser APIs
- Server-side data fetching in Server Components
- NO API routes for Supabase operations (use direct client)

**Supabase:**

- Server Components: `createServerClient()` from `lib/supabase-server.ts`
- Client Components: `createClient()` from `lib/supabase.ts`
- Direct uploads to Supabase Storage (not through API routes)
- Use generated types from `supabase/database.types.ts`
- Never manipulate `processing_jobs.status` (backend-only)

**Security:**

- NO service role key in frontend (anon key only)
- RLS policies enforced
- No hardcoded secrets
- Environment variables: `NEXT_PUBLIC_` prefix for client-side
- Session in cookies (not localStorage)

## Common Anti-Patterns

❌ **Creating API Routes for Supabase**

```typescript
// WRONG - Frontend should query Supabase directly
export async function GET() {
  const supabase = createClient();
  return Response.json(await supabase.from('jobs').select());
}
```

❌ **Using Service Role Key**

```typescript
// WRONG - Bypasses RLS
const supabase = createClient(URL, SUPABASE_SERVICE_KEY);
```

❌ **Client Component for Static Content**

```typescript
// WRONG - No interactivity needed
'use client'
export default function AboutPage() {
  return <div>Static content</div>
}
```

❌ **Client-side useEffect for Initial Data**

```typescript
// WRONG - Should be Server Component
'use client';
export default function Page() {
  useEffect(() => {
    fetchData();
  }, []);
}
```

## Architecture Reminders

- Frontend → Supabase (Storage + Database + Edge Functions) → Python Backend
- Frontend handles: UI, uploads, user interactions, display data
- Frontend does NOT handle: Processing logic, status transitions, AI analysis

## Quality Commands

```bash
npm run lint:frontend
npm run format:check
npm run build:frontend
```
