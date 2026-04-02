# Om Desktop - Project Context

## Overview

Om Desktop is an Electron-based desktop application for automated meeting recording, transcription, and analysis. It provides communication insights and metrics from recorded meetings.

**Recent Updates (v0.2.0-alpha.1)**:

- Menu bar-only app (doesn't appear in Dock via `LSUIElement`)
- Permission requests at launch (Screen Recording, Microphone, Accessibility)
- Code signing and notarization configured
- Simplified production build workflow with `npm run make:production`

## Tech Stack

- **Framework**: Electron + TypeScript
- **UI**: React with TypeScript
- **Build System**: Electron Forge + Vite
- **Auth**: Supabase Auth (OAuth: Google, Azure)
- **Storage**: electron-store (encrypted session storage)
- **Recording**: Native ScreenCaptureKit (macOS), Electron desktopCapturer
- **Package Manager**: npm

## Architecture

### Main Process (om-desktop/src/main.ts)

- Handles deep link protocol (`om://`)
- Manages authentication callbacks
- IPC handlers for auth, recording, subscriptions
- Window management

### Renderer Process (om-desktop/src/App.tsx, components/)

- React UI
- Auth state management via AuthContext
- Subscription status checks
- Recording controls

### Preload Script (om-desktop/src/preload.ts)

- **CRITICAL SECURITY BOUNDARY**
- Uses contextBridge to expose safe APIs
- Must maintain contextIsolation and disable nodeIntegration
- Validates all IPC messages

### Core Libraries (om-desktop/src/lib/)

- `auth.ts` - Authentication logic (OAuth, session management)
- `supabase.ts` - Supabase client configuration
- `session-store.ts` - Encrypted session storage using electron-store
- `config.ts` - Environment configuration

## Authentication Flow

**For detailed web app integration documentation, see @docs/desktop-integration.md**

### Quick Overview

The desktop and web apps maintain **independent Supabase sessions** using a magic link architecture:

1. **OAuth Sign-In Flow (Desktop -> Web -> Desktop)**
   - Desktop opens browser: `${webAppUrl}/login?source=desktop`
   - User completes OAuth on web
   - Web generates magic link and redirects: `om://auth/magiclink?token=xxx&email=yyy`
   - Desktop creates independent session via `verifyOtp()`

2. **Open Dashboard Flow (Desktop -> Web)**
   - Desktop requests magic link from API with Bearer token
   - Desktop opens browser with magic link in hash: `${webAppUrl}/login#magic_link_token=xxx&email=yyy`
   - Web auto-authenticates using `verifyOtp()` and shows dashboard

3. **Legacy Token Transfer (Fallback)**
   - Direct token sharing: `om://auth/success#access_token=xxx&refresh_token=yyy`
   - Used as fallback when magic link generation fails

**Key Benefits:**

- Independent sessions (sign out of web doesn't affect desktop)
- Secure token transfer via hash fragments
- Session persistence across restarts
- Seamless cross-platform access

## Security Requirements

### Electron Security

- `contextIsolation: true` (MUST be enabled)
- `nodeIntegration: false` (MUST be disabled)
- All main process APIs exposed via safe IPC handlers
- Preload script uses contextBridge only

### Authentication Security

- Tokens stored encrypted using electron-store
- Deep link tokens in hash fragments (not query params)
- Session refresh on expiry
- Secure OAuth redirectTo patterns

### Deep Link Security

- Validate all deep link URLs
- Parse tokens safely
- Handle malformed URLs gracefully
- Never expose secrets in URLs or logs

## Code Conventions

### TypeScript

- Strict mode enabled
- Explicit return types for functions
- Avoid `any` types
- Use interfaces for complex objects

### ESLint

- Configuration in `om-desktop/eslint.config.js`
- Must pass `npm run lint` before commit
- Auto-fixes available: `npm run lint -- --fix`

### Error Handling

- Try-catch blocks for async operations
- Console logging with prefixes: `[Auth]`, `[OAuth]`, `[Subscription]`, etc.
- Graceful degradation (don't crash on errors)

### Testing

- Test files in `om-desktop/src/__tests__/`
- Run: `npm test` (from om-desktop directory)
- Must maintain/increase coverage for new code

## Common Patterns

### IPC Handlers

```typescript
ipcMain.handle('handler-name', async (_event, ...args) => {
  try {
    // Implementation
    return { success: true, data };
  } catch (error) {
    console.error('[Handler] Error:', error);
    return { success: false, error: error.message };
  }
});
```

### Preload API Exposure

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  methodName: (...args) => ipcRenderer.invoke('handler-name', ...args),
});
```

### Session Management

```typescript
const { sessionStore } = await import('./lib/session-store');
const session = sessionStore.getSession();
sessionStore.setSession(newSession);
sessionStore.clearSession();
```

## Anti-Patterns to Avoid

- Don't disable `contextIsolation` or enable `nodeIntegration`
- Don't expose entire modules to renderer (use specific IPC handlers)
- Don't store tokens in localStorage or plain files
- Don't use query params for sensitive data in deep links
- Don't log sensitive information (tokens, passwords)
- Don't use synchronous file operations in main process

## Review Priorities

1. **Security**: Electron security, auth flows, token handling
2. **Architecture**: Proper process separation, IPC safety
3. **Auth**: Deep link flows, session management, OAuth
4. **Testing**: Coverage for auth/subscription flows
5. **Code Quality**: TypeScript types, error handling, logging
6. **Performance**: Avoid blocking main process

## Auto-Update System

Om Desktop uses **electron-updater** for automatic application updates via GitHub Releases.

**See @docs/desktop-releases.md for complete documentation.**

### How It Works

- **Update Server**: GitHub Releases
- **Check Frequency**: Startup (after 10s) + every 60 minutes
- **Update Types**:
  - Seamless: JS/TS, UI, config changes (no manual reinstall)
  - Manual: Electron version, native modules (requires reinstall)
- **User Flow**:
  1. Notification: "Update Available - Version X.X.X"
  2. User clicks "Download" -> Progress bar shows
  3. User clicks "Restart & Install" -> App restarts with new version
  4. Or dismisses -> Update installs on next app quit

### Configuration Files

- `om-desktop/package.json`: Contains `build.publish` config for GitHub
- `om-desktop/dev-app-update.yml`: Development update configuration
- `om-desktop/src/lib/auto-updater.ts`: Update service implementation
- `om-desktop/src/components/UpdateNotification.tsx`: UI notification component

## Dependencies

- Core: electron, react, typescript
- Auth: @supabase/supabase-js
- Storage: electron-store
- Updates: electron-updater
- Build: @electron-forge/\*, vite
- Testing: vitest, @testing-library/react
