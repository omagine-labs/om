// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Initialize Sentry preload for IPC communication
// This MUST be imported before any other Sentry code runs
// It sets up the IPC bridge between main and renderer processes
import '@sentry/electron/preload';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Event listener support for control bar, navigation, and auto-updates
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'update-state',
      'tab-switched',
      'navigate', // For dashboard navigation from menu bar
      'auto-updater:update-checking',
      'auto-updater:update-available',
      'auto-updater:update-not-available',
      'auto-updater:update-error',
      'auto-updater:update-download-progress',
      'auto-updater:update-downloaded',
      'auth:state-changed', // Auth state change notifications
    ];
    if (validChannels.includes(channel)) {
      const listener = (_event: unknown, ...args: unknown[]) =>
        callback(...args);
      ipcRenderer.on(channel, listener);

      // Return cleanup function to remove listener
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    }
    // Return no-op cleanup for invalid channels
    return () => {};
  },

  // Invoke support (generic for any IPC call)
  invoke: (channel: string, ...args: unknown[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  // API Methods (type-safe wrappers for IPC calls)
  api: {
    // Dashboard API
    calculateWeeklyRollup: (userId: string, weekStart: string) =>
      ipcRenderer.invoke('api:calculateWeeklyRollup', userId, weekStart),
    getWeeklyData: (userId: string, weekStart?: string) =>
      ipcRenderer.invoke('api:getWeeklyData', userId, weekStart),
    getWeeklyMetrics: (userId: string) =>
      ipcRenderer.invoke('api:getWeeklyMetrics', userId),
    getMeetingAnalysisForWeek: (
      userId: string,
      weekStart: string,
      weekEndPlusOne: string
    ) =>
      ipcRenderer.invoke(
        'api:getMeetingAnalysisForWeek',
        userId,
        weekStart,
        weekEndPlusOne
      ),
    getBaseline: (userId: string, baselineType: 'current' | 'initial') =>
      ipcRenderer.invoke('api:getBaseline', userId, baselineType),
    getMeetingCountForUser: (userId: string) =>
      ipcRenderer.invoke('api:getMeetingCountForUser', userId),
    getEarliestMeetingDate: (userId: string) =>
      ipcRenderer.invoke('api:getEarliestMeetingDate', userId),
    getAssignedMeetingsForWeek: (
      userId: string,
      weekStart: string,
      weekEnd: string
    ) =>
      ipcRenderer.invoke(
        'api:getAssignedMeetingsForWeek',
        userId,
        weekStart,
        weekEnd
      ),
    getUnassignedMeetingsForWeek: (
      userId: string,
      weekStart: string,
      weekEnd: string
    ) =>
      ipcRenderer.invoke(
        'api:getUnassignedMeetingsForWeek',
        userId,
        weekStart,
        weekEnd
      ),
    getMeetingLevelMetrics: (
      userId: string,
      column: string,
      startDate: string,
      endDate: string
    ) =>
      ipcRenderer.invoke(
        'api:getMeetingLevelMetrics',
        userId,
        column,
        startDate,
        endDate
      ),
    getDashboardStats: (userId: string) =>
      ipcRenderer.invoke('api:getDashboardStats', userId),

    // Meetings API
    getMeetings: (userId: string, options?: any) =>
      ipcRenderer.invoke('api:getMeetings', userId, options),
    getMeeting: (meetingId: string) =>
      ipcRenderer.invoke('api:getMeeting', meetingId),
    getTranscript: (meetingId: string) =>
      ipcRenderer.invoke('api:getTranscript', meetingId),
    deleteMeeting: (meetingId: string) =>
      ipcRenderer.invoke('api:deleteMeeting', meetingId),
    updateMeetingTitle: (meetingId: string, title: string) =>
      ipcRenderer.invoke('api:updateMeetingTitle', meetingId, title),
    getMeetingsWithAnalysis: (userId: string) =>
      ipcRenderer.invoke('api:getMeetingsWithAnalysis', userId),
    createMeeting: (meetingData: {
      user_id: string;
      title: string;
      start_time: string;
      end_time?: string;
      source?: string;
    }) => ipcRenderer.invoke('api:createMeeting', meetingData),
    updateMeeting: (
      meetingId: string,
      updates: { title?: string; start_time?: string; end_time?: string | null }
    ) => ipcRenderer.invoke('api:updateMeeting', meetingId, updates),
    meetingExists: (meetingId: string) =>
      ipcRenderer.invoke('api:meetingExists', meetingId),
    getMeetingAnalysisPageData: (meetingId: string) =>
      ipcRenderer.invoke('api:getMeetingAnalysisPageData', meetingId),
    getMeetingForReprocess: (meetingId: string, userId: string) =>
      ipcRenderer.invoke('api:getMeetingForReprocess', meetingId, userId),

    // User API
    getProfile: (userId: string) =>
      ipcRenderer.invoke('api:getProfile', userId),
    updateProfile: (userId: string, updates: Record<string, any>) =>
      ipcRenderer.invoke('api:updateProfile', userId, updates),
    getSubscription: (userId: string) =>
      ipcRenderer.invoke('api:getSubscription', userId),
    getUserFullName: (userId: string) =>
      ipcRenderer.invoke('api:getUserFullName', userId),

    // Analysis API
    getMeetingAnalysisByJobId: (jobId: string) =>
      ipcRenderer.invoke('api:getMeetingAnalysisByJobId', jobId),
    getMeetingAnalysisByMeetingId: (meetingId: string) =>
      ipcRenderer.invoke('api:getMeetingAnalysisByMeetingId', meetingId),
    assignSpeaker: (jobId: string, speakerLabel: string, userId: string) =>
      ipcRenderer.invoke('api:assignSpeaker', jobId, speakerLabel, userId),
    assignCustomName: (jobId: string, speakerLabel: string, name: string) =>
      ipcRenderer.invoke('api:assignCustomName', jobId, speakerLabel, name),
    unassignSpeaker: (jobId: string, speakerLabel: string) =>
      ipcRenderer.invoke('api:unassignSpeaker', jobId, speakerLabel),
    autoAssignSpeaker: (analysisId: string, userId: string) =>
      ipcRenderer.invoke('api:autoAssignSpeaker', analysisId, userId),
    getWeeklyAnalysisRecords: (userId: string, sinceDate: string) =>
      ipcRenderer.invoke('api:getWeeklyAnalysisRecords', userId, sinceDate),
    claimAnonymousMeetings: (
      userId: string,
      email: string,
      selectedSpeaker?: string
    ) =>
      ipcRenderer.invoke(
        'api:claimAnonymousMeetings',
        userId,
        email,
        selectedSpeaker
      ),

    // Processing Jobs API
    getJobById: (jobId: string) => ipcRenderer.invoke('api:getJobById', jobId),
    getJobByMeetingId: (meetingId: string) =>
      ipcRenderer.invoke('api:getJobByMeetingId', meetingId),
    getJobsByMeetingIds: (meetingIds: string[]) =>
      ipcRenderer.invoke('api:getJobsByMeetingIds', meetingIds),
    pollJobStatus: (meetingIds: string[]) =>
      ipcRenderer.invoke('api:pollJobStatus', meetingIds),
    updateJobStatus: (jobId: string, status: string, errorMessage?: string) =>
      ipcRenderer.invoke('api:updateJobStatus', jobId, status, errorMessage),
    deleteJobsByIds: (jobIds: string[]) =>
      ipcRenderer.invoke('api:deleteJobsByIds', jobIds),

    // Storage API
    deleteRecording: (storagePath: string) =>
      ipcRenderer.invoke('api:deleteRecording', storagePath),
  },

  // Get configuration values
  getWebAppUrl: () => ipcRenderer.invoke('get-web-app-url'),
  environment: process.env.OM_ENVIRONMENT as 'local' | 'production',

  // Get available video sources for screen recording
  getSources: () => ipcRenderer.invoke('get-sources'),

  // Get list of all recordings
  getRecordings: () => ipcRenderer.invoke('get-recordings'),

  // Open recordings folder in Finder/Explorer
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),

  // Open a specific recording file
  openRecording: (filePath: string) =>
    ipcRenderer.invoke('open-recording', filePath),

  // Open external URL in default browser
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Check subscription status
  checkSubscription: () => ipcRenderer.invoke('check-subscription'),

  // Native recording with ScreenCaptureKit
  startNativeRecording: (options: {
    displayId?: number;
    windowId?: number;
    outputPath: string;
  }) => ipcRenderer.invoke('start-native-recording', options),

  stopNativeRecording: () => ipcRenderer.invoke('stop-native-recording'),

  // Manual recording APIs
  startManualRecording: (
    sourceId: string,
    sourceName: string,
    displayId?: string
  ) =>
    ipcRenderer.invoke(
      'start-manual-recording',
      sourceId,
      sourceName,
      displayId
    ),

  closeScreenPicker: () => ipcRenderer.invoke('close-screen-picker'),

  // Authentication APIs
  auth: {
    // Core methods (new clean API)
    getUser: () => ipcRenderer.invoke('auth:get-current-user'),
    getSession: () => ipcRenderer.invoke('auth:get-session'),
    getState: () => ipcRenderer.invoke('auth:getState'),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    openSignIn: () => ipcRenderer.invoke('auth:open-sign-in'),
    openDashboard: () => ipcRenderer.invoke('auth:open-dashboard'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    initialize: () => ipcRenderer.invoke('auth:initialize'),
    waitForReady: (timeoutMs?: number) =>
      ipcRenderer.invoke('auth:waitForReady', timeoutMs),

    // Subscribe to auth state changes
    onStateChange: (
      callback: (event: { state: string; user: unknown }) => void
    ) => {
      const listener = (
        _event: unknown,
        data: { state: string; user: unknown }
      ) => callback(data);
      ipcRenderer.on('auth:state-changed', listener);
      return () => ipcRenderer.removeListener('auth:state-changed', listener);
    },
  },

  // Window Detection APIs
  windowDetector: {
    getActiveMeetingWindow: () =>
      ipcRenderer.invoke('window-detector:get-active-meeting'),

    getAllMeetingWindows: () =>
      ipcRenderer.invoke('window-detector:get-all-meetings'),

    isWindowActive: (windowId: number) =>
      ipcRenderer.invoke('window-detector:is-window-active', windowId),
  },

  // Meeting Orchestrator APIs
  orchestrator: {
    getCurrentSession: () =>
      ipcRenderer.invoke('orchestrator:get-current-session'),

    manualStop: () => ipcRenderer.invoke('orchestrator:manual-stop'),

    toggleRecord: () => ipcRenderer.invoke('orchestrator:toggle-record'),

    endMeeting: () => ipcRenderer.invoke('orchestrator:end-meeting'),
  },

  // Auto-updater APIs
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  },

  // Permissions APIs
  permissions: {
    getStatus: () => ipcRenderer.invoke('permissions:getStatus'),
    requestMicrophone: () =>
      ipcRenderer.invoke('permissions:requestMicrophone'),
    requestScreenRecording: () =>
      ipcRenderer.invoke('permissions:requestScreenRecording'),
  },

  // App APIs
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },

  // Settings APIs
  settings: {
    getRememberMe: () => ipcRenderer.invoke('settings:get-remember-me'),
    setRememberMe: (value: boolean) =>
      ipcRenderer.invoke('settings:set-remember-me', value),
  },

  // Support APIs
  support: {
    reportIssue: (description: string) =>
      ipcRenderer.invoke('support:report-issue', description),
  },

  // Upload APIs
  upload: {
    manualFile: (
      fileBuffer: ArrayBuffer,
      fileName: string,
      fileType: string,
      fileSizeMB: number,
      meetingInfo?: {
        title: string;
        startTime: string;
        endTime?: string;
        meetingId?: string;
      }
    ) =>
      ipcRenderer.invoke('upload:manual-file', {
        fileBuffer,
        fileName,
        fileType,
        fileSizeMB,
        meetingInfo,
      }),
  },
});
