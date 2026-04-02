# Meeting Intelligence Assistant - Project Context

AI-powered video/audio analysis platform that generates communication insights and behavioral analysis from meeting recordings.

---

## Quick Reference

**Tech Stack**: Next.js 15 · React 19 · Electron · FastAPI · Supabase · Stripe · AssemblyAI · Google Gemini

**Commands**:

```bash
npm start           # Start all services (frontend, backend, Supabase, Stripe)
npm stop            # Stop all services
npm test            # Run all tests
npm run lint        # Lint all workspaces
npm run format      # Format all files
```

**Key URLs**:

- Frontend: http://localhost:3000
- Python Backend: http://localhost:8000
- Supabase Studio: http://localhost:54323

---

## Documentation Structure

For detailed context, see:

**Architecture & Development**:

- @docs/architecture.md - System architecture, components, data flow
- @docs/database.md - Schema, migrations, RLS patterns
- @docs/deployment.md - CI/CD, environments, rollback procedures

**Features & Integration**:

- @docs/stripe.md - Subscription billing integration
- @docs/analytics.md - PostHog integration and tracking guide
- @docs/event-taxonomy.md - Complete AARRR event reference
- @docs/frontend-testing.md - Frontend testing with Jest
- @docs/python-testing.md - Python backend testing with pytest
- @docs/supabase-testing.md - Edge Function testing with Deno
- @docs/desktop-integration.md - Desktop app integration and architecture
- @docs/desktop-releases.md - Desktop app release process

**Contributing**:

- @docs/contributing.md - PR guidelines, code style, best practices
- @docs/troubleshooting.md - Common issues and solutions

**Component-Specific Guidelines**:

- @.claude/frontend.md - Next.js/React patterns and PR review guidelines
- @.claude/backend.md - FastAPI patterns and Python code quality
- @.claude/supabase.md - Database operations and Edge Functions
- @.claude/desktop.md - Electron desktop app patterns and security

---

## Project Principles

1. **Frontend-Supabase-Python Architecture** - Clear separation of concerns
2. **Security First** - RLS policies, no service role keys in frontend
3. **Migrations Only** - Database changes via migrations, never manual SQL
4. **Test Coverage** - Unit + integration tests for all critical paths
5. **Documentation as Code** - Keep docs updated with code changes

---

## Code and Documentation Standards

### Ticket Number Policy

**⛔ NEVER add ticket numbers (e.g., OM-123, CHI-456) to:**

- Code comments
- Documentation files in `docs/`
- README files
- Code strings or variable names
- Commit messages (GitHub will auto-link if mentioned)

**Why?** Ticket numbers:

- Create external dependencies in permanent documentation
- Become meaningless when tickets are closed/archived
- Don't provide context to future developers
- Make docs harder to read

**✅ Instead, use descriptive context:**

```typescript
// ❌ BAD: Implement OM-123 trial ending reminder
// ✅ GOOD: Send trial ending reminder via Intercom 3 days before trial ends

// ❌ BAD: ### Trial Ending Reminder (OM-89)
// ✅ GOOD: ### Trial Ending Reminder
```

**Exception**: Ticket numbers are OK in:

- Git commit messages (GitHub auto-links them)
- Linear comments referencing other tickets
- PR descriptions

### Commit and PR Formatting

**⛔ NEVER add these boilerplate lines to commits or PRs:**

- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- `Co-Authored-By: Claude ...`

Just write clean commit messages and PR descriptions without AI attribution.

---

## Documentation Maintenance

**CRITICAL POLICY**: ALL documentation MUST go in `/docs` (project root) - NEVER create documentation in component-specific directories like `python-backend/docs/`, `frontend/docs/`, etc.

**When making code changes, you MUST update relevant documentation in `/docs`**:

- **Architecture changes** → Update `docs/architecture.md`
- **Database schema/migrations** → Update `docs/database.md`
- **CI/CD or deployment changes** → Update `docs/deployment.md`
- **Stripe integration changes** → Update `docs/stripe.md`
- **Intercom integration changes** → Update `docs/intercom.md`
- **Analytics/tracking changes** → Update `docs/analytics.md` and `docs/event-taxonomy.md`
- **Testing patterns changes** → Update `docs/testing.md`
- **Setup or workflow changes** → Update `README.md` and `docs/contributing.md`
- **New troubleshooting issues** → Add to `docs/troubleshooting.md`

**Documentation Placement Rules**:

