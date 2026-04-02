---
description: Review current branch changes against production
---

Please perform a comprehensive code review of the current branch against the production branch.

Follow these steps:

1. Get the current branch name
2. Get the diff between the current branch and production
3. Get the list of changed files
4. Review the changes comprehensively covering ALL of these categories:

   **Code Quality**
   - Adherence to project conventions (ESLint, Prettier, TypeScript, Black, flake8)
   - Code clarity and maintainability
   - Proper error handling

   **Security**
   - RLS policies on new database tables
   - No exposed API keys or secrets
   - Proper authentication/authorization checks

   **Database Changes** (if applicable)
   - Migration safety (no destructive operations without safeguards)
   - Proper RLS policies
   - Type generation updated (both supabase/database.types.ts and frontend/supabase/database.types.ts)

   **Architecture**
   - Proper separation of concerns (Frontend/Supabase/Python backend)
   - No anti-patterns or architectural violations
   - Follows patterns in @.claude/CLAUDE.md, @.claude/frontend.md, @.claude/backend.md, @.claude/supabase.md

   **Desktop App** (if om-desktop/ changes)
   - Electron security (contextIsolation=true, nodeIntegration=false)
   - IPC handler safety (no entire modules exposed to renderer)
   - Preload script uses contextBridge only
   - Deep link validation and safe URL parsing
   - No exposed tokens/secrets in code or logs
   - Proper process separation (main/renderer/preload)
   - No synchronous operations blocking main process
   - Follows patterns in @.claude/desktop.md

   **Native Addons** (if om-desktop/native/ changes)
   - C++/Objective-C changes follow proper patterns
   - Proper N-API usage
   - Memory management and cleanup
   - macOS API usage (ScreenCaptureKit, CGWindowList, AppleScript)

   **Testing**
   - Test coverage for new functionality
   - Edge cases considered

   **Performance**
   - No obvious performance issues
   - Efficient database queries

5. Structure your review with these sections:
   - Code Quality
   - Security
   - Database Changes (or "N/A - No database changes")
   - Architecture
   - Desktop App (or "N/A - No desktop changes")
   - Native Addons (or "N/A - No native changes")
   - Testing
   - Performance
   - Summary (overall assessment: APPROVE, REQUEST CHANGES, or COMMENT)
   - Action Items (checklist of required changes)

Use the project context from .claude/CLAUDE.md and component-specific guidelines to inform your review.
Pay special attention to desktop app changes:

- Authentication flows (OAuth, magic links, session management)
- Recording flows (native screen capture, upload queue)
- Deep link protocol handling (om://)
- Menu bar integration
