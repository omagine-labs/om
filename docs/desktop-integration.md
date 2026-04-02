# Desktop App Integration

This document describes how the Om Desktop Electron app integrates with the monorepo, including architecture, authentication flows, and development workflows.

---

## Overview

The Om Desktop app is an Electron-based macOS application that provides automated meeting recording and analysis. It has been integrated into the monorepo alongside the web frontend, Python backend, and Supabase infrastructure.

**Key Features:**

- Menu bar-only app (doesn't appear in Dock)
- Native macOS audio recording (microphone + system audio) via ScreenCaptureKit
- Automated meeting detection and upload
- Magic link authentication with web frontend
- Independent session management

---

## Repository Structure

```
chip-mono-mvp/
├── om-desktop/                  # Electron desktop app
│   ├── src/
│   │   ├── main.ts              # Main process (Electron)
│   │   ├── preload.ts           # Preload script (IPC bridge)
│   │   ├── renderer.tsx         # Renderer process (React)
│   │   ├── components/          # React UI components
│   │   ├── services/            # Core services
│   │   │   ├── menu-bar.ts      # Menu bar UI and actions
│   │   │   ├── meeting-orchestrator.ts  # Recording orchestration
│   │   │   ├── upload-service.ts        # Upload to Supabase
│   │   │   └── dashboard-window.ts      # Opens web dashboard
│   │   └── lib/                 # Shared libraries
│   │       ├── auth/            # Authentication module
│   │       │   ├── service.ts   # AuthService singleton
│   │       │   ├── persistence.ts # Remember Me session storage
│   │       │   └── deep-links.ts  # Magic link handling
│   │       └── supabase.ts      # Supabase client
│   ├── native/                  # Native macOS addons
│   │   ├── addon/               # ScreenCaptureKit audio recording (mic + system audio)
│   │   └── window-detector/     # Meeting app detection
│   ├── scripts/                 # Build and release scripts
│   └── forge.config.ts          # Electron Forge configuration
├── frontend/                    # Web app (integrates with desktop)
├── python-backend/              # Processing backend
└── supabase/                    # Database and Edge Functions
```

---

## Workspace Configuration

The desktop app is configured as an npm workspace in the root `package.json`:

```json
{
  "workspaces": ["frontend", "supabase", "om-desktop"]
}
```

This enables:

- Shared dependency management across all workspaces
- Monorepo-wide scripts (test, lint, format)
- Simplified CI/CD configuration

---

## Authentication Architecture

The desktop and web apps maintain **independent Supabase sessions** using a magic link architecture. Authentication is managed by a centralized **AuthService** singleton in the desktop app's main process.

### Auth Service Architecture

The desktop app uses Supabase's official patterns for Electron applications, providing a clean and maintainable auth system.

**Architecture Diagram:**

```
┌─────────────────────────────────────────────────────────────┐
│              Main Process (AuthService)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ AuthService (Single Source of Truth)                  │  │
│  │ • Uses Supabase onAuthStateChange callback            │  │
│  │ • Uses startAutoRefresh/stopAutoRefresh for tokens    │  │
│  │ • Integrates with powerMonitor for sleep/wake         │  │
│  │ • Stores encrypted session via electron-store         │  │
│  │ • Provides IPC API for renderer                       │  │
│  └──────────────────────────────────────────────────────┘  │
│       │                      │                      │       │
│       ↓ IPC                  ↓ IPC                  ↓       │
│  authService.getUser()  authService.getSession() Upload/    │
│  (renderer calls)       (renderer calls)         Services   │
└─────────────────────────────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Renderer Process (Dashboard)                   │
│  • Calls IPC API for all auth operations                    │
│  • Subscribes to auth:state-changed events                  │
│  • No session storage in renderer                           │
│  • Auth state managed entirely by main process              │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**

**Main Process:**
- `src/lib/auth/service.ts` - AuthService singleton using Supabase patterns
- `src/lib/auth/persistence.ts` - "Remember Me" session storage
- `src/lib/auth/deep-links.ts` - Magic link deep link handling
- `src/ipc/auth-handlers.ts` - IPC handlers for auth requests
- `src/ipc/api-handlers.ts` - IPC proxy for Supabase queries

**Renderer Process:**

- `src/dashboard/lib/api-client.ts` - IPC client for auth/data

**Benefits:**
- ✅ **Single source of truth** - AuthService manages all auth state
- ✅ **Automatic token refresh** - Supabase handles refresh via `startAutoRefresh()`
- ✅ **Focus-based optimization** - Stops refresh when app is backgrounded
- ✅ **Sleep/wake handling** - Validates session after system resume
- ✅ **Secure storage** - Session encrypted via electron-store

### Magic Link Flow (Desktop → Web → Desktop)

1. **Desktop initiates OAuth:**

   ```typescript
   shell.openExternal(`${webAppUrl}/login?source=desktop`);
   ```

2. **User completes OAuth on web** (Google/Microsoft)

3. **Web generates magic link and redirects:**

   ```typescript
   // In frontend/app/auth/callback/route.ts
   if (source === 'desktop') {
     const { hashedToken, email } = await generateMagicLinkServer(
       session.access_token
     );
     window.location.href = `om://auth/magiclink?token=${hashedToken}&email=${email}`;
   }
   ```

4. **Desktop receives deep link and verifies OTP:**
   ```typescript
   // In om-desktop/src/lib/auth/deep-links.ts - handleMagicLink()
   const result = await authService.verifyMagicLink(token);

   // AuthService.verifyMagicLink() calls:
   const { data } = await supabase.auth.verifyOtp({
     token_hash: tokenHash,
     type: 'magiclink',
   });

   // onAuthStateChange callback automatically updates state and persists session
   ```

### Open Dashboard Flow (Desktop → Web)

When user clicks "Open Dashboard" from desktop menu bar:

1. **Desktop requests magic link:**

   ```typescript
   // Get session from AuthService
   const session = await authService.getSession();

   const { hashedToken, email } = await supabase.functions.invoke(
     'generate-magic-link',
     {
       headers: { Authorization: `Bearer ${session.access_token}` },
     }
   );
   ```

2. **Desktop opens browser with magic link in hash:**

   ```typescript
   const url = `${webAppUrl}/login#magic_link_token=${hashedToken}&email=${email}`;
   shell.openExternal(url);
   ```

3. **Web reads hash and creates independent session:**
   ```typescript
   // In frontend/components/MagicLinkHandler.tsx
   const { data } = await supabase.auth.verifyOtp({
     token_hash: token,
     type: 'magiclink',
   });
   router.push('/dashboard');
   ```

### Security Benefits

- ✅ **Independent sessions** - Sign out of web doesn't affect desktop
- ✅ **Secure token transfer** - Hash fragments never sent to server
- ✅ **Session persistence** - Desktop stays authenticated across restarts
- ✅ **No credential re-entry** - Seamless cross-platform access
- ✅ **Automatic token refresh** - Supabase handles refresh when app is focused

### Auth Best Practices

**For Main Process Code:**

✅ **DO:** Use AuthService singleton
```typescript
import { authService } from './lib/auth';

const user = authService.getUser(); // Synchronous, cached
const session = await authService.getSession(); // Gets fresh session
if (!session?.user) {
  return { success: false, error: 'Not authenticated' };
}
```

❌ **DON'T:** Call Supabase auth directly outside AuthService
```typescript
// Never do this - always go through authService
const { data: { user } } = await supabase.auth.getUser();
```

**For Renderer Process Code:**

✅ **DO:** Use IPC API and state change events
```typescript
const user = await window.electronAPI.auth.getUser();
const session = await window.electronAPI.auth.getSession();

// Subscribe to state changes
const unsubscribe = window.electronAPI.auth.onStateChange(({ state, user }) => {
  console.log('Auth state changed:', state);
});
```

❌ **DON'T:** Manage session in renderer

```typescript
// Never do this in renderer
sessionStorage.setItem('session', JSON.stringify(session));
const {
  data: { user },
} = await supabase.auth.getUser();
```

### Debugging Authentication

**Development Tools:**

1. **Console Logging**: Filter by `[Auth]`, `[Auth IPC]`, `[DeepLink]`

2. **Menu Bar Debug Option**: Click Om icon → "Debug: Show Auth State"

3. **Sentry Monitoring**: Auth events are tracked as breadcrumbs in Sentry

**Common Patterns:**

- All auth state changes trigger `onAuthStateChange` callback
- Supabase automatically handles token refresh via `startAutoRefresh()`
- Sleep/wake handled by `powerMonitor` integration
- Renderer receives state changes via `auth:state-changed` IPC event
- Main process is single source of truth for auth state

### Sleep/Wake Handling

The auth system properly handles computer sleep scenarios:

1. **On Suspend**: Stops auto-refresh to save resources
2. **On Resume**: Validates session is still valid, restarts auto-refresh if authenticated

```typescript
// In AuthService
powerMonitor.on('suspend', () => {
  this.supabase.auth.stopAutoRefresh();
});

powerMonitor.on('resume', async () => {
  if (this.currentState === 'authenticated') {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session) {
      this.supabase.auth.startAutoRefresh();
    }
  }
});
```

This ensures tokens stay fresh even after long sleep periods.

---

## Development Workflows

### Initial Setup

**Download FFmpeg and FFprobe binaries:**

The desktop app requires FFmpeg and FFprobe binaries for audio/video processing. These are not checked into git due to their size.

```bash
cd om-desktop/resources/bin

