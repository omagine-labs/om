import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import { updateIntercomUser } from '@/lib/intercom-api';
import { generateMagicLinkServer } from '@/lib/magic-link-server';
import { GAME_ONLY_ACCESS, APP_ACCESS } from '@/lib/constants/app-access';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const source = requestUrl.searchParams.get('source');
  const game = requestUrl.searchParams.get('game'); // Game signup context
  const next = requestUrl.searchParams.get('next') || '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      console.log('OAuth callback successful:', {
        hasSession: !!data.session,
        hasProviderToken: !!data.session?.provider_token,
        hasProviderRefreshToken: !!data.session?.provider_refresh_token,
        provider: data.session?.user?.app_metadata?.provider,
      });

      // Track OAuth success outcome (signup or login)
      try {
        const provider = data.session.user?.app_metadata?.provider;
        const providerName = provider === 'azure' ? 'microsoft' : provider;

        // Determine if this is a new signup or existing user login
        const userCreatedAt = new Date(data.session.user.created_at);
        const now = new Date();
        const secondsSinceCreation =
          (now.getTime() - userCreatedAt.getTime()) / 1000;
        const isNewSignup = secondsSinceCreation < 60;

        if (isNewSignup) {
          // Track signup_completed for new OAuth signups
          await supabase.from('user_event_log').insert({
            user_id: data.session.user.id,
            event_name: 'signup_completed',
            payload: {
              method: providerName,
              app: game === 'true' ? APP_ACCESS.BLINDSLIDE : APP_ACCESS.OM,
            },
          });

          // Set app_access for game-only signups
          if (game === 'true') {
            await supabase
              .from('users')
              .update({ app_access: GAME_ONLY_ACCESS })
              .eq('id', data.session.user.id);
          }
        } else {
          // Track user_logged_in for existing user OAuth logins
          await supabase.from('user_event_log').insert({
            user_id: data.session.user.id,
            event_name: 'user_logged_in',
            payload: {
              method: providerName,
            },
          });
        }
      } catch (err) {
        console.error('Error tracking OAuth success event:', err);
      }

      // Store provider tokens in database if available
      const provider = data.session.user?.app_metadata?.provider;
      if (
        data.session.provider_token &&
        (provider === 'google' || provider === 'azure')
      ) {
        try {
          const expiresAt = new Date();
          // Google tokens expire in 1 hour, Azure tokens typically in 1 hour as well
          expiresAt.setHours(expiresAt.getHours() + 1);

          // Map 'azure' provider to 'microsoft' for consistency in database
          const providerName = provider === 'azure' ? 'microsoft' : provider;

          const { error: tokenError } = await supabase
            .from('oauth_tokens')
            .upsert(
              {
                user_id: data.session.user.id,
                provider: providerName,
                access_token: data.session.provider_token,
                refresh_token: data.session.provider_refresh_token,
                expires_at: expiresAt.toISOString(),
              },
              {
                onConflict: 'user_id,provider',
                ignoreDuplicates: false,
              }
            );

          if (tokenError) {
            console.error('Error storing OAuth tokens:', tokenError);
          } else {
            console.log(`Successfully stored ${providerName} OAuth tokens`);

            // Track calendar_connected event
            try {
              await supabase.from('user_event_log').insert({
                user_id: data.session.user.id,
                event_name: 'calendar_connected',
                payload: {
                  provider: providerName,
                  has_refresh_token: !!data.session.provider_refresh_token,
                },
              });
            } catch (err) {
              console.error('Error tracking calendar_connected event:', err);
            }

            // Sync calendar connection status to Intercom for real-time targeting
            try {
              await updateIntercomUser(data.session.user.id, {
                calendar_connected: true,
              });
            } catch (err) {
              console.error(
                'Error syncing calendar connection to Intercom:',
                err
              );
              // Don't throw - Intercom failures shouldn't block OAuth flow
            }
          }
        } catch (err) {
          console.error('Exception storing OAuth tokens:', err);
        }
      }

      // If this is a desktop auth request, check subscription first
      if (source === 'desktop') {
        console.log(
          '[OAuth Callback] Desktop auth - checking subscription status'
        );

        // Check if user has active subscription
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status, current_period_end')
          .eq('user_id', data.session.user.id)
          .maybeSingle();

        const hasActiveSubscription = subscription
          ? ['active', 'trialing'].includes(subscription.status) &&
            (!subscription.current_period_end ||
              new Date(subscription.current_period_end) > new Date())
          : false;

        if (!hasActiveSubscription) {
          // User needs subscription - redirect to paywall instead of desktop
          console.log(
            '[OAuth Callback] No subscription - redirecting to paywall'
          );
          return NextResponse.redirect(
            new URL('/paywall?source=desktop', requestUrl.origin)
          );
        }

        // User has subscription - proceed with desktop redirect
        console.log('[OAuth Callback] Generating magic link for desktop app');

        try {
          // Call Edge Function to generate magic link (no service role key exposure)
          const { hashedToken, email } = await generateMagicLinkServer(
            data.session.access_token
          );

          // Redirect directly to desktop app with magic link token
          const desktopRedirectUrl = `om://auth/magiclink?token=${encodeURIComponent(
            hashedToken
          )}&email=${encodeURIComponent(email)}`;

          console.log(
            '[OAuth Callback] Redirecting to desktop app with magic link'
          );

          // Return HTML that automatically redirects to desktop app
          // This is more reliable than NextResponse.redirect for custom protocols
          return new Response(
            `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to Desktop App...</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      background: #0f766e;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
      overflow: hidden;
    }
    .noise-overlay {
      position: absolute;
      inset: 0;
      opacity: 0.15;
      pointer-events: none;
      background-image: url('/noise.svg');
      background-repeat: repeat;
      background-size: 200px 200px;
      z-index: 1;
    }
    .bg-circle {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: -440px;
      width: 150vw;
      max-width: 1200px;
      height: 1200px;
      background: #34d399;
      opacity: 0.7;
      filter: blur(150px);
      border-radius: 50%;
      pointer-events: none;
    }
    .bg-ellipse {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: -300px;
      width: 200vw;
      max-width: 2000px;
      height: 500px;
      background: #bef264;
      opacity: 0.7;
      filter: blur(200px);
      border-radius: 50%;
      pointer-events: none;
    }
    .blinds-overlay {
      position: absolute;
      top: -40px;
      left: 50%;
      transform: translateX(-50%) rotate(-2deg);
      height: 500px;
      width: auto;
      pointer-events: none;
      opacity: 0.06;
      mix-blend-mode: plus-lighter;
      filter: blur(10px);
      z-index: 2;
    }
    .container {
      position: relative;
      z-index: 10;
      max-width: 32rem;
      width: 100%;
      background: white;
      padding: 3rem;
      text-align: center;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-family: 'Fraunces', serif;
      font-size: 3rem;
      font-weight: 600;
      color: #0f172a;
      letter-spacing: -0.05em;
    }
    .subtitle { color: #4b5563; font-size: 1.125rem; margin: 0.5rem 0; }
    .spinner {
      width: 48px;
      height: 48px;
      border: 6px solid #f0ebda;
      border-top-color: #ff963a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 1.5rem auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint { font-size: 0.875rem; color: #6b7280; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="noise-overlay"></div>
  <div class="bg-circle"></div>
  <div class="bg-ellipse"></div>
  <img src="/blinds.svg" alt="" class="blinds-overlay" />
  <div class="container">
    <h1>Authentication Successful!</h1>
    <div class="spinner"></div>
    <p class="subtitle">Opening desktop app...</p>
    <p class="hint">If the app doesn't open automatically, you can close this window.</p>
  </div>
  <script>
    window.location.href = ${JSON.stringify(desktopRedirectUrl)};
    setTimeout(() => { window.close(); }, 2000);
  </script>
</body>
</html>`,
            {
              status: 200,
              headers: {
                'Content-Type': 'text/html',
              },
            }
          );
        } catch (err) {
          console.error('[OAuth Callback] Error generating magic link:', err);
          // Show error - don't fall back to legacy token transfer
          return new Response(
            `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Error</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .container { text-align: center; padding: 2rem; max-width: 400px; }
    h1 { color: #ef4444; margin-bottom: 1rem; }
    p { color: #6b7280; margin-bottom: 1.5rem; }
    a { color: #0f766e; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authentication Error</h1>
    <p>We couldn't complete the sign-in process. Please try again.</p>
    <a href="/login?source=desktop">Try Again</a>
  </div>
</body>
</html>`,
            {
              status: 500,
              headers: { 'Content-Type': 'text/html' },
            }
          );
        }
      }

      // Redirect based on context
      // Game signups go to game page (or custom redirect), Om signups go to dashboard
      const defaultPath = game === 'true' ? '/game' : '/dashboard';
      const redirectPath = next !== '/dashboard' ? next : defaultPath;
      return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
    } else {
      console.error('OAuth callback error:', error);
      // Note: We don't track oauth_callback_error here because we don't have
      // a user session to associate the event with. OAuth errors are logged
      // to console for debugging.
    }
  }

  // If there's an error or no code, redirect to login
  console.log('No code in callback, redirecting to login');
  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
