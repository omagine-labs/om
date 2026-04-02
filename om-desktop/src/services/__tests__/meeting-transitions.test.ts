import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeetingOrchestrator, RecordingState } from '../meeting-orchestrator';
import type {
  WindowDetector,
  MeetingAppInfo,
} from '../../native-window-detector';
import type { NativeRecorder } from '../../native-recorder';
import type { MeetingWindow } from '../../types/electron';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-recordings'),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024 * 1024 * 10 })),
    realpathSync: vi.fn((p: string) => p),
  },
}));

vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  },
}));

vi.mock('node:crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'test-uuid'),
  },
  randomUUID: vi.fn(() => 'test-uuid'),
}));

// Mock services
// Create singleton mock control bar that's returned every time
const mockControlBar = {
  show: vi.fn(),
  close: vi.fn(),
  updateState: vi.fn(),
  updateTitle: vi.fn(),
  scheduleAutoClose: vi.fn(),
  showProcessing: vi.fn(),
};

vi.mock('../recording-control-bar', () => ({
  getRecordingControlBar: vi.fn(() => mockControlBar),
}));

vi.mock('../upload-service', () => ({
  uploadService: {
    uploadStitchedAudio: vi.fn(),
  },
}));

vi.mock('../upload-queue', () => ({
  uploadQueue: {
    queueForLater: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  authService: {
    getUser: vi.fn(() => ({ id: 'test-user' })),
    getState: vi.fn(() => 'authenticated'),
    getSession: vi.fn(async () => ({
      access_token: 'mock-access-token',
      user: { id: 'test-user' },
    })),
  },
}));

/**
 * Test suite for meeting transition scenarios
 *
 * These tests cover the complex state transitions that have been causing bugs:
 * - Switching between different meeting platforms
 * - Handling synthetic windows (mic-based detection)
 * - Browser detection with URL validation
 * - Multiple simultaneous meetings
 */
describe('Meeting Transitions', () => {
  let orchestrator: MeetingOrchestrator;
  let mockDetector: WindowDetector;
  let mockRecorder: NativeRecorder;

  beforeEach(() => {
    // Use fake timers for precise control over detection intervals
    vi.useFakeTimers();

    // Clear mock control bar calls
    vi.clearAllMocks();

    // Create mock detector
    mockDetector = {
      getActiveMeetingWindow: vi.fn(),
      getAllMeetingWindows: vi.fn(() => []),
      isWindowActive: vi.fn(() => true),
      getWindowTabURLs: vi.fn(() => []),
      isMicrophoneInUse: vi.fn(() => false),
      getRunningMeetingApps: vi.fn(() => []),
      isInMeeting: vi.fn(() => null),
    } as unknown as WindowDetector;

    // Create mock recorder
    mockRecorder = {
      startRecording: vi.fn(() => Promise.resolve({ success: true })),
      stopRecording: vi.fn(() =>
        Promise.resolve({ success: true, filePath: '/tmp/recording.mov' })
      ),
      isRecording: vi.fn(() => true),
      pauseMicCapture: vi.fn(() => ({ success: true })),
      resumeMicCapture: vi.fn(() => ({ success: true })),
      isMicCapturePaused: vi.fn(() => false),
    } as unknown as NativeRecorder;

    orchestrator = new MeetingOrchestrator(mockDetector, mockRecorder);
  });

  afterEach(() => {
    orchestrator.stop();
    vi.useRealTimers();
  });

  describe('Google Meet → Slack Huddle Transition', () => {
    it('should stay on first meeting (Google Meet) when not recording and Slack starts', async () => {
      // Step 1: Google Meet detected via window
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Daily Standup',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      // Simulate detection cycle - Meet detected
      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100); // Run initial detection immediately

      const session1 = orchestrator.getCurrentSession();
      expect(session1).toBeTruthy();
      expect(session1?.platform).toBe('meet');
      expect(session1?.state).toBe(RecordingState.MEETING_DETECTED);

      // Step 2: Slack huddle starts (both Meet and Slack active)
      const slackAppInfo: MeetingAppInfo = {
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      };

      vi.mocked(mockDetector.isInMeeting).mockReturnValue(slackAppInfo);
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        meetWindow,
      ]);
      // Google Meet tab still open
      vi.mocked(mockDetector.isWindowActive).mockReturnValue(true);
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://meet.google.com/abc-defg-hij',
      ]);

      await vi.advanceTimersByTimeAsync(5000); // Advance to next detection cycle

      // "First meeting wins" - should stay on Google Meet since we're not recording
      const session2 = orchestrator.getCurrentSession();
      expect(session2?.platform).toBe('meet');

      // Step 3: Close Google Meet tab (Slack still active)
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([]); // Meet window gone
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([]);
      vi.mocked(mockDetector.isWindowActive).mockReturnValue(false); // Meet window closed
      // Mic still in use, Slack still running
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(slackAppInfo);

      // Wait for hysteresis (3 detections of different meeting = 15s)
      await vi.advanceTimersByTimeAsync(5000); // 1st - Slack detected, counter = 1
      await vi.advanceTimersByTimeAsync(5000); // 2nd - Slack detected, counter = 2
      await vi.advanceTimersByTimeAsync(5000); // 3rd - Slack detected, Meet session ends

      // Next cycle should create Slack session
      await vi.advanceTimersByTimeAsync(5000);

      // Should transition to Slack after hysteresis
      const session3 = orchestrator.getCurrentSession();
      expect(session3).toBeTruthy();
      expect(session3?.platform).toBe('slack');
      expect(session3?.state).toBe(RecordingState.MEETING_DETECTED);
    });

    it('should NOT show "Processing" when transitioning between detected meetings', async () => {
      // Start with Google Meet
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Transition to Slack
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      });

      await vi.advanceTimersByTimeAsync(5000);

      // Should NOT have called showProcessing
      expect(mockControlBar.showProcessing).not.toHaveBeenCalled();
    });
  });

  describe('Synthetic Window Transitions', () => {
    it('should transition between meetings when one has synthetic window (windowId=0)', async () => {
      // Start with Slack huddle (synthetic window)
      const slackAppInfo: MeetingAppInfo = {
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(slackAppInfo);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session1 = orchestrator.getCurrentSession();
      expect(session1?.platform).toBe('slack');
      expect(session1?.windowId).toBe(0); // Synthetic window

      // Transition to Google Meet (real window)
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      // Wait for hysteresis (3 detections of different meeting)
      await vi.advanceTimersByTimeAsync(5000); // 1st - Meet detected, counter = 1
      await vi.advanceTimersByTimeAsync(5000); // 2nd - Meet detected, counter = 2
      await vi.advanceTimersByTimeAsync(5000); // 3rd - Meet detected, Slack session ends

      // Next cycle should create Meet session
      await vi.advanceTimersByTimeAsync(5000);

      // Should transition after hysteresis (different platform)
      const session2 = orchestrator.getCurrentSession();
      expect(session2?.platform).toBe('meet');
      expect(session2?.windowId).toBe(12345);
    });
  });

  describe('Browser Detection with URL Validation', () => {
    it('should NOT detect meeting when browser is open without meeting URL', async () => {
      // Mic in use + Chrome running, but no meeting URL
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      // No meeting URLs in tabs
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://gmail.com',
        'https://meet.google.com/new',
        'https://calendar.google.com',
      ]);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should NOT create a session
      const session = orchestrator.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should detect meeting when browser has valid meeting URL', async () => {
      // Mic in use + Chrome running + valid meeting URL
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://gmail.com',
        'https://meet.google.com/abc-defg-hij', // Valid meeting URL
        'https://calendar.google.com',
      ]);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should create a session
      const session = orchestrator.getCurrentSession();
      expect(session).toBeTruthy();
      expect(session?.platform).toBe('meet');
    });

    it('should reject meet.google.com URLs without meeting codes', async () => {
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://meet.google.com',
        'https://meet.google.com/new',
        'https://meet.google.com/landing',
      ]);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session = orchestrator.getCurrentSession();
      expect(session).toBeNull();
    });
  });

  describe('Tab Movement', () => {
    it('should recognize same Google Meet when tab is pulled into new window', async () => {
      // Start with Google Meet in a tab (window ID 12345)
      const meetWindowInTab: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Daily Standup',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindowInTab
      );
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });
      // Mock mic in use to prevent mic probe from ending meeting
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session1 = orchestrator.getCurrentSession();
      expect(session1).toBeTruthy();
      expect(session1?.platform).toBe('meet');
      expect(session1?.windowId).toBe(12345);

      // Start recording
      await orchestrator.manualStart();
      expect(session1?.state).toBe(RecordingState.RECORDING);

      // User pulls tab out into its own window (new window ID 67890)
      // The URL stays the same but window ID changes
      const meetWindowInNewWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 67890, // NEW window ID
        windowTitle: 'Meet - Daily Standup',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij', // SAME meeting code
        bounds: { x: 100, y: 100, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindowInNewWindow
      );
      // Mock getWindowTabURLs to return the meeting URL when queried for new window
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://meet.google.com/abc-defg-hij',
      ]);

      await vi.advanceTimersByTimeAsync(5000); // Next detection cycle

      // Should NOT have transitioned (still same session)
      const session2 = orchestrator.getCurrentSession();
      expect(session2).toBeTruthy();
      expect(session2?.sessionId).toBe(session1?.sessionId); // Same session
      expect(session2?.state).toBe(RecordingState.RECORDING); // Still recording

      // Should NOT have stopped recording
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();

      // Should NOT have shown processing message
      expect(mockControlBar.showProcessing).not.toHaveBeenCalled();
    });

    it('should stop recording when Google Meet URL changes to different meeting', async () => {
      // Start with Google Meet
      const meetWindow1: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Daily Standup',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow1
      );
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Start recording
      await orchestrator.manualStart();

      const session1 = orchestrator.getCurrentSession();
      expect(session1?.state).toBe(RecordingState.RECORDING);

      // User navigates to a DIFFERENT Google Meet (different meeting code)
      const meetWindow2: MeetingWindow = {
        platform: 'meet',
        windowId: 12345, // Same window
        windowTitle: 'Meet - Product Review',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/xyz-uvwx-rst', // DIFFERENT meeting code
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow2
      );

      // Wait for hysteresis (3 detections of different meeting)
      await vi.advanceTimersByTimeAsync(5000); // 1st - different meeting, counter = 1
      await vi.advanceTimersByTimeAsync(5000); // 2nd - different meeting, counter = 2
      await vi.advanceTimersByTimeAsync(5000); // 3rd - different meeting, session ends
      await vi.advanceTimersByTimeAsync(1000); // Transition delay

      // Should have stopped recording after hysteresis (different meeting)
      expect(mockRecorder.stopRecording).toHaveBeenCalled();

      // Should have shown processing message
      expect(mockControlBar.showProcessing).toHaveBeenCalled();
    });
  });

  describe('Recording State Transitions', () => {
    it('should show "Processing" when transitioning from RECORDING state', async () => {
      // Start with Google Meet and start recording
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Start recording
      await orchestrator.manualStart();

      const session1 = orchestrator.getCurrentSession();
      expect(session1?.state).toBe(RecordingState.RECORDING);

      // Now transition to Slack
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      });

      // Wait for hysteresis (3 detections of different meeting)
      await vi.advanceTimersByTimeAsync(5000); // 1st - Slack detected, counter = 1
      await vi.advanceTimersByTimeAsync(5000); // 2nd - Slack detected, counter = 2
      await vi.advanceTimersByTimeAsync(5000); // 3rd - Slack detected, Meet session ends
      await vi.advanceTimersByTimeAsync(1000); // Transition delay

      // Should have shown "Processing" message after hysteresis
      expect(mockControlBar.showProcessing).toHaveBeenCalled();
    });
  });

  describe('Detection Hysteresis', () => {
    it('should wait for 2 failed detections (10s) before ending meeting', async () => {
      // Start with a meeting detected
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session1 = orchestrator.getCurrentSession();
      expect(session1).toBeTruthy();
      expect(session1?.platform).toBe('meet');

      // Simulate brief detection failure (e.g., tab switch)
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(false);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(null);

      // First failed detection - session should persist
      await vi.advanceTimersByTimeAsync(5000);
      const session2 = orchestrator.getCurrentSession();
      expect(session2).toBeTruthy();
      expect(session2?.platform).toBe('meet');

      // Second failed detection - should end meeting (threshold 2 reached)
      await vi.advanceTimersByTimeAsync(5000);
      const session3 = orchestrator.getCurrentSession();
      expect(session3).toBeNull();
    });

    it('should reset hysteresis counter when meeting detected again', async () => {
      // Start with a meeting detected
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Simulate one brief failure (less than threshold to not end meeting)
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(false);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(null);

      await vi.advanceTimersByTimeAsync(5000); // First miss (count = 1)
      expect(orchestrator.getCurrentSession()).toBeTruthy(); // Still active

      // Meeting detected again - counter should reset
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      await vi.advanceTimersByTimeAsync(5000);
      const session = orchestrator.getCurrentSession();
      expect(session).toBeTruthy();

      // Now test that we need 2 MORE failures (counter was reset, threshold is 2)
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(false);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(null);

      await vi.advanceTimersByTimeAsync(5000); // First miss (count = 1)
      expect(orchestrator.getCurrentSession()).toBeTruthy(); // Still active

      await vi.advanceTimersByTimeAsync(5000); // Second miss (count = 2) - now ends
      expect(orchestrator.getCurrentSession()).toBeNull();
    });
  });

  describe('User Action Locking', () => {
    it('should not end session while user is clicking start button', async () => {
      // Start with meeting detected
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(orchestrator.getCurrentSession()).toBeTruthy();

      // User clicks start button (this sets lock)
      // Don't await - this simulates user action in progress
      const startPromise = orchestrator.manualStart();

      // Simulate meeting disappearing (e.g., tab closed briefly)
      // Note: Keep isMicrophoneInUse true to test lock behavior, not mic probe behavior
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(null);

      // Detection loop runs while user action is in progress
      // Should skip detection due to lock
      await vi.advanceTimersByTimeAsync(5000);

      // Session should still exist (detection was skipped)
      const session = orchestrator.getCurrentSession();
      expect(session).toBeTruthy();

      // Wait for user action to complete
      await startPromise;
    });

    it('should not clear session during manual stop', async () => {
      // Start with meeting detected
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow
      );
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session1 = orchestrator.getCurrentSession();
      expect(session1?.state).toBe(RecordingState.MEETING_DETECTED);

      // Simulate meeting disappearing
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(false);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(null);

      // User clicks stop/cancel (this sets lock)
      const stopPromise = orchestrator.manualStop();

      // Detection loop runs while stop is in progress
      await vi.advanceTimersByTimeAsync(5000);

      // Wait for stop to complete
      await stopPromise;

      // Session should be cleared by manualStop, not by detection loop
      expect(orchestrator.getCurrentSession()).toBeNull();
      // Control bar should have been closed by manualStop
      expect(mockControlBar.close).toHaveBeenCalled();
    });
  });
});