# Download FFmpeg ARM64 (Apple Silicon)
curl -L "https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip" -o ffmpeg-arm64.zip
unzip ffmpeg-arm64.zip && mv ffmpeg ffmpeg-arm64 && rm ffmpeg-arm64.zip

# Download FFmpeg x86_64 (Intel)
curl -L "https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip" -o ffmpeg-x86_64.zip
unzip ffmpeg-x86_64.zip && mv ffmpeg ffmpeg-x86_64 && rm ffmpeg-x86_64.zip

# Download FFprobe ARM64 (Apple Silicon)
curl -L "https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffprobe.zip" -o ffprobe-arm64.zip
unzip ffprobe-arm64.zip && mv ffprobe ffprobe-arm64 && rm ffprobe-arm64.zip

# Download FFprobe x86_64 (Intel)
curl -L "https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffprobe.zip" -o ffprobe-x86_64.zip
unzip ffprobe-x86_64.zip && mv ffprobe ffprobe-x86_64 && rm ffprobe-x86_64.zip

# Make executable
chmod +x ffmpeg-* ffprobe-*
```

**After setup, the directory should contain:**

- `ffmpeg-arm64` - FFmpeg binary for Apple Silicon Macs (M1/M2/M3)
- `ffmpeg-x86_64` - FFmpeg binary for Intel Macs
- `ffprobe-arm64` - FFprobe binary for Apple Silicon Macs (M1/M2/M3)
- `ffprobe-x86_64` - FFprobe binary for Intel Macs

**Source:** Binaries are downloaded from [Martin Riedl's FFmpeg Build Server](https://ffmpeg.martin-riedl.de/), which provides architecture-specific static builds for macOS.

### Running the Desktop App

```bash
# Start desktop app in development mode
npm run dev:desktop

