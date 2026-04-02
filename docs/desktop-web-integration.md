# Web App Integration Guide

## Authentication Architecture

This document describes the authentication flows between the web app and desktop app, including the secure magic link architecture for independent sessions.

### Overview

The desktop and web apps maintain **independent Supabase sessions** using a magic link architecture. This provides:

- Device-independent authentication (signing out of web doesn't affect desktop)
- Secure token transfer via hash fragments
- Seamless cross-platform access without re-entering credentials
- Better security with separate refresh tokens per client

**Desktop Internal Architecture:**

The desktop app uses a **centralized auth state machine** in the main process to manage all authentication state. This is internal to the desktop app and doesn't affect web integration - from the web app's perspective, you simply generate magic links or redirect with tokens as described below.

For desktop architecture details, see `docs/desktop-integration.md`.

### Two Authentication Patterns

1. **Magic Link Authentication** (Recommended) - Creates independent sessions
2. **Legacy Token Transfer** (Fallback) - Shares session between clients

---

## 1. Magic Link Authentication (Recommended)

### How It Works

Magic links create **independent sessions** for desktop and web using Supabase's `verifyOtp()` API:

```
┌─────────┐      OAuth      ┌─────────┐   Magic Link   ┌─────────┐
│ Desktop │ ──────────────> │   Web   │ ─────────────> │ Desktop │
└─────────┘                 └─────────┘                └─────────┘
    │                            │                          │
    │ 1. Opens browser           │ 2. Completes OAuth      │
    │ for OAuth                  │ and generates           │
    │                            │ magic link              │
    │                            │                          │ 3. Creates
    │                            │                          │ independent
    │                            │                          │ session via
    │                            │                          │ verifyOtp()
```

### OAuth Sign-In Flow (Desktop → Web → Desktop)

1. **Desktop initiates OAuth:**

   ```typescript
   // Desktop opens browser for OAuth
   shell.openExternal(`${webAppUrl}/login?source=desktop`);
   ```

2. **User completes OAuth on web**

3. **Web generates magic link and redirects:**

   ```typescript
   // In web app's OAuth callback (e.g., /auth/callback/route.ts)
   if (source === 'desktop') {
     // Generate magic link using service role client
     const { data } = await adminClient.auth.admin.generateLink({
       type: 'magiclink',
       email: user.email,
       options: {
         redirectTo: 'om://auth/magiclink',
       },
     });

     // Redirect to desktop with hashed token
     const redirectUrl = `om://auth/magiclink?token=${encodeURIComponent(data.properties.hashed_token)}&email=${encodeURIComponent(user.email)}`;
     window.location.href = redirectUrl;
   }
   ```

4. **Desktop receives deep link and creates session:**

   ```typescript
   // In src/main.ts - handleMagicLink()
   const { data, error } = await supabase.auth.verifyOtp({
     token_hash: token,
     type: 'magiclink',
   });

   if (data.session) {
     sessionStore.setSession(data.session); // Independent session!
   }
   ```

### Open Dashboard Flow (Desktop → Web)

When user clicks "Open Dashboard" from desktop menu bar:

1. **Desktop requests magic link from Edge Function:**

   ```typescript
   // src/services/menu-bar.ts - openDashboard()
   const { data, error } = await supabase.functions.invoke(
     'generate-magic-link',
     {
       method: 'POST',
       headers: {
         Authorization: `Bearer ${session.access_token}`,
       },
     }
   );

   const { hashedToken, email } = data;
   ```

2. **Desktop opens browser with magic link in URL hash:**

   ```typescript
   const loginUrl = `${webAppUrl}/login#magic_link_token=${encodeURIComponent(hashedToken)}&email=${encodeURIComponent(email)}`;
   shell.openExternal(loginUrl);
   ```

3. **Web reads hash and creates session:**

   ```typescript
   // In components/MagicLinkHandler.tsx (runs in root layout)
   useEffect(() => {
     const hash = window.location.hash.substring(1);
     const params = new URLSearchParams(hash);
     const token = params.get('magic_link_token');
     const email = params.get('email');

     if (token && email) {
       const { data } = await supabase.auth.verifyOtp({
         token_hash: token,
         type: 'magiclink',
       });

       if (data.session) {
         router.push('/dashboard'); // Independent web session!
       }
     }
   }, []);
   ```

### Web API Implementation

The magic link generation endpoint must support **both** authentication methods:

```typescript
// /app/api/auth/generate-magic-link/route.ts
export async function POST(request: Request) {
  let user;

  // Try Bearer token first (desktop app)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const adminClient = createServiceRoleClient();
    const { data } = await adminClient.auth.getUser(token);
    if (data.user) user = data.user;
  }

  // Fall back to cookie-based auth (web app)
  if (!user) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) throw new UnauthorizedError();

  // Generate magic link
  const adminClient = createServiceRoleClient();
  const { data } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email!,
  });

  return NextResponse.json({
    success: true,
    hashedToken: data.properties.hashed_token,
    email: user.email,
  });
}
```

### Benefits of Magic Links

- ✅ **Independent sessions** - Sign out of web doesn't affect desktop
- ✅ **Better security** - Each client has its own refresh token
- ✅ **Seamless UX** - No credential re-entry when switching platforms
- ✅ **Session persistence** - Desktop stays authenticated across restarts
- ✅ **Offline capable** - Desktop can work offline with its own session

---

## 2. Legacy Token Transfer (Fallback)

### Implementation

```javascript
window.location.href = `om://auth/success#access_token=${accessToken}&refresh_token=${refreshToken}&expires_at=${expiresAt}`;
```

**Why hash fragments?**

- Never sent to servers (unlike query params)
- Not stored in browser history
- No Referer header leaks

### Web App Implementation

Update your `useDesktopAuth.ts` hook (around line 190-225) to use the new pattern:

```typescript
// In frontend/hooks/useDesktopAuth.ts