- ✅ **ALWAYS** use `/docs` (project root) for ALL documentation
- ⛔ **NEVER** create docs in `python-backend/docs/`, `frontend/docs/`, `supabase/docs/`, etc.
- ⛔ **NEVER** create standalone documentation files outside `/docs`
- ✅ If documentation already exists in `/docs`, UPDATE it instead of creating new files
- ✅ Component-specific implementation notes belong in code comments, not separate doc files

Documentation updates should be included in the same PR as the code changes.

---

## Common Workflows

### Adding a New Feature

1. Create feature branch
2. Run quality checks: `npm run lint && npm test && npm run build:frontend`
3. Create PR
4. Comment `@claude` for automated code review
5. Merge to production → Auto-deploys

### Database Changes

See @docs/database.md#migration-workflow for complete guide:

1. `supabase migration new feature_name`
2. Write idempotent SQL
3. Test migrations with `npm start` (idempotent, applies new migrations automatically)
4. Generate and sync types: `npm run db:types:sync`
5. Commit migration + both type files together: `git add supabase/migrations/*.sql supabase/database.types.ts frontend/supabase/database.types.ts`

**CRITICAL RULES**:

- ⛔ **NEVER** use `supabase db reset --local` - this destroys local data
- ⛔ **NEVER** apply migrations with `supabase migration up` directly
- ✅ **ALWAYS** use `npm start` to apply migrations (handles Supabase start + migrations idempotently)
- ✅ Migrations are automatically applied on `npm start` via `scripts/start.sh`

**Note**: Frontend maintains a copy of `database.types.ts` for standalone builds (CI/Vercel). Always use `npm run db:types:sync` to keep both in sync.

### Adding Analytics Events

See @docs/analytics.md for complete guide:

1. Add event enum and properties interface to `frontend/types/analytics.ts`
2. Add to `AnalyticsEvent` union type in same file
3. Document event in `docs/event-taxonomy.md` (when to track, properties, examples)
4. Implement tracking: `trackEvent(EventCategory.EVENT_NAME, { properties })`
5. Add unit tests if introducing new patterns

**Note**: Use existing event enums from `types/analytics.ts`. Development mode validates events and warns about typos.

### Debugging Issues

1. Check logs (frontend console, Python backend docker logs, Supabase dashboard)
2. See @docs/troubleshooting.md for common issues
3. Verify environment variables are configured

---

## Key Constraints

**Database**:

- ⛔ NEVER manually run `supabase db push` to production
- ⛔ NEVER use service role key in frontend
- ✅ Always use `--local` flag during development
- ✅ Migrations deploy automatically via GitHub Actions

**Frontend**:

- ⛔ No API routes for Supabase queries (use direct client)
- ⛔ No client components for static content
- ✅ Server components by default
- ✅ Type imports from `supabase/database.types.ts`

**Design Language** (read @docs/design-language.md before building any new UI):

- **Fonts**: Fraunces (`font-display`) for all headings — always with `tracking-tighter`. DM Mono (`font-mono`) for scores, numbers, data. Body sans is flexible (system-ui / DM Sans / Inter).
- **Colors**: Teal spectrum (700/800/900) for page backgrounds. `teal-950` for headings on white. `lime-300` for the single most important CTA or highlight — max two per view. `orange-400` for editorial numbering and warm accents. Slate 700/800/900 for body text, `slate-500` for secondary — never `gray-*`.
- **Cards**: `bg-white backdrop-blur-sm rounded-2xl shadow-lg p-6 xl:p-8 xl:pt-7`. Hover: `hover:shadow-2xl hover:translate-y-[-2px]`. List items use subtler `hover:-translate-y-0.5`. Never more than 2px lift.
- **Dividers**: Always `border-t-2 border-dashed border-slate-200` inside cards. Never solid horizontal rules.
- **Interactions**: Clickable and interactive elements always have hover effects (`-translate-y-0.5`, slight change in bg color etc.)
- **Animation**: Every card gets `animate-fadeInUp` with staggered `animationDelay`. No bounce, scale, or rotation on content. Infinite animations are decorative only (background blobs, button glows).
- **Scores**: Color-coded — lime (7-10), yellow (4-6), rose (0-3). Badges: `text-xs font-semibold px-3 py-1 rounded-full` with `{color}-500/20 text-{color}-950`.

**Python Backend**:

- ⛔ No blocking operations in async code
- ⛔ Never skip error status updates
- ✅ Always clean up temp files
- ✅ Use background tasks for long operations

---

For detailed guidelines on specific areas, see the imported files above.