# Or directly in the workspace
cd om-desktop && npm start
```

### Testing

```bash
# Run desktop tests
npm run test:desktop

# Watch mode
npm run test:desktop:watch

# Coverage report
npm run test:desktop:coverage
```

### Linting and Formatting

```bash
# Lint desktop code
npm run lint:desktop

# Format desktop code
npm run format:desktop

# Or run all workspaces
npm run lint
npm run format
```

### Building for Production

```bash
# Build unsigned package (development)
npm run build:desktop

# Build signed and notarized package (production)
npm run build:desktop:production
```

**Production builds require:**

- Apple Developer account
- Code signing certificate
- Notarization credentials in `.env`

See `om-desktop/README.md` for detailed build instructions.

---

## CI/CD Integration

### GitHub Actions Workflows

The desktop app has its own CI workflow at `.github/workflows/desktop-ci.yml`:

```yaml
on:
  pull_request:
    paths:
      - 'om-desktop/**'
      - '.github/workflows/desktop-ci.yml'
  push:
    branches: [main]
    paths:
      - 'om-desktop/**'
```

**Workflow runs:**

- Tests (Vitest)
- Linting (ESLint)
- Format checking (Prettier)

**Note:** Builds are intentionally excluded from CI to save GitHub Actions costs (macOS runners are 10x more expensive). Production builds are done locally and published manually.

### Release Process

Desktop app releases are managed separately from web deployments:

1. **Bump version:** `npm version patch|minor|major`
2. **Build:** `npm run build:desktop:production`
3. **Publish:** `./scripts/publish-release.sh`
4. **Push tag:** `git push --tags`

Releases are published to the `om-releases` public repository for auto-updates.

---

## Shared Dependencies

The desktop app shares some dependencies with the frontend:

| Package                 | Version | Used For          |
| ----------------------- | ------- | ----------------- |
| `@supabase/supabase-js` | 2.80+   | Database and auth |
| `@anthropic-ai/sdk`     | 0.32+   | AI analysis       |
| `react`                 | 19.2+   | UI components     |
| `react-dom`             | 19.2+   | UI rendering      |

Dependencies are managed via npm workspaces, which hoists shared packages to the root `node_modules`.

---

## Frontend Integration Points

The web frontend provides several integration points for the desktop app:

### 1. OAuth Callback with Desktop Support

`frontend/app/auth/callback/route.ts`:

- Detects `source=desktop` query parameter
- Generates magic link for desktop
- Redirects to `om://auth/magiclink` deep link