export function useDesktopAuth() {
  // ... existing code ...

  const handleDesktopRedirect = useCallback((session: Session) => {
    if (!session?.access_token || !session?.refresh_token) {
      console.error('Missing tokens for desktop redirect');
      return;
    }

    // Build redirect URL with tokens in hash fragment
    const redirectUrl = new URL('om://auth/success');

    // Important: Use hash fragment (#) instead of query params (?)
    redirectUrl.hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at?.toString() || '',
    }).toString();

    console.log('Redirecting to desktop app (secure mode)');

    // Redirect to desktop app
    window.location.href = redirectUrl.href;
  }, []);

  return { handleDesktopRedirect };
}
```

### Alternative: Direct String Construction

If you prefer not to use URL API:

```typescript
const redirectUrl = `om://auth/success#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&expires_at=${session.expires_at}`;

window.location.href = redirectUrl;
```

### Desktop App Implementation

The desktop app handles three deep link routes:

1. **`om://auth/magiclink?token=xxx&email=yyy`** - Magic link authentication (recommended)
   - Creates independent session via `verifyOtp()`
   - Handled by `handleMagicLink()` in `src/main.ts`

2. **`om://auth/success#access_token=xxx&refresh_token=yyy`** - Legacy token transfer
   - Shares session between clients (fallback only)
   - Handled by `handleAuthSuccess()` in `src/main.ts`

3. **`om://auth/callback#access_token=xxx`** - OAuth callback (uses magic link internally)
   - Standard OAuth flow (Google, Azure)
   - Handled by `handleOAuthCallback()` in `src/main.ts`

### Testing the Integration

#### Test Magic Link Flow:

```bash
# Test magic link authentication (after generating a real token from your API)
open "om://auth/magiclink?token=<hashed_token>&email=user@example.com"
```

#### Test Legacy Flow:

```bash
# Test legacy token transfer (fallback)
open "om://auth/success#access_token=test_access_token&refresh_token=test_refresh_token&expires_at=1234567890"
```

#### Integration Test Checklist:

1. **OAuth Sign-In:**
   - [ ] Desktop opens browser for OAuth
   - [ ] User completes OAuth on web
   - [ ] Web generates magic link
   - [ ] Desktop receives `om://auth/magiclink` deep link
   - [ ] Desktop creates independent session
   - [ ] Menu bar shows "Om - Ready"

2. **Open Dashboard:**
   - [ ] User signs out of web
   - [ ] Desktop still shows authenticated
   - [ ] Click "Open Dashboard" from menu bar
   - [ ] Desktop requests magic link from API
   - [ ] Browser opens with magic link in hash
   - [ ] Web auto-authenticates and shows dashboard
   - [ ] Both desktop and web are authenticated independently

3. **Sign Out Independence:**
   - [ ] Both desktop and web authenticated
   - [ ] Sign out of web
   - [ ] Desktop stays authenticated
   - [ ] Desktop can still use "Open Dashboard" to re-authenticate web

### Security Comparison

| Method             | Query Params (`?`) | Hash Fragment (`#`) |
| ------------------ | ------------------ | ------------------- |
| Sent to server     | ✅ Yes             | ❌ No               |
| In browser history | ✅ Yes             | ❌ No               |
| In Referer header  | ✅ Yes             | ❌ No               |
| In deep link logs  | ✅ Yes             | ⚠️ Maybe\*          |
| Accessible via JS  | ✅ Yes             | ✅ Yes              |

\*Hash fragments may still appear in some OS-level deep link logs, but they're not transmitted over the network.

### Code References

**Desktop App:**

**Auth Architecture:**

- Auth State Machine: `src/lib/auth-state-machine.ts` (manages auth state)
- Auth Service: `src/lib/auth.ts` (wraps state machine)
- Auth Health Checker: `src/lib/auth-health-checker.ts` (keeps tokens fresh)
- Session Storage: `src/lib/session-store.ts` (encrypted storage)

**Deep Link Handlers:**

- Deep Link Router: `src/main.ts` (handleDeepLink function)
- Magic Link Handler: `src/ipc/auth-handlers.ts` (handleMagicLink function)
- Legacy Auth Handler: `src/ipc/auth-handlers.ts` (handleAuthSuccess function)
- OAuth Callback Handler: `src/ipc/auth-handlers.ts` (handleOAuthCallback function)

**IPC Layer:**

- Auth IPC Handlers: `src/ipc/auth-handlers.ts` (registerAuthHandlers function)
- Menu Bar Service: `src/services/menu-bar.ts` (openDashboard method)

**Web App:**

- OAuth Callback: `/app/auth/callback/route.ts` (generates magic link for desktop)
- Magic Link API: `/app/api/auth/generate-magic-link/route.ts` (dual auth support)
- Magic Link Handler: `/components/MagicLinkHandler.tsx` (processes hash tokens)
- Sign Out: `/lib/auth.ts` (uses `scope: 'local'` for independent sessions)

### Questions or Issues?

If you encounter any issues with the integration:

1. Check desktop app console logs (look for `[AuthSuccess]` or `[MagicLink]` prefixes)
2. Verify the redirect URL format matches the examples above
3. Ensure tokens are URL-encoded if they contain special characters
4. Test with the provided test URLs to isolate web app vs desktop app issues
