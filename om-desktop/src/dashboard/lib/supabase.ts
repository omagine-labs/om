import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import * as Sentry from '@sentry/electron/renderer';

// Singleton instance to avoid multiple GoTrueClient instances
let supabaseInstance: ReturnType<typeof createSupabaseClient<Database>> | null =
  null;
let sessionRestorePromise: Promise<void> | null = null;
let activeRefreshPromise: Promise<void> | null = null;
let restoreInProgress = false;

/**
 * Creates or returns existing Supabase client for use in the desktop app
 * Using supabase-js directly (not SSR) since this is an Electron app
 * Session is shared with main process via IPC
 * @returns Supabase client (singleton)
 */
export function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient<Database>(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        auth: {
          // Don't persist to localStorage - we use main process encrypted storage
          persistSession: false,
          // Disable auto-refresh - main process handles all token refreshes
          // This prevents race conditions where frontend and main process both try to refresh
          autoRefreshToken: false,
          detectSessionInUrl: false, // We handle magic links manually
        },
      }
    );

    // Only initiate session restore when creating the client for the first time
    // Subsequent calls will reuse the same instance with the restored session
    sessionRestorePromise = restoreSessionFromMainProcess();
  }

  return supabaseInstance;
}

/**
 * Ensure session is restored before proceeding
 * Call this before checking auth status
 */
export async function ensureSessionRestored() {
  if (sessionRestorePromise) {
    await sessionRestorePromise;
  }
}

/**
 * Restore session from main process encrypted storage
 * The main process handles all session persistence
 */