### 2. Magic Link Handler

`frontend/components/MagicLinkHandler.tsx`:

- Reads magic link token from URL hash
- Verifies token via Supabase `verifyOtp()`
- Creates independent web session
- Redirects to dashboard

### 3. Magic Link Generation API

`frontend/lib/magic-link-server.ts`:

- Generates magic links via Edge Function
- Supports both Bearer token (desktop) and cookie auth (web)
- Returns hashed token for `verifyOtp()`

### 4. Desktop Auth Success Page

`frontend/app/desktop-success/page.tsx`:

- Fallback page for legacy auth flow
- Handles direct token transfer (not recommended)

---

## Database Schema

The desktop app uses the same database schema as the web app:

**Key Tables:**

- `meetings` - Meeting metadata and analysis results
- `profiles` - User profiles and subscription status
- `oauth_tokens` - Calendar provider tokens
- `user_event_log` - Analytics events

**Row Level Security:**

- Desktop uses standard user authentication
- All RLS policies apply equally to web and desktop
- No special desktop-specific policies needed

---

## Environment Configuration

The desktop app requires its own environment configuration.

**First-time setup:**

```bash
# Copy the example file
cp om-desktop/.env.example om-desktop/.env

# Edit om-desktop/.env with your values
```

**Required environment variables:**

