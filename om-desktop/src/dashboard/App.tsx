import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import Dashboard from './routes/Dashboard';
import Meetings from './routes/Meetings';
import MeetingAnalysis from './routes/MeetingAnalysis';
import MeetingTranscript from './routes/MeetingTranscript';
import Settings from './routes/Settings';
import Subscription from './routes/Subscription';
import AppSidebar from './components/AppSidebar';
import TitleBar from './components/TitleBar';
import { AuthLayoutClient } from './components/AuthLayoutClient';
import { ScreenPickerPage } from '../components/ScreenPickerPage';
import { UpdateNotification } from '../components/UpdateNotification';
import { SpeakerIdentificationModal } from './components/analysis/SpeakerIdentificationModal';
import { useUnassignedMeetings } from './hooks/useUnassignedMeetings';
import * as Sentry from '@sentry/electron/renderer';

// Component that listens for navigation events from main process
function NavigationListener(): React.ReactElement | null {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for navigation events from main process (e.g., menu bar Settings click)
    if (window.electronAPI?.on) {
      const cleanup = window.electronAPI.on(
        'navigate',
        async (route: unknown) => {
          if (typeof route === 'string') {
            // Add breadcrumb for navigation event
            Sentry.addBreadcrumb({
              category: 'navigation',
              message: `Navigation requested to ${route}`,
              level: 'info',
              data: { route, timestamp: Date.now() },
            });

            // If navigating to dashboard, ensure session is fully restored first
            // This prevents race conditions where Dashboard loads before session is ready
            if (route === '/dashboard') {
              const navStart = Date.now();

              try {
                const { refreshSession } = await import('./lib/supabase');
                await refreshSession();

                const duration = Date.now() - navStart;

                // Add breadcrumb for successful pre-navigation session restore
                Sentry.addBreadcrumb({
                  category: 'navigation',
                  message: 'Session restored before dashboard navigation',
                  level: 'info',
                  data: { duration, route: '/dashboard' },
                });

                // Track slow pre-navigation session restores
                if (duration > 2000) {
                  Sentry.captureMessage(
                    'Slow session restore before dashboard navigation',
                    {
                      level: 'warning',
                      tags: { component: 'navigation_listener' },
                      extra: { duration, route },
                    }
                  );
                }
              } catch (error) {
                console.error('[Dashboard] Error refreshing session:', error);

                // Capture session refresh errors during navigation
                Sentry.captureException(error, {
                  level: 'error',
                  tags: {
                    component: 'navigation_listener',
                    error_type: 'pre_navigation_refresh_failed',
                  },
                  extra: {
                    route,
                    timing: Date.now() - navStart,
                  },
                });
              }
            }

            navigate(route);

            // Add breadcrumb for completed navigation
            Sentry.addBreadcrumb({
              category: 'navigation',
              message: `Navigation completed to ${route}`,
              level: 'info',
              data: { route },
            });
          }
        }
      );

      // Clean up event listener when component unmounts
      return cleanup;
    }
  }, [navigate]);

  return null;
}

function App() {
  return (
    <div className="min-h-screen bg-teal-950 text-foreground antialiased noise-overlay">
      <NavigationListener />
      <UpdateNotification />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* Screen picker - full page without sidebar */}
        <Route path="/screen-picker" element={<ScreenPickerRoute />} />
        {/* Main app routes with sidebar */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route
            path="/meetings/:meetingId/analysis"
            element={<MeetingAnalysis />}
          />
          <Route
            path="/meetings/:meetingId/transcript"
            element={<MeetingTranscript />}
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/subscription" element={<Subscription />} />
        </Route>
      </Routes>
    </div>
  );
}

