import { WeeklyDashboard } from '@/components/dashboard/WeeklyDashboard';
import SubscriptionBanner from '@/components/subscription/SubscriptionBanner';
import { SignInPrompt } from '@/components/SignInPrompt';
import { PaywallPrompt } from '@/components/PaywallPrompt';
import { PageBackground } from '@/components/layout/PageBackground';
import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, dashboardApi } from '@/lib/api-client';
import { useSignupSourceTracking } from '@/hooks/useSignupSourceTracking';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { trackEvent, EngagementEvents } from '@/lib/analytics';
import * as Sentry from '@sentry/electron/renderer';

interface DashboardStats {
  totalMeetings: number;
  hoursAnalyzed: string; // Formatted as "H:MM"
  thisMonth: number;
}

function DashboardContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<
    boolean | null
  >(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalMeetings: 0,
    hoursAnalyzed: '0:00',
    thisMonth: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState<string>('');

  // Delayed skeleton: only show if loading takes > 400ms
  const isLoading = isAuthenticated === null || hasActiveSubscription === null;
  const showSkeleton = useDelayedSkeleton(isLoading);

  // Track signup source for new users (OAuth and email)
  useSignupSourceTracking();

  // Track WeeklyDashboard loading state
  const handleDashboardLoadingChange = (loading: boolean) => {
    setDashboardLoading(loading);
  };

  // Track week changes for stats animation
  const handleWeekChange = (weekStart: string, _weekEnd: string) => {
    setCurrentWeek(weekStart);
  };

  // Handle desktop app redirect after successful payment
  useEffect(() => {
    const handleDesktopRedirect = async () => {
      const source = searchParams.get('source');
      const sessionId = searchParams.get('session_id');

      // Redirect after payment - show success page
      if (source === 'desktop' && sessionId) {
        console.log(
          '[Desktop] Payment successful, redirecting to success page'
        );
        navigate('/desktop-success', { replace: true });
        return;
      }
    };

    handleDesktopRedirect();
  }, [searchParams, navigate]);

  // Track dashboard view when stats are loaded
  useEffect(() => {
    if (stats.totalMeetings >= 0) {
      // Only track after stats have been fetched (including 0)
      trackEvent(EngagementEvents.DASHBOARD_VIEWED, {
        meeting_count: stats.totalMeetings,
      });
    }
  }, [stats.totalMeetings]);

  const checkSubscription = async () => {
    try {
      // Use IPC to check subscription status through main process
      // This ensures we always use fresh tokens from the main process,
      // avoiding race conditions with stale frontend tokens after sleep/wake
      if (window.electronAPI?.checkSubscription) {
        const hasSubscription = await window.electronAPI.checkSubscription();
        setHasActiveSubscription(hasSubscription);
        return;
      }

      // No fallback - IPC must be available in desktop app
      console.error('[Dashboard] checkSubscription IPC not available');
      setHasActiveSubscription(false);
    } catch (err) {
      console.error('[Dashboard] Exception checking subscription:', err);
      // On error, default to false to show paywall
      setHasActiveSubscription(false);
    }
  };

  const fetchStats = useCallback(async () => {
    const startTime = Date.now();
    setStatsLoading(true);

    try {
      // Get current user from main process
      const user = await authApi.getCurrentUser();

      if (!user) {
        // Track cases where user is not available during stats fetch
        // This could indicate a race condition
        Sentry.captureMessage(
          'User not available during dashboard stats fetch',
          {
            level: 'warning',
            tags: {
              component: 'dashboard',
              error_type: 'auth_race_condition',
            },
            extra: {
              timing: Date.now() - startTime,
              context: 'fetchStats',
            },
          }
        );
        setStatsLoading(false);
        return;
      }

      // Use IPC to fetch stats from main process
      const result = await dashboardApi.getDashboardStats(user.id);

      if (!result.success || !result.data) {
        console.error('[Dashboard] Error fetching stats:', result.error);
        setStatsLoading(false);
        return;
      }

      setStats(result.data);
      setStatsLoading(false);
    } catch (err) {
      console.error('Error calculating stats:', err);
      setStatsLoading(false);
    }
  }, []);

  // Refetch stats when meeting count changes (e.g., after deletion)
  const handleMeetingCountChange = useCallback(
    (_count: number) => {
      fetchStats();
    },
    [fetchStats]
  );

  // Use ref to track if auth check is in progress (persists across renders)
  const checkAuthInProgress = useRef(false);

  // Check authentication status
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      if (!isMounted) return;

      // Prevent concurrent execution - critical for avoiding race conditions
      if (checkAuthInProgress.current) {
        return;
      }

      checkAuthInProgress.current = true;

      try {
        const authCheckStart = Date.now();

        // Add breadcrumb for auth check
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'Dashboard auth check started',
          level: 'info',
          data: { timestamp: authCheckStart },
        });

        // Use IPC to get current user from main process (same as menu bar)
        // Note: ensureSessionRestored() removed - main process IPC handler now
        // guarantees fresh tokens, preventing frontend auto-refresh race conditions
        if (window.electronAPI?.auth?.getUser) {
          const user = await window.electronAPI.auth.getUser();

          const wasAuthenticated = isAuthenticated;
          const nowAuthenticated = !!user;
          setIsAuthenticated(nowAuthenticated);

          // Track authentication state transitions
          if (
            wasAuthenticated !== null &&
            wasAuthenticated !== nowAuthenticated
          ) {
            Sentry.addBreadcrumb({
              category: 'auth',
              message: `Dashboard auth state changed: ${wasAuthenticated} -> ${nowAuthenticated}`,
              level: 'info',
              data: {
                from: wasAuthenticated,
                to: nowAuthenticated,
                timing: Date.now() - authCheckStart,
              },
            });
          }

          if (user) {
            // Check subscription status
            await checkSubscription();
            fetchStats();
          } else {
            // No user, so no subscription
            setHasActiveSubscription(false);
          }
        } else {
          console.error('[Dashboard] electronAPI.auth.getUser not available');

          // Track missing IPC API
          Sentry.captureMessage(
            'electronAPI.auth.getUser not available in Dashboard',
            {
              level: 'error',
              tags: { component: 'dashboard' },
              extra: { timing: Date.now() - authCheckStart },
            }
          );

          setIsAuthenticated(false);
        }
      } finally {
        checkAuthInProgress.current = false;
      }
    };

    // Check auth on mount
    checkAuth();

    // Re-check auth when window gains focus
    // This is useful when user returns from browser after subscribing
    const handleFocus = () => {
      checkAuth();
    };
    window.addEventListener('focus', handleFocus);

    // Cleanup listener on unmount
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Check auth on mount and when window focuses

  // Show loading state while checking auth
  if (isLoading && showSkeleton) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 2xl:py-8">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show background while loading (before skeleton delay)
  if (isLoading) {
    return (
      <PageBackground variant="teal">
        <div />
      </PageBackground>
    );
  }

  // Show sign-in screen if not authenticated
  if (!isAuthenticated) {
    return <SignInPrompt />;
  }

  // Show paywall if authenticated but no active subscription
  if (!hasActiveSubscription) {
    return <PaywallPrompt />;
  }

  return (
    <PageBackground variant="teal">
      <div className="animate-fadeInUp">
        {/* Subscription Banner */}
        <SubscriptionBanner />

        {/* Weekly Performance Dashboard */}
        <div className="mb-8">
          <WeeklyDashboard
            onLoadingChange={handleDashboardLoadingChange}
            onWeekChange={handleWeekChange}
            onMeetingCountChange={handleMeetingCountChange}
          />
        </div>

        {/* Stats Grid - Below Progress Section - Wait for both stats and dashboard */}
        {!statsLoading && !dashboardLoading && (
          <div
            key={`stats-${currentWeek}`}
            id="dashboard-stats-grid"
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-fadeInUp"
          >
            <div className="bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Total Meetings</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.totalMeetings}
              </p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Hours Analyzed</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.hoursAnalyzed}
              </p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-sm">
              <p className="text-sm text-gray-600 mb-1">This Month</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.thisMonth}
              </p>
            </div>
          </div>
        )}
      </div>
    </PageBackground>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <DashboardContent />
    </Suspense>
  );
}