```bash
# om-desktop/.env

# Environment mode (local or production)
SUPABASE_ENV=local

# Supabase configuration
SUPABASE_URL_LOCAL=http://127.0.0.1:54321
SUPABASE_ANON_KEY_LOCAL=your_local_anon_key
SUPABASE_URL_PRODUCTION=https://your-project.supabase.co
SUPABASE_ANON_KEY_PRODUCTION=your_production_anon_key

# Web app URLs
WEB_APP_URL_LOCAL=http://localhost:3000
WEB_APP_URL_PRODUCTION=https://app.yourdomain.com

# Optional: OAuth client IDs (for calendar integration)
GOOGLE_CLIENT_ID=your_google_client_id
MICROSOFT_CLIENT_ID=your_microsoft_client_id

# Production builds only (code signing)
APPLE_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
APPLE_TEAM_ID=ABCD123456
APPLE_ID=your-apple-id@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

See `om-desktop/.env.example` for a complete template with detailed comments.

---

## Troubleshooting

### Desktop app won't start

**Issue:** Electron installation fails with 403 error

**Solution:**

```bash
cd om-desktop
rm -rf node_modules
npm install
```

### Tests fail with import errors

**Issue:** `Cannot find module '@testing-library/react'`

**Solution:**

```bash
npm install  # Install all workspace dependencies
npm run test:desktop
```

### Linting fails with missing ESLint packages

**Issue:** `Cannot find package '@eslint/js'`

**Solution:**

```bash
cd om-desktop
npm install
npm run lint
```

### Desktop can't authenticate with web app

**Issue:** Magic link redirect doesn't work

**Debug steps:**

1. Verify `VITE_WEB_APP_URL` is set correctly in `om-desktop/.env`
2. Check that frontend is running on the configured URL
3. Ensure `source=desktop` parameter is present in OAuth URL
4. Check browser console for magic link handler logs

---

## Migration from Separate Repository

The desktop app was migrated from the `OM-desktop` repository into the monorepo:

**Changes made:**

1. ✅ Moved `OM-desktop/` → `chip-mono-mvp/om-desktop/`
2. ✅ Added to npm workspaces in root `package.json`
3. ✅ Migrated GitHub Actions workflow to `.github/workflows/desktop-ci.yml`
4. ✅ Updated root scripts for desktop testing, linting, and formatting
5. ✅ Updated `.gitignore` to exclude Electron build artifacts
6. ✅ Verified frontend integration remains compatible

**Backwards compatibility:**

- ✅ All existing GitHub Actions from both repos continue to function
- ✅ Desktop app release process unchanged (still publishes to `om-releases`)
- ✅ Frontend authentication flows work with both web and desktop clients
- ✅ No breaking changes to existing workflows

---

## Manual Upload Monitoring

The desktop app supports manual file uploads via the embedded dashboard. Upload performance and errors are tracked via Sentry.

### Sentry Metrics

**Key metrics to monitor:**

1. **Upload Timing** - Track total upload duration
   - Metric: `totalElapsed` in success logs
   - Target: < 10s for files under 100MB
   - Alert if: > 30s consistently

2. **Storage Upload Duration** - Time to upload to Supabase Storage
   - Metric: `uploadDuration` in console logs
   - Depends on file size and network speed
   - Alert if: Disproportionate to file size

3. **API Call Duration** - Time for frontend API to create meeting/job
   - Metric: `apiDuration` in console logs
   - Target: < 2s
   - Alert if: > 5s

4. **Upload Success Rate** - Percentage of successful uploads
   - Track: Count of 'Manual upload completed successfully' vs exceptions
   - Target: > 95%
   - Alert if: < 90% over 24h period

### Finding Upload Metrics in Sentry

**Successful uploads:**

```
Level: info
Message: "Manual upload completed successfully"
Extra data:
  - jobId: Processing job UUID
  - meetingId: Meeting UUID
  - component: "desktop-app"
  - stage: "upload-complete"
  - fileSizeMB: File size
  - totalElapsed: Total time in ms
```

**Failed uploads:**

```
Level: error
Exception: Various (auth, storage, API errors)
Breadcrumbs:
  - "Manual file upload started"
  - "Calling frontend API" (if reached)
