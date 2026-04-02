import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import { APP_ACCESS } from '@/lib/constants/app-access';
import { isGameDomain } from '@/lib/domain';

/**
 * Check if user has access to Om (protected routes)
 * Returns true if:
 * - User has 'om' in app_access, AND
 * - User has has_active_subscription flag set to true, OR
 * - User has a subscription with status 'active' or 'trialing' that hasn't ended yet
 *   (even if cancel_at_period_end is true, they have access until period ends)
 */
async function checkUserHasOmAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<{ hasAppAccess: boolean; hasSubscription: boolean }> {
  // Check app_access and subscription status in one query
  const { data: userData } = await supabase
    .from('users')
    .select('app_access, has_active_subscription')
    .eq('id', userId)
    .single();

  const appAccess = userData?.app_access || [];
  const hasAppAccess = appAccess.includes(APP_ACCESS.OM);

  // If no Om app access, no need to check subscription
  if (!hasAppAccess) {
    return { hasAppAccess: false, hasSubscription: false };
  }

  if (userData?.has_active_subscription) {
    return { hasAppAccess: true, hasSubscription: true };
  }

  // If flag is false, double-check the subscription table
  // User might have an active subscription that's scheduled for cancellation
  // but still has access until period end
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    return { hasAppAccess: true, hasSubscription: false };
  }

  // Check if subscription is active/trialing AND hasn't ended yet
  // For trialing status, period_end might be null, so we only check the date if it exists
  const isActiveStatus = ['active', 'trialing'].includes(subscription.status);
  const hasTimeRemaining =
    !subscription.current_period_end ||
    new Date(subscription.current_period_end) > new Date();

  return {
    hasAppAccess: true,
    hasSubscription: isActiveStatus && hasTimeRemaining,
  };
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Global guard: Always redirect authenticated source=desktop requests to desktop app
  // This ensures users always land in desktop app when source=desktop is present,
  // regardless of which page they end up on (safety net for OAuth redirect issues)
  const isDesktopSourceRequest =
    request.nextUrl.searchParams.get('source') === 'desktop';
  if (
    isDesktopSourceRequest &&
    user &&
    request.nextUrl.pathname !== '/desktop-success'
  ) {
    console.log(
      '[Middleware] Global desktop guard - redirecting to desktop-success'
    );
    const desktopSuccessUrl = request.nextUrl.clone();
    desktopSuccessUrl.pathname = '/desktop-success';
    desktopSuccessUrl.searchParams.delete('source');
    return NextResponse.redirect(desktopSuccessUrl);
  }

  const { pathname } = request.nextUrl;

  // Check if request is from game domain (blindsli.de)
  const host = request.headers.get('host');
  const onGameDomain = isGameDomain(host);

  // Game domain routing: redirect Om routes to game equivalents
  if (onGameDomain) {
    const redirectUrl = request.nextUrl.clone();

    // Root path on game domain should go to /game
    if (pathname === '/') {
      redirectUrl.pathname = '/game';
      return NextResponse.redirect(redirectUrl);
    }

    // Redirect Om auth routes to game auth routes
    if (pathname === '/login') {
      redirectUrl.pathname = '/game/login';
      return NextResponse.redirect(redirectUrl);
    }
    if (pathname === '/signup') {
      redirectUrl.pathname = '/game/signup';
      return NextResponse.redirect(redirectUrl);
    }

    // Block Om-only routes on game domain (dashboard, settings, paywall, etc.)
    const omOnlyRoutes = [
      '/dashboard',
      '/settings',
      '/meetings',
      '/paywall',
      '/processing-payment',
      '/desktop-success',
    ];
    if (omOnlyRoutes.some((route) => pathname.startsWith(route))) {
      redirectUrl.pathname = '/game';
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Auth routes (login, signup) - both main and game-specific
  const isAuthRoute = pathname === '/login' || pathname === '/signup';
  const isGameAuthRoute =
    pathname === '/game/login' || pathname === '/game/signup';

  // Paywall route (accessible to authenticated users without subscription)
  const isPaywallRoute = pathname === '/paywall';

  // Payment processing route (waiting for webhook to create subscription)
  const isProcessingRoute =
    pathname === '/processing-payment' || pathname === '/desktop-success';

  // Game routes that require authentication (but not Om access or subscription)
  const isGameAuthRequiredRoute = pathname === '/game/history';

  // Public game routes (no auth required)
  const isPublicGameRoute =
    pathname.startsWith('/game') &&
    !isGameAuthRequiredRoute &&
    !isGameAuthRoute;

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/privacy', '/terms', '/login', '/signup'];
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/analysis/') || // Public analysis preview for anonymous uploads
    isPublicGameRoute || // Public game routes (BlindSlide)
    isGameAuthRoute; // Game auth pages are public

  // Om protected routes (require om app access + subscription)
  const isOmProtectedRoute =
    !isPublicRoute &&
    !isPaywallRoute &&
    !isProcessingRoute &&
    !isGameAuthRequiredRoute;

  // Redirect unauthenticated users trying to access protected routes
  // Processing routes require authentication but not subscription
  if ((isOmProtectedRoute || isProcessingRoute) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect unauthenticated users from paywall to signup
  if (isPaywallRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/signup';
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect unauthenticated users from game auth-required routes to game signup
  if (isGameAuthRequiredRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/game/signup';
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from game auth routes to game history
  if (isGameAuthRoute && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/game/history';
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from login/signup based on subscription status
  if (isAuthRoute && user) {
    // Allow desktop app authentication flow to proceed
    // Desktop app uses source=desktop param to trigger magic link generation
    const isDesktopRequest =
      request.nextUrl.searchParams.get('source') === 'desktop';

    if (isDesktopRequest) {
      // Let the login page handle desktop authentication
      return supabaseResponse;
    }

    // Check if user has Om access
    const { hasAppAccess, hasSubscription } = await checkUserHasOmAccess(
      supabase,
      user.id
    );

    const redirectUrl = request.nextUrl.clone();

    // If user doesn't have Om app access (game-only user), redirect to game
    if (!hasAppAccess) {
      redirectUrl.pathname = '/game';
      return NextResponse.redirect(redirectUrl);
    }

    // If user has Om access, redirect based on subscription
    redirectUrl.pathname = hasSubscription ? '/dashboard' : '/paywall';
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect users with active Om subscription away from paywall to dashboard
  // All authenticated users (including BlindSlide-only) can access paywall to sign up for Om
  if (isPaywallRoute && user) {
    const { hasSubscription } = await checkUserHasOmAccess(supabase, user.id);

    // If user already has an active Om subscription, redirect to dashboard
    if (hasSubscription) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Check subscription status for Om protected routes
  if (isOmProtectedRoute && user) {
    const { hasAppAccess, hasSubscription } = await checkUserHasOmAccess(
      supabase,
      user.id
    );

    const redirectUrl = request.nextUrl.clone();

    // If user doesn't have Om app access (game-only user), redirect to game
    if (!hasAppAccess) {
      redirectUrl.pathname = '/game';
      return NextResponse.redirect(redirectUrl);
    }

    // If user has Om access but no subscription, redirect to paywall
    if (!hasSubscription) {
      redirectUrl.pathname = '/paywall';
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets (images, txt files like ads.txt)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt)$).*)',
  ],
};