async function restoreSessionFromMainProcess() {
  // Prevent concurrent restore attempts
  if (restoreInProgress) {
    return;
  }

  restoreInProgress = true;
  const startTime = Date.now();

  try {
    // Add breadcrumb for session restore initiation
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'Session restoration initiated',
      level: 'info',
      data: { timestamp: startTime },
    });

    if (!window.electronAPI?.auth?.getSession) {
      console.warn(
        '[Dashboard Supabase] electronAPI.auth.getSession not available'
      );

      // Track missing IPC API
      Sentry.captureMessage(
        'electronAPI.auth.getSession not available during session restore',
        {
          level: 'warning',
          tags: { component: 'session_restore' },
          extra: { timing: Date.now() - startTime },
        }
      );
      return;
    }

    let session = await window.electronAPI.auth.getSession();

    // If no session on first try, retry with exponential backoff
    // This handles race conditions where dashboard opens before deep link handler finishes
    if (!session) {
      const maxRetries = 5;
      const baseDelay = 100; // Start with 100ms

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 100, 200, 400, 800, 1600ms
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check if electronAPI is available before calling
        if (!window.electronAPI?.auth?.getSession) {
          continue;
        }

        session = await window.electronAPI.auth.getSession();

        if (session) {
          break;
        }
      }

      if (!session) {
        // Add breadcrumb for missing session after retries
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'No session available after retries',
          level: 'info',
          data: { timing: Date.now() - startTime, retries: maxRetries },
        });
        return;
      }
    }

    // Check token expiry
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at || 0;
    const secondsUntilExpiry = expiresAt - now;
    const isExpired = secondsUntilExpiry <= 0;

    if (isExpired) {
      console.error(
        '[Dashboard Supabase] Received EXPIRED tokens from main process! Requesting refresh.'
      );

      // Track this critical issue in Sentry
      Sentry.captureMessage('Received expired tokens from main process', {
        level: 'error',
        tags: { component: 'session_restore' },
        extra: {
          expiresAt: new Date(expiresAt * 1000).toISOString(),
          secondsUntilExpiry,
          timing: Date.now() - startTime,
        },
      });

      // Request fresh tokens from main process
      if (window.electronAPI?.auth?.refreshSession) {
        try {
          await window.electronAPI.auth.refreshSession();

          // Get the refreshed session
          session = await window.electronAPI.auth.getSession();

          if (!session) {
            throw new Error('No session returned after refresh');
          }

          // Verify tokens are now valid
          const newExpiresAt = session.expires_at || 0;
          const newSecondsUntilExpiry = newExpiresAt - now;

          if (newSecondsUntilExpiry <= 0) {
            throw new Error('Refreshed tokens are still expired');
          }
        } catch (error) {
          console.error(
            '[Dashboard Supabase] Failed to refresh expired tokens:',
            error
          );

          Sentry.captureException(error, {
            level: 'error',
            tags: {
              component: 'session_restore',
              error_type: 'refresh_failed',
            },
            extra: {
              timing: Date.now() - startTime,
            },
          });

          // Can't proceed without valid tokens
          throw new Error(
            `Failed to get fresh tokens from main process: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      } else {
        throw new Error('Cannot refresh expired tokens - IPC not available');
      }
    }

    if (!supabaseInstance) {
      console.warn(
        '[Dashboard Supabase] Supabase instance not initialized, initializing now'
      );

      // Initialize the client if it doesn't exist yet
      // This can happen during refreshSession() calls before the first createClient()
      supabaseInstance = createSupabaseClient<Database>(
        getSupabaseUrl(),
        getSupabaseAnonKey(),
        {
          auth: {
            persistSession: false,
            // Disable auto-refresh - main process handles all token refreshes
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );
    }

    // CRITICAL: Only pass access_token, NOT refresh_token
    // The refresh_token must stay exclusively in the main process to prevent:
    // 1. Frontend Supabase client attempting its own refresh (race condition)
    // 2. Stale refresh tokens being used after sleep/wake
    // 3. "Invalid Refresh Token: Already Used" errors
    //
    // We use a placeholder refresh token because setSession requires both,
    // but with autoRefreshToken: false, it should never be used.
    const { data: sessionData, error } = await supabaseInstance.auth.setSession(
      {
        access_token: session.access_token,
        refresh_token: 'MANAGED_BY_MAIN_PROCESS', // Placeholder - actual refresh via IPC only
      }
    );

    const duration = Date.now() - startTime;

    if (error) {
      console.error('[Dashboard Supabase] Error restoring session:', error);

      // Capture session restore errors
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          component: 'session_restore',
          error_type: 'setSession_failed',
        },
        extra: {
          duration,
          error_message: error.message,
        },
      });
      return;
    }

    // Verify we got valid session data back
    if (!sessionData?.session || !sessionData?.user) {
      console.error(
        '[Dashboard Supabase] setSession succeeded but returned no session/user data'
      );

      Sentry.captureMessage('setSession returned no session data', {
        level: 'error',
        tags: {
          component: 'session_restore',
          error_type: 'missing_session_data',
        },
        extra: {
          duration,
          hasSession: !!sessionData?.session,
          hasUser: !!sessionData?.user,
        },
      });
      return;
    }

    // CRITICAL FIX: Verify auth state is actually ready by calling getUser()
    // This prevents race condition where setSession succeeds but getUser() returns null
    // Retry up to 3 times with 50ms delay between attempts
    let userVerified = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const {
        data: { user },
      } = await supabaseInstance.auth.getUser();

      if (user) {
        userVerified = true;
        break;
      }

      // Wait before retry
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    if (!userVerified) {
      console.error(
        '[Dashboard Supabase] Session set but auth state not ready after retries'
      );

      Sentry.captureMessage('Auth state not ready after setSession', {
        level: 'error',
        tags: {
          component: 'session_restore',
          error_type: 'auth_state_not_ready',
        },
        extra: {
          duration: Date.now() - startTime,
          hasSessionData: !!sessionData?.session,
        },
      });
      return;
    }

    // Send breadcrumb to Sentry for monitoring
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'Session restored successfully',
      level: 'info',
      data: {
        duration,
        userId: sessionData.user.id,
      },
    });

    // Track slow session restores (potential performance issue)
    if (duration > 2000) {
      Sentry.captureMessage('Slow session restoration detected', {
        level: 'warning',
        tags: { component: 'session_restore' },
        extra: { duration },
      });
    }
  } catch (error) {
    console.error('[Dashboard Supabase] Error restoring session:', error);

    // Capture unexpected errors during session restore
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        component: 'session_restore',
        error_type: 'unexpected_error',
      },
      extra: {
        duration: Date.now() - startTime,
      },
    });
  } finally {
    // Always clear the restore flag so future restores can proceed
    restoreInProgress = false;
  }
}

/**
 * Force refresh session from main process
 * Call this after sign-in to ensure session is loaded
 * Protected against concurrent calls - if a refresh is already in progress,
 * subsequent calls will wait for the active refresh to complete
 */
export async function refreshSession() {
  // If a refresh is already in progress, wait for it instead of starting a new one
  // This prevents "Invalid Refresh Token: Already Used" errors from concurrent refresh attempts
  if (activeRefreshPromise) {
    await activeRefreshPromise;
    return;
  }

  const startTime = Date.now();

  // Add breadcrumb for forced refresh
  Sentry.addBreadcrumb({
    category: 'auth',
    message: 'Force refresh session initiated',
    level: 'info',
    data: { timestamp: startTime },
  });

  // Create the refresh promise and store it to prevent concurrent refreshes
  activeRefreshPromise = (async () => {
    try {
      // Create a new session restore promise to force a fresh check
      sessionRestorePromise = restoreSessionFromMainProcess();
      await sessionRestorePromise;

      const duration = Date.now() - startTime;

      // Add breadcrumb for successful refresh
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'Force refresh session completed',
        level: 'info',
        data: { duration },
      });

      // Track slow refreshes
      if (duration > 3000) {
        Sentry.captureMessage('Slow session refresh detected', {
          level: 'warning',
          tags: { component: 'session_refresh' },
          extra: { duration },
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Dashboard Supabase] Session refresh failed:', error);

      // Capture refresh failures
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          component: 'session_refresh',
          error_type: 'refresh_failed',
        },
        extra: { duration },
      });

      throw error;
    } finally {
      // Clear the active refresh promise so future calls can proceed
      activeRefreshPromise = null;
    }
  })();

  await activeRefreshPromise;
}