Context: user_id, meeting_id, job_id tags
```

**Query examples:**

- All uploads: `component:"desktop-app" AND stage:"upload-complete"`
- Slow uploads: `component:"desktop-app" AND totalElapsed:>30000`
- Upload failures: `component:"desktop-app" AND "Upload Handler"`
- By user: `user_id:"abc-123" AND component:"desktop-app"`

### Performance Baselines

| File Size  | Expected Upload Time | Alert Threshold |
| ---------- | -------------------- | --------------- |
| 0-50 MB    | 2-5s                 | > 15s           |
| 50-200 MB  | 5-15s                | > 30s           |
| 200-500 MB | 15-40s               | > 60s           |
| > 500 MB   | 40s+                 | > 120s          |

**Note:** Times include storage upload + API call. Network conditions significantly impact these baselines.

### Error Categories to Monitor

1. **Authentication Errors**
   - Message: "User not authenticated"
   - Cause: Session expired or invalid
   - Action: Check session refresh logic

2. **Storage Errors**
   - Message: "Upload failed: [storage error]"
   - Cause: Storage quota, network, permissions
   - Action: Check Supabase Storage dashboard

3. **API Errors**
   - Message: "API error: [error message]"
   - Cause: Backend validation, database issues
   - Action: Check frontend API logs and database

4. **Network Timeouts**
   - Message: "Network timeout" or similar
   - Cause: Slow connection, large files
   - Action: Review upload timeout settings

### Debugging Upload Issues

1. **Check Sentry breadcrumbs** - Shows exactly where upload failed
2. **Review user context** - user_id, file size, timing
3. **Compare with baselines** - Is timing expected for file size?
4. **Check for patterns** - Same user? Same time of day? File type?

---

## Meeting Detection

The desktop app uses a hybrid detection system to identify active meetings and show the recording control panel.

### Detection Strategy

**Hybrid approach with microphone-first priority:**

1. **Microphone Detection** (Primary)
   - Checks if microphone is in use via Core Audio APIs
   - Verifies a known meeting app is running (Zoom, Meet, Teams, Slack)
   - For browsers: Validates meeting URL exists in open tabs
   - More stable than window focus (persists through tab switches, notifications)

2. **Window Detection** (Fallback)
   - Scans for active meeting windows by title patterns
   - Provides exact window ID and bounds for control panel positioning
   - Works before mic is enabled, gives precise window location

**Detection Interval:** Every 5 seconds with hysteresis to prevent false negatives

**Supported Platforms:**

- Zoom (window title: "Zoom Meeting")
- Google Meet (window title: "Meet - xxx-xxx-xxx" or URL pattern)
- Microsoft Teams (window title + URL parameter)
- Slack (huddles detected via mic, no dedicated window)

### Implementation Details

**Detection Flow:**

- Primary detection via microphone state (`meeting-detection-service.ts:47`)
- Fallback to window detection for precise positioning
- Hysteresis: Waits 3 consecutive failed detections (15s) before ending meeting (`meeting-orchestrator.ts:234-247`)
- User action locking prevents race conditions during manual start/stop (`meeting-orchestrator.ts:219`)
- Transition safety with try/finally blocks prevents deadlock (`meeting-orchestrator.ts:333-368`)

**Race Condition Prevention:**

- Detection loop skips when user is taking action (clicking start/stop)
- Multiple failed detections required before ending session
- Transition flags guaranteed to release even on errors

---

## Further Documentation

- **Desktop App Details:** `om-desktop/README.md`
- **Web Integration:** `om-desktop/WEB_APP_INTEGRATION.md`
- **Release Process:** `om-desktop/docs/RELEASES.md`
- **Architecture:** `docs/architecture.md`
- **Frontend Testing:** `docs/frontend-testing.md`

---

## Questions or Issues?

For desktop app-specific issues:

1. Check `om-desktop/README.md` for setup instructions
2. Review `om-desktop/WEB_APP_INTEGRATION.md` for auth flows
3. Check desktop app console logs (look for `[Auth]`, `[Recording]` prefixes)

For monorepo integration issues:

1. Verify npm workspaces are installed: `npm ls --workspaces`
2. Check that scripts run from root: `npm run test:desktop`
3. Review this documentation for expected behavior