// Layout component that wraps authenticated pages with sidebar
function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<
    boolean | null
  >(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Read environment synchronously from preload
  const isLocalEnvironment = window.electronAPI?.environment === 'local';

  // Modal state for speaker identification (opened from sidebar)
  const [speakerModalMeetingId, setSpeakerModalMeetingId] = useState<
    string | null
  >(null);

  // Get unassigned meetings count for sidebar badge
  // Pass userId so it refetches when user logs in
  const { count: unassignedCount, firstMeetingId: firstUnassignedMeetingId } =
    useUnassignedMeetings({ userId: user?.id });

  // Handle opening the speaker identification modal
  const handleOpenSpeakerModal = useCallback((meetingId: string) => {
    setSpeakerModalMeetingId(meetingId);
  }, []);

  // Handle closing the speaker identification modal
  const handleCloseSpeakerModal = useCallback(() => {
    setSpeakerModalMeetingId(null);
  }, []);

  // Handle assignment complete - close modal and navigate
  const handleAssignmentComplete = useCallback(
    (meetingId: string) => {
      setSpeakerModalMeetingId(null);
      // Dispatch event to refresh unassigned counter
      window.dispatchEvent(new CustomEvent('speaker-assigned'));
      // Navigate to analysis page after assignment
      navigate(`/meetings/${meetingId}/analysis`);
    },
    [navigate]
  );

  useEffect(() => {
    const fetchUser = async () => {
      if (window.electronAPI?.auth?.getUser) {
        const currentUser = await window.electronAPI.auth.getUser();

        if (currentUser) {
          setUser({
            id: currentUser.id,
            name:
              currentUser.user_metadata?.full_name ||
              currentUser.email ||
              'User',
            email: currentUser.email || '',
          });

          // Check subscription status via IPC (main process has fresh tokens)
          const hasSubscription = await window.electronAPI.checkSubscription();
          setHasActiveSubscription(hasSubscription);
        } else {
          // User signed out - clear user state
          setUser(null);
          setHasActiveSubscription(null);
        }
      }
    };

    // Check auth on mount
    fetchUser();

    // Re-check on focus for sidebar updates (e.g., after OAuth in browser)
    const handleFocus = () => {
      fetchUser();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Don't show sidebar until we have user info and subscription status
  // OR if user doesn't have active subscription (for paywall view)
  if (!user || hasActiveSubscription === null || !hasActiveSubscription) {
    return <Outlet />;
  }

  return (
    <AuthLayoutClient>
      <div className="h-screen overflow-hidden">
        {/* Title Bar with traffic lights area and collapse toggle */}
        <TitleBar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isLocalEnvironment={isLocalEnvironment}
        />

        {/* Sidebar */}
        <AppSidebar
          userName={user.name}
          userEmail={user.email}
          isCollapsed={isSidebarCollapsed}
          unassignedCount={unassignedCount}
          firstUnassignedMeetingId={firstUnassignedMeetingId}
          onIdentifySpeaker={handleOpenSpeakerModal}
        />

        {/* Main Content Area */}
        <main
          className={`pt-[48px] pr-2 pb-2 transition-all duration-300 ${
            isSidebarCollapsed ? 'ml-20' : 'ml-64'
          }`}
        >
          <div className="h-[calc(100vh-56px)] rounded-xl overflow-y-auto">
            <Outlet />
          </div>
        </main>

        {/* Speaker Identification Modal (opened from sidebar) */}
        <SpeakerIdentificationModal
          meetingId={speakerModalMeetingId}
          currentUserId={user.id}
          onClose={handleCloseSpeakerModal}
          onAssignmentComplete={handleAssignmentComplete}
        />
      </div>
    </AuthLayoutClient>
  );
}

// Wrapper component for screen picker that handles source selection
function ScreenPickerRoute() {
  const handleSourceSelected = async (
    sourceId: string,
    source: { id: string; name: string; displayId?: string }
  ) => {
    // Call IPC to start manual recording
    if (window.electronAPI?.startManualRecording) {
      try {
        await window.electronAPI.startManualRecording(
          source.id,
          source.name,
          source.displayId
        );
      } catch (error) {
        console.error('[ScreenPickerRoute] Error starting recording:', error);
      }
    }
  };

  return <ScreenPickerPage onSourceSelected={handleSourceSelected} />;
}

export default App;
