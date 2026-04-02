export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string; // data URL
  display_id: string;
  appIcon: string | null;
}

export interface Recording {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

export interface RecordingOptions {
  displayId?: number;
  windowId?: number;
}

export interface AuthUser {
  id: string;
  email?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_metadata?: Record<string, any>;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface MeetingWindow {
  platform: 'zoom' | 'meet' | 'teams' | 'slack' | 'manual';
  windowId: number;
  windowTitle: string;
  appName: string;
  url?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface WindowDetectorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MeetingSession {
  sessionId: string;
  platform: 'zoom' | 'meet' | 'teams' | 'slack' | 'manual';
  windowId: number;
  windowTitle: string;
  startTime: string;
  endTime?: string;
  recordingPath?: string;
  state:
    | 'idle'
    | 'detected'
    | 'recording'
    | 'stopping'
    | 'uploading'
    | 'processing'
    | 'completed';
  metadata: {
    title: string;
    platform: 'zoom' | 'meet' | 'teams' | 'slack' | 'manual';
    windowTitle: string;
    appName: string;
    url?: string;
    meetingCode?: string;
    startTime: string;
    endTime?: string;
    fileSizeMB?: number;
    durationSeconds?: number;
    filename?: string;
  };
  error?: string;
}

export interface ElectronAPI {
  getWebAppUrl: () => Promise<string>;
  environment: 'local' | 'production';
  getSources: () => Promise<DesktopSource[]>;
  getRecordings: () => Promise<Recording[]>;
  openRecordingsFolder: () => Promise<{ success: boolean; error?: string }>;
  openRecording: (
    filePath: string
  ) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  checkSubscription: () => Promise<boolean>;
  startNativeRecording: (
    options: RecordingOptions
  ) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  stopNativeRecording: () => Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }>;
  startManualRecording: (
    sourceId: string,
    sourceName: string,
    displayId?: string
  ) => Promise<{ success: boolean; error?: string }>;
  closeScreenPicker: () => Promise<void>;

  auth: {
    // Core methods
    getUser: () => Promise<AuthUser | null>;
    getSession: () => Promise<{
      access_token: string;
      refresh_token: string;
      user: AuthUser;
    } | null>;
    getState: () => Promise<'loading' | 'authenticated' | 'unauthenticated'>;
    signOut: () => Promise<{ success: boolean }>;
    openSignIn: () => Promise<{ success: boolean }>;
    openDashboard: () => Promise<{ success: boolean; error?: string }>;
    isAuthenticated: () => Promise<boolean>;
    initialize: () => Promise<{
      success: boolean;
      state?: 'loading' | 'authenticated' | 'unauthenticated';
      user?: AuthUser | null;
      error?: string;
    }>;
    waitForReady: (timeoutMs?: number) => Promise<{
      state: 'loading' | 'authenticated' | 'unauthenticated';
      user: AuthUser | null;
    }>;
    onStateChange: (
      callback: (event: { state: string; user: AuthUser | null }) => void
    ) => () => void;
  };

  permissions: {
    getStatus: () => Promise<{
      microphone: 'granted' | 'denied' | 'not-determined' | 'restricted';
      screenRecording: boolean;
    }>;
    requestMicrophone: () => Promise<{
      success: boolean;
      granted?: boolean;
      error?: string;
    }>;
    requestScreenRecording: () => Promise<{
      success: boolean;
      requiresManualEnable?: boolean;
      error?: string;
    }>;
  };

  app: {
    getVersion: () => Promise<string>;
  };

  windowDetector: {
    getActiveMeetingWindow: () => Promise<WindowDetectorResult<MeetingWindow>>;
    getAllMeetingWindows: () => Promise<WindowDetectorResult<MeetingWindow[]>>;
    isWindowActive: (
      windowId: number
    ) => Promise<WindowDetectorResult<boolean>>;
  };

  orchestrator: {
    getCurrentSession: () => Promise<
      WindowDetectorResult<MeetingSession | null>
    >;
    manualStop: () => Promise<{ success: boolean; error?: string }>;
  };

  updater: {
    checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
    quitAndInstall: () => Promise<{ success: boolean }>;
  };

  settings: {
    getRememberMe: () => Promise<boolean>;
    setRememberMe: (
      value: boolean
    ) => Promise<{ success: boolean; error?: string }>;
  };

  support: {
    reportIssue: (
      description: string
    ) => Promise<{ success: boolean; error?: string }>;
  };

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
    ) => Promise<{
      success: boolean;
      jobId?: string;
      storagePath?: string;
      message?: string;
    }>;
  };

  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
