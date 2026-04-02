import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { trackEvent, AcquisitionEvents } from '@/lib/analytics';

interface DesktopAuthState {
  isDesktopAuth: boolean;
  intent: 'subscribe' | null;
  loading: boolean;
  error: string | null;
  redirectedToDesktop: boolean; // True when user sent back to desktop app
}

// Valid intent values
const VALID_INTENTS = ['subscribe'] as const;
type ValidIntent = (typeof VALID_INTENTS)[number];

function isValidIntent(intent: string | null): intent is ValidIntent | null {
  return intent === null || VALID_INTENTS.includes(intent as ValidIntent);
}

/**
 * Basic JWT token validation (format check only, not cryptographic verification)
 * Just ensures the token looks like a JWT (3 parts separated by dots)
 */
function isValidJWT(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Hook to handle authentication from desktop app via magic link.
 *
 * When the desktop app redirects to the web app with tokens, this hook:
 * 1. Auto-logs in the user with provided tokens
 * 2. Tracks the desktop auth source
 * 3. Returns the intent (e.g., 'subscribe') so the page can redirect accordingly
 *
 * Usage:
 * ```tsx
 * const { isDesktopAuth, intent, loading, error } = useDesktopAuth();
 *
 * // After successful payment:
 * if (isDesktopAuth) {
 *   redirectToDesktop();
 * }
 * ```
 */
export function useDesktopAuth(): DesktopAuthState {
  const [state, setState] = useState<DesktopAuthState>({
    isDesktopAuth: false,
    intent: null,
    loading: false,
    error: null,
    redirectedToDesktop: false,
  });

  useEffect(() => {
    const handleDesktopAuth = async () => {
      // SECURITY: Read tokens from hash fragment (not sent to server)
      // Desktop app sends: /signup#access_token=xxx&refresh_token=yyy&source=desktop&intent=subscribe
      const hash = window.location.hash.substring(1); // Remove '#'
      const hashParams = new URLSearchParams(hash);

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const source = hashParams.get('source');
      const intentParam = hashParams.get('intent');

      // Not a desktop auth request
      if (!accessToken || !refreshToken || source !== 'desktop') {
        return;
      }

      // Validate token format
      if (!isValidJWT(accessToken) || !isValidJWT(refreshToken)) {
        console.error('[DesktopAuth] Invalid token format');
        setState({
          isDesktopAuth: true,
          intent: null,
          loading: false,
          error: 'Invalid authentication tokens',
          redirectedToDesktop: false,
        });
        return;
      }

      // Validate intent parameter
      if (intentParam && !isValidIntent(intentParam)) {
        console.error('[DesktopAuth] Invalid intent:', intentParam);
        setState({
          isDesktopAuth: true,
          intent: null,
          loading: false,
          error: 'Invalid request parameters',
          redirectedToDesktop: false,
        });
        return;
      }

      const intent = intentParam as 'subscribe' | null;

      setState({
        isDesktopAuth: true,
        intent,
        loading: true,
        error: null,
        redirectedToDesktop: false,
      });

      try {
        const supabase = createClient();

        // CRITICAL: Wait for auth state to propagate before continuing
        // Set up listener BEFORE calling setSession to catch the state change
        const authStatePromise = new Promise<void>((resolve) => {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              console.log('[DesktopAuth] Auth state change detected:', event);
              subscription.unsubscribe();
              resolve();
            }
          });
        });

        // Auto-login with provided tokens
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error('[DesktopAuth] Error setting session:', sessionError);
          setState({
            isDesktopAuth: true,
            intent,
            loading: false,
            error:
              sessionError.message || 'Failed to authenticate from desktop',
            redirectedToDesktop: false,
          });
          return;
        }

        // Wait for auth state to actually propagate through the system
        await authStatePromise;

        console.log('[DesktopAuth] Auto-logged in from desktop app');

        // Track desktop auth source
        trackEvent(AcquisitionEvents.DESKTOP_AUTH, {
          source: 'desktop',
          intent: intent || 'unknown',
        });

        // Sync app_downloaded status to Intercom for real-time targeting
        try {
          await fetch('/api/intercom/sync-app-downloaded', {
            method: 'POST',
          });
        } catch (err) {
          console.error('[DesktopAuth] Error syncing to Intercom:', err);
          // Don't throw - Intercom sync failures shouldn't break auth flow
        }

        // Check if user already has subscription
        if (intent === 'subscribe') {
          // Get user's subscription status
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const { data: subscription } = await supabase
              .from('subscriptions')
              .select('status')
              .eq('user_id', user.id)
              .single();

            // If already subscribed, send tokens to desktop and close browser
            if (
              subscription?.status === 'active' ||
              subscription?.status === 'trialing'
            ) {
              console.log(
                '[DesktopAuth] User already subscribed, generating magic link for desktop app'
              );

              // Generate magic link and redirect to desktop
              try {
                const { data: magicLinkData, error: magicLinkError } =
                  await supabase.functions.invoke('generate-magic-link', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                    },
                  });

                if (
                  magicLinkError ||
                  !magicLinkData?.success ||
                  !magicLinkData?.hashedToken
                ) {
                  console.error(
                    '[DesktopAuth] Error generating magic link:',
                    magicLinkError || magicLinkData
                  );
                  throw new Error('Failed to generate magic link');
                }

                const redirectUrl = `om://auth/magiclink?token=${encodeURIComponent(
                  magicLinkData.hashedToken
                )}&email=${encodeURIComponent(magicLinkData.email || '')}`;

                // Open the protocol URL (desktop app will handle it)
                window.location.href = redirectUrl;
              } catch (err) {
                console.error(
                  '[DesktopAuth] Failed to redirect to desktop:',
                  err
                );
                setState({
                  isDesktopAuth: true,
                  intent: null,
                  loading: false,
                  error: 'Failed to redirect to desktop app',
                  redirectedToDesktop: false,
                });
                return;
              }

              // Show success message and stop further processing
              setState({
                isDesktopAuth: true,
                intent: null,
                loading: false,
                error: null,
                redirectedToDesktop: true, // Mark as redirected
              });
              return;
            }
          }

          // User needs to subscribe
          // DON'T navigate - let the page handle showing paywall
          console.log('[DesktopAuth] User needs subscription');
          setState({
            isDesktopAuth: true,
            intent,
            loading: false,
            error: null,
            redirectedToDesktop: false,
          });
          return;
        } else {
          // No specific intent, just authenticated
          setState({
            isDesktopAuth: true,
            intent,
            loading: false,
            error: null,
            redirectedToDesktop: false,
          });
        }
      } catch (err) {
        console.error('[DesktopAuth] Unexpected error:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        setState({
          isDesktopAuth: true,
          intent,
          loading: false,
          error: errorMessage,
          redirectedToDesktop: false,
        });
      }
    };

    handleDesktopAuth();
  }, []); // Run once on mount - reads from window.location.hash

  return state;
}

/**
 * Helper function to redirect back to desktop app with a magic link.
 * Call this after successful payment/subscription from desktop app.
 *
 * SECURITY: Uses magic link approach:
 * - Generates a one-time token via Edge Function
 * - Token is hashed and cannot be reused
 * - Desktop app creates independent session via verifyOtp()
 * - More secure than direct token transfer
 *
 * Format: om://auth/magiclink?token=xxx&email=yyy
 */
export async function redirectToDesktop() {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.error('[DesktopAuth] No session found for desktop redirect');
      return;
    }

    // Generate magic link via Edge Function
    const { data, error } = await supabase.functions.invoke(
      'generate-magic-link',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (error || !data?.success || !data?.hashedToken) {
      console.error(
        '[DesktopAuth] Error generating magic link:',
        error || data
      );
      throw new Error('Failed to generate magic link');
    }

    // Redirect to desktop app with magic link
    const redirectUrl = `om://auth/magiclink?token=${encodeURIComponent(
      data.hashedToken
    )}&email=${encodeURIComponent(data.email || '')}`;

    window.location.href = redirectUrl;
  } catch (err) {
    console.error('[DesktopAuth] Error redirecting to desktop:', err);
  }
}
