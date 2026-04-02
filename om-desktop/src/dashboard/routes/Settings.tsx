import React, { useState, useEffect } from 'react';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { PageBackground } from '@/components/layout/PageBackground';

interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted';
  screenRecording: boolean;
}

interface UserInfo {
  email: string | null;
  isAuthenticated: boolean;
}

interface SessionSettings {
  rememberMe: boolean;
}

export default function Settings() {
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [sessionSettings, setSessionSettings] =
    useState<SessionSettings | null>(null);
  const [version, setVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingRememberMe, setSavingRememberMe] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'downloading' | 'up-to-date' | 'error'
  >('idle');

  // Support/Report Issue state
  const [issueDescription, setIssueDescription] = useState('');
  const [reportingIssue, setReportingIssue] = useState(false);
  const [issueReported, setIssueReported] = useState(false);

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(loading);

  useEffect(() => {
    loadSettings();

    // Note: Window focus handler removed - Dashboard.tsx now handles focus events
    // to prevent duplicate concurrent auth checks that cause token refresh race conditions
  }, []);

  // Listen for auto-updater events to show accurate status
  useEffect(() => {
    if (!window.electronAPI?.on) return;

    const cleanups = [
      window.electronAPI.on('auto-updater:update-checking', () => {
        setUpdateStatus('checking');
      }),
      window.electronAPI.on('auto-updater:update-available', () => {
        // Update is available and auto-downloading - UpdateNotification handles the UI
        setUpdateStatus('downloading');
      }),
      window.electronAPI.on('auto-updater:update-not-available', () => {
        setUpdateStatus('up-to-date');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }),
      window.electronAPI.on('auto-updater:update-download-progress', () => {
        setUpdateStatus('downloading');
      }),
      window.electronAPI.on('auto-updater:update-downloaded', () => {
        // Update downloaded - UpdateNotification handles showing "Restart Now"
        setUpdateStatus('idle');
      }),
      window.electronAPI.on('auto-updater:update-error', () => {
        setUpdateStatus('error');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load permission status
      const permissionStatus = await window.electronAPI.permissions.getStatus();
      setPermissions(permissionStatus);

      // Load user info
      const user = await window.electronAPI.auth.getUser();
      setUserInfo({
        email: user?.email || null,
        isAuthenticated: !!user,
      });

      // Load app version
      const appVersion = await window.electronAPI.app.getVersion();
      setVersion(appVersion);

      // Load session settings
      const rememberMe = await window.electronAPI.settings.getRememberMe();
      setSessionSettings({ rememberMe });
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRememberMeChange = async (value: boolean) => {
    setSavingRememberMe(true);
    try {
      const result = await window.electronAPI.settings.setRememberMe(value);
      if (result.success) {
        setSessionSettings({ rememberMe: value });
      } else {
        console.error('Failed to save rememberMe setting:', result.error);
      }
    } catch (error) {
      console.error('Failed to save rememberMe setting:', error);
    } finally {
      setSavingRememberMe(false);
    }
  };

  const requestPermission = async (type: 'microphone' | 'screenRecording') => {
    try {
      let result;
      switch (type) {
        case 'microphone':
          result = await window.electronAPI.permissions.requestMicrophone();
          if (result.success && result.granted) {
            // Permission granted immediately, reload status
            await loadSettings();
          }
          break;
        case 'screenRecording':
          result =
            await window.electronAPI.permissions.requestScreenRecording();
          break;
      }
    } catch (error) {
      console.error(`Failed to request ${type} permission:`, error);
    }
  };

  const handleSignIn = () => {
    window.electronAPI.auth.signIn();
  };

  const handleSignOut = async () => {
    try {
      await window.electronAPI.auth.signOut();
      // Immediately reload the window to reflect sign-out state
      window.location.reload();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      setUpdateStatus('checking');
      await window.electronAPI.updater.checkForUpdates();
      // Status will be updated by IPC event listeners
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    }
  };

  const handleReportIssue = async () => {
    if (!issueDescription.trim()) return;

    setReportingIssue(true);
    try {
      const result = await window.electronAPI.support.reportIssue(
        issueDescription.trim()
      );
      if (result.success) {
        setIssueReported(true);
        setIssueDescription('');
        // Reset the success state after 5 seconds
        setTimeout(() => setIssueReported(false), 5000);
      } else {
        console.error('Failed to report issue:', result.error);
      }
    } catch (error) {
      console.error('Failed to report issue:', error);
    } finally {
      setReportingIssue(false);
    }
  };

  if (loading && showSkeleton) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="text-center py-12 text-white/70">
          Loading settings...
        </div>
      </PageBackground>
    );
  }

  // Show skeleton while loading (before skeleton delay)
  if (loading) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
            Settings
          </h1>
        </div>

        {/* Skeleton cards */}
        <div className="space-y-6 animate-pulse">
          {/* Account skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-32 mb-4" />
            <div className="h-4 bg-slate-100 rounded w-48 mb-4" />
            <div className="h-10 bg-slate-100 rounded w-full" />
          </div>

          {/* Permissions skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-40 mb-2" />
            <div className="h-4 bg-slate-100 rounded w-3/4 mb-6" />
            <div className="space-y-4">
              <div className="flex justify-between items-center py-4 border-b border-dashed border-slate-200">
                <div className="h-5 bg-slate-100 rounded w-32" />
                <div className="h-8 bg-slate-100 rounded w-24" />
              </div>
              <div className="flex justify-between items-center pt-4">
                <div className="h-5 bg-slate-100 rounded w-48" />
                <div className="h-8 bg-slate-100 rounded w-24" />
              </div>
            </div>
          </div>

          {/* Support skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-28 mb-4" />
            <div className="h-24 bg-slate-100 rounded w-full mb-3" />
            <div className="h-10 bg-slate-100 rounded w-full" />
          </div>

          {/* About skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-24 mb-4" />
            <div className="flex justify-between items-center mb-4">
              <div className="h-4 bg-slate-100 rounded w-16" />
              <div className="h-4 bg-slate-100 rounded w-12" />
            </div>
            <div className="h-10 bg-slate-100 rounded w-full" />
          </div>
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground maxWidth="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
          Settings
        </h1>
      </div>

      {/* ============================================
            ACCOUNT SECTION
            ============================================ */}
      <div
        className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg mb-6 animate-fadeInUp"
        style={{ animationDelay: '100ms' }}
      >
        <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-4">
          Account
        </h3>

        {/* Sign in/out section */}
        {userInfo?.isAuthenticated ? (
          <div className="pb-4 border-b border-dashed border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium text-slate-500">
                Signed in as:
              </span>
              <span className="text-sm font-medium text-slate-900">
                {userInfo.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="pb-4 border-b border-dashed border-slate-200">
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Sign in to sync your recordings and access your dashboard.
            </p>
            <button
              onClick={handleSignIn}
              className="w-full px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              Sign In
            </button>
          </div>
        )}

        {/* Remember Me Toggle */}
        <div className="pt-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-base font-semibold text-slate-900">
                Remember me
              </span>
              <span className="text-sm text-slate-600 leading-relaxed">
                Stay signed in after quitting the app. When disabled, you'll
                need to sign in again after restarting.
              </span>
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <button
                onClick={() =>
                  handleRememberMeChange(!sessionSettings?.rememberMe)
                }
                disabled={savingRememberMe}
                className={`relative w-[51px] h-[31px] rounded-full border-none cursor-pointer transition-colors duration-300 p-0.5 ${
                  sessionSettings?.rememberMe ? 'bg-green-500' : 'bg-slate-200'
                } ${savingRememberMe ? 'opacity-50' : ''}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-[27px] h-[27px] rounded-full bg-white shadow-md transition-transform duration-300 ${
                    sessionSettings?.rememberMe
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          {sessionSettings?.rememberMe && (
            <p className="mt-3 text-sm text-orange-600 leading-relaxed p-4 bg-orange-50 rounded-lg">
              Note: Enabling will store your session securely on disk. You may
              see a 1-time macOS keychain permission prompt.
            </p>
          )}
        </div>
      </div>

      {/* ============================================
            PERMISSIONS SECTION
            ============================================ */}
      <div
        className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg mb-6 animate-fadeInUp"
        style={{ animationDelay: '200ms' }}
      >
        <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-2">
          Permissions
        </h3>
        <p className="text-base text-slate-500 mb-6 leading-relaxed">
          Om needs the following permissions to record and analyze your
          meetings:
        </p>

        {/* Microphone Permission */}
        <div className="py-4 border-b border-dashed border-slate-200">
          <div className="flex justify-between items-center gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎤</span>
                <span className="text-base font-semibold text-slate-900">
                  Microphone
                </span>
              </div>
              <span className="text-sm text-slate-600 ml-7">
                Required to record audio from meetings
              </span>
            </div>
            <div className="flex-shrink-0">
              {permissions?.microphone === 'granted' ? (
                <span className="text-sm font-semibold text-green-600">
                  ✓ Granted
                </span>
              ) : (
                <button
                  onClick={() => requestPermission('microphone')}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors"
                >
                  Grant Access
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Screen Recording Permission (for System Audio) */}
        <div className="pt-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔊</span>
                <span className="text-base font-semibold text-slate-900">
                  Screen Recording (System Audio)
                </span>
              </div>
              <span className="text-sm text-slate-600 ml-7">
                Required to capture system audio from meetings (e.g., other
                participants' voices)
              </span>
            </div>
            <div className="flex-shrink-0">
              {permissions?.screenRecording ? (
                <span className="text-sm font-semibold text-green-600">
                  ✓ Granted
                </span>
              ) : (
                <button
                  onClick={() => requestPermission('screenRecording')}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors"
                >
                  Grant Access
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================
            SUPPORT SECTION
            ============================================ */}
      <div
        className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg mb-6 animate-fadeInUp"
        style={{ animationDelay: '300ms' }}
      >
        <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-4">
          Support
        </h3>
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-base font-semibold text-slate-900">
              Report an Issue
            </span>
            <p className="text-sm text-slate-600 mt-1">
              Describe the problem and we'll receive diagnostic information to
              help fix it.
            </p>
          </div>
          <textarea
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            placeholder="Describe what happened..."
            className="w-full h-24 p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={reportingIssue}
          />
          <button
            onClick={handleReportIssue}
            disabled={!issueDescription.trim() || reportingIssue}
            className="w-full px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reportingIssue
              ? 'Sending...'
              : issueReported
                ? 'Report Sent!'
                : 'Send Report'}
          </button>
          {issueReported && (
            <p className="text-sm text-center text-green-600">
              Thank you! Your report has been sent.
            </p>
          )}
        </div>
      </div>

      {/* ============================================
            ABOUT SECTION
            ============================================ */}
      <div
        className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg mb-6 animate-fadeInUp"
        style={{ animationDelay: '400ms' }}
      >
        <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-4">
          About
        </h3>
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-medium text-slate-500">Version:</span>
          <span className="text-sm font-medium text-slate-900">{version}</span>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleCheckForUpdates}
            disabled={
              updateStatus === 'checking' || updateStatus === 'downloading'
            }
            className="w-full px-5 py-2.5 bg-teal-600/80 hover:bg-teal-600 active:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
          </button>
          {updateStatus === 'up-to-date' && (
            <p className="text-sm text-center text-green-600">
              You are up to date!
            </p>
          )}
          {updateStatus === 'downloading' && (
            <p className="text-sm text-center text-blue-600">
              Downloading update...
            </p>
          )}
          {updateStatus === 'error' && (
            <p className="text-sm text-center text-red-600">
              Failed to check for updates
            </p>
          )}
        </div>
      </div>
    </PageBackground>
  );
}
