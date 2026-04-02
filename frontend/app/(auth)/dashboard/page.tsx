'use client';

import AnalysisPanel from '@/components/AnalysisPanel';
import { WeeklyDashboard } from '@/components/dashboard/WeeklyDashboard';
import SubscriptionBanner from '@/components/subscription/SubscriptionBanner';
import { ClaimHandler } from '@/components/ClaimHandler';
import { PageBackground } from '@/components/layout/PageBackground';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useSignupSourceTracking } from '@/hooks/useSignupSourceTracking';
import { trackEvent, EngagementEvents } from '@/lib/analytics';
import { redirectToDesktop } from '@/hooks/useDesktopAuth';

interface DashboardStats {
  totalMeetings: number;
  hoursAnalyzed: string; // Formatted as "H:MM"
  thisMonth: number;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<DashboardStats>({
    totalMeetings: 0,
    hoursAnalyzed: '0:00',
    thisMonth: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState<string>('');

  // Track signup source for new users (OAuth and email)
  useSignupSourceTracking();

  // Track WeeklyDashboard loading state
  const handleDashboardLoadingChange = (loading: boolean) => {
    setDashboardLoading(loading);
  };

  // Track week changes for stats animation
  const handleWeekChange = (weekStart: string, weekEnd: string) => {
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
        router.replace('/desktop-success');
        return;
      }
    };

    handleDesktopRedirect();
  }, [searchParams, router]);

  // Track dashboard view when stats are loaded
  useEffect(() => {
    if (stats.totalMeetings >= 0) {
      // Only track after stats have been fetched (including 0)
      trackEvent(EngagementEvents.DASHBOARD_VIEWED, {
        meeting_count: stats.totalMeetings,
      });
    }
  }, [stats.totalMeetings]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch meetings where user owns the meeting AND has identified themselves as a speaker
      const { data: meetings, error: meetingsQueryError } = await supabase
        .from('meetings')
        .select('id, recording_duration_seconds, created_at')
        .eq('user_id', user.id)
        .not('user_speaker_label', 'is', null);

      if (meetingsQueryError) {
        console.error('Error fetching meetings:', meetingsQueryError);
        return;
      }

      if (!meetings || meetings.length === 0) {
        setStats({
          totalMeetings: 0,
          hoursAnalyzed: '0:00',
          thisMonth: 0,
        });
        setStatsLoading(false);
        return;
      }

      // Total meetings is the count of meetings returned
      const totalMeetings = meetings.length;

      // Calculate total hours analyzed (sum of all meeting durations)
      let totalSeconds = 0;
      if (meetings) {
        meetings.forEach((meeting: any) => {
          totalSeconds += meeting.recording_duration_seconds || 0;
        });
      }

      // Format as H:MM for better readability (e.g., "0:15" instead of "0.2")
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.round((totalSeconds % 3600) / 60);
      const hoursAnalyzed = `${hours}:${minutes.toString().padStart(2, '0')}`;

      // Calculate meetings this month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonth = meetings.filter((meeting: any) => {
        if (!meeting.created_at) return false;
        const createdAt = new Date(meeting.created_at);
        return createdAt >= firstDayOfMonth;
      }).length;

      setStats({
        totalMeetings,
        hoursAnalyzed,
        thisMonth,
      });
      setStatsLoading(false);
    } catch (err) {
      console.error('Error calculating stats:', err);
      setStatsLoading(false);
    }
  }, []);

  // Refetch stats when meeting count changes (e.g., after deletion)
  const handleMeetingCountChange = useCallback(
    (count: number) => {
      fetchStats();
    },
    [fetchStats]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]); // Fetch stats on mount

  return (
    <>
      <ClaimHandler />
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
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 xl:py-8">
          <div className="text-gray-600">Loading dashboard...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
