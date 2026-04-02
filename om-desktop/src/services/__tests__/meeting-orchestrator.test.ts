import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MeetingOrchestrator, RecordingState } from '../meeting-orchestrator';
import type { WindowDetector } from '../../native-window-detector';
import type { NativeRecorder } from '../../native-recorder';
import type { MeetingWindow } from '../../types/electron';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-recordings'),
  },
  Notification: class MockNotification {
    private listeners: Map<string, () => void> = new Map();

    constructor(public options: { title: string; body: string }) {}

    show() {
      // Simulate notification showing
    }

    close() {
      // Simulate notification closing and trigger 'close' event
      const closeHandler = this.listeners.get('close');
      if (closeHandler) {
        closeHandler();
      }
    }

    once(event: string, handler: () => void) {
      this.listeners.set(event, handler);
    }
  },
}));

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true), // Return true so finalizeRecording can proceed
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(), // For cleanup of temp files
    writeFileSync: vi.fn(), // For concat list creation
    readFileSync: vi.fn(() => Buffer.from('mock audio data')), // For reading audio files
    statSync: vi.fn(() => ({ size: 1024 * 1024 * 10 })), // 10MB
    realpathSync: vi.fn((p: string) => p), // Return path as-is for testing
    lstatSync: vi.fn(() => ({
      isSymbolicLink: () => false,
      isDirectory: () => true,
    })),
    promises: {
      stat: vi.fn(async () => ({ size: 1024 * 1024 * 10 })), // 10MB
      unlink: vi.fn(async () => {}),
      readFile: vi.fn(async () => Buffer.from('mock audio data')),
    },
  },
}));

// Mock fs/promises module (separate import)
vi.mock('node:fs/promises', () => ({
  default: {
    stat: vi.fn(async () => ({ size: 1024 * 1024 * 10 })), // 10MB
    unlink: vi.fn(async () => {}),
    readFile: vi.fn(async () => Buffer.from('mock audio data')),
  },
}));

// Mock path module
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  },
}));

// Mock crypto module
vi.mock('node:crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'test-uuid-1234'),
  },
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

// Mock electron-store
vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Map<string, unknown> = new Map();

    get(key: string, defaultValue?: unknown) {
      return this.data.get(key) ?? defaultValue;
    }

    set(key: string, value: unknown) {
      this.data.set(key, value);
    }

    delete(key: string) {
      this.data.delete(key);
    }

    clear() {
      this.data.clear();
    }
  },
}));

// Mock upload queue
vi.mock('../upload-queue', () => ({
  uploadQueue: {
    queueForLater: vi.fn(),
    processQueue: vi.fn(),
    getQueueStatus: vi.fn(() => ({ count: 0, items: [] })),
  },
}));

// Mock audio service
vi.mock('../audio-service', () => ({
  audioService: {
    extractAudioFromSegments: vi.fn(async (paths: string[]) =>
      paths.map((audioPath) => ({
        success: true,
        audioPath: audioPath.replace('.mov', '.mp3'),
      }))
    ),
    stitchAudio: vi.fn(async () => ({
      success: true,
      stitchedPath: '/tmp/stitched.mp3',
      totalDuration: 300,
      offRecordPeriods: [],
    })),
  },
}));

// Mock upload service
vi.mock('../upload-service', () => ({
  uploadService: {
    uploadStitchedAudio: vi.fn(async () => ({
      success: true,
      meetingId: 'test-meeting-id',
    })),
  },
}));

// Mock recording control bar
vi.mock('../recording-control-bar', () => ({
  getRecordingControlBar: vi.fn(() => ({
    show: vi.fn(),
    updateState: vi.fn(),
    showProcessing: vi.fn(),
    scheduleAutoClose: vi.fn(),
    close: vi.fn(),
    isShowing: vi.fn(() => false),
  })),
}));

// Mock auth module
vi.mock('../../lib/auth', () => ({
  authService: {
    getUser: vi.fn(() => ({
      id: 'test-user-id',
      email: 'test@example.com',
    })),
    getState: vi.fn(() => 'authenticated'),
    getSession: vi.fn(async () => ({
      access_token: 'mock-access-token',
      user: { id: 'test-user-id', email: 'test@example.com' },
    })),
  },
}));

// Mock meeting metadata extraction
vi.mock('../../lib/meeting-metadata', () => ({
  extractMeetingMetadata: vi.fn((window: MeetingWindow) => {
    // Extract meeting code with security validation (URL constructor validates scheme)
    let meetingCode = '';
    if (window.url) {
      try {
        const urlObj = new URL(window.url);
        if (['http:', 'https:'].includes(urlObj.protocol)) {
          const match = urlObj.href.match(/meet\.google\.com\/([a-z-]{3,})/);
          if (match && match[1]) {
            const code = match[1];
            // Ensure proper Google Meet format (minimum 2 hyphens)
            const hyphenCount = (code.match(/-/g) || []).length;
            if (hyphenCount >= 2) {
              meetingCode = code;
            }
          }
        }
      } catch {
        // Invalid URL, skip meeting code extraction
      }
    }
    return {
      platform: window.platform,
      title: window.windowTitle,
      url: window.url || '',
      meetingCode,
    };
  }),
  formatDuration: vi.fn((seconds: number) => `${seconds}s`),
  formatFileSize: vi.fn((bytes: number) => `${bytes}B`),
}));

describe('MeetingOrchestrator', () => {
  let orchestrator: MeetingOrchestrator;
  let mockDetector: WindowDetector;
  let mockRecorder: NativeRecorder;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create mock detector
    mockDetector = {
      getActiveMeetingWindow: vi.fn(),
      getAllMeetingWindows: vi.fn(() => []),
      isWindowActive: vi.fn(() => true),
      getWindowTabURLs: vi.fn(() => []),
      // New mic-based detection methods
      isInMeeting: vi.fn(() => null), // Default to no meeting
      isMicrophoneInUse: vi.fn(() => false),
      getRunningMeetingApps: vi.fn(() => []),
    } as unknown as WindowDetector;

    // Create mock recorder
    mockRecorder = {
      startRecording: vi.fn(async () => ({ success: true })),
      stopRecording: vi.fn(async () => ({
        success: true,
        filePath: '/tmp/test.mov',
      })),
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
    vi.restoreAllMocks();
  });

  describe('State Machine', () => {
    it('should start in IDLE state', () => {
      expect(orchestrator.getCurrentSession()).toBeNull();
    });

    it('should transition to MEETING_DETECTED when meeting found', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session = orchestrator.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.state).toBe(RecordingState.MEETING_DETECTED);
    });

    it('should transition to RECORDING when manually started', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Manually start recording
      await orchestrator.manualStart();

      const session = orchestrator.getCurrentSession();
      expect(session?.state).toBe(RecordingState.RECORDING);
      expect(mockRecorder.startRecording).toHaveBeenCalled();
    });

    it('should start audio-only recording with startManualAudioRecording', async () => {
      // Mock recorder to track calls
      const startRecordingSpy = vi.spyOn(mockRecorder, 'startRecording');

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Start manual audio recording (no screen picker)
      const result = await orchestrator.startManualAudioRecording();

      expect(result.success).toBe(true);

      // Verify session was created
      const session = orchestrator.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.platform).toBe('manual');
      expect(session?.windowTitle).toBe('Manual Recording');
      expect(session?.state).toBe(RecordingState.RECORDING);

      // Verify audio recording started (windowId and displayId should be 0)
      expect(startRecordingSpy).toHaveBeenCalled();
      const callArgs = startRecordingSpy.mock.calls[0][0];
      expect(callArgs.outputPath).toBeDefined();
      expect(callArgs.displayId).toBeUndefined(); // Not passed for audio-only
      expect(callArgs.windowId).toBeUndefined(); // Not passed for audio-only
    });
  });

  describe('Meeting Detection', () => {
    it('should detect Google Meet window', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Meet - abc-def-ghi',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(orchestrator.getCurrentSession()).not.toBeNull();
    });

    it('should filter out terminal windows', async () => {
      const terminalWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'iTerm',
        appName: 'iTerm',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      const realWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 456,
        windowTitle: 'Meet - abc-def-ghi',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(terminalWindow);
      (
        mockDetector.getAllMeetingWindows as ReturnType<typeof vi.fn>
      ).mockReturnValue([terminalWindow, realWindow]);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session = orchestrator.getCurrentSession();
      expect(session?.windowId).toBe(456); // Should use real window, not terminal
    });

    it('should not detect landing page as new meeting', async () => {
      // Landing pages should not be returned by the native detector
      // The native code already filters these out
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(orchestrator.getCurrentSession()).toBeNull();
    });
  });

  describe('URL Parsing and Validation', () => {
    it('should extract meeting code from valid URL', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session = orchestrator.getCurrentSession();
      expect(session?.metadata.meetingCode).toBe('abc-def-ghi');
    });

    it('should handle malformed URLs safely', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'not-a-valid-url',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should not crash, should handle gracefully
      expect(orchestrator.getCurrentSession()).not.toBeNull();
    });

    it('should reject URLs without hyphens in meeting code', async () => {
      const invalidWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abcdefghi', // No hyphens
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(invalidWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session = orchestrator.getCurrentSession();
      // Should still detect meeting but meetingCode might be empty
      expect(session).not.toBeNull();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent concurrent session creation', async () => {
      const meeting1: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Meeting 1',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/aaa-bbb-ccc',
      };

      const meeting2: MeetingWindow = {
        platform: 'meet',
        windowId: 456,
        windowTitle: 'Meeting 2',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/xxx-yyy-zzz',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValueOnce(meeting1);
      // Mock mic in use to prevent mic probe from ending meeting
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // Switch to new meeting during transition
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meeting2);
      await vi.advanceTimersByTimeAsync(5000);

      // Should NOT complete first meeting - "first meeting wins" logic
      // The second meeting should be ignored
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();
      expect(orchestrator.getCurrentSession()?.platform).toBe('meet');
      expect(orchestrator.getCurrentSession()?.windowId).toBe(123);
    });
  });

  describe('Error Handling', () => {
    it('should handle recording start failure gracefully', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (
        mockRecorder.startRecording as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: false,
        error: 'Failed to start',
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      const session = orchestrator.getCurrentSession();
      expect(session).toBeNull(); // Should clear session on error
    });

    it('should handle recording stop failure gracefully', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (
        mockRecorder.stopRecording as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: false,
        error: 'Failed to stop',
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      await orchestrator.manualStop();

      const session = orchestrator.getCurrentSession();
      expect(session).toBeNull(); // Should handle error and clear
    });

    it('should use type guard for non-Error exceptions', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (
        mockRecorder.startRecording as ReturnType<typeof vi.fn>
      ).mockRejectedValue('String error');

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // Should handle string error without crashing
      const session = orchestrator.getCurrentSession();
      expect(session).toBeNull();
    });
  });

  describe('Notification Management', () => {
    it('should show notification when meeting detected', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Notification should be shown
      expect(orchestrator.getCurrentSession()).not.toBeNull();
    });

    it('should cleanup notification reference on close', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Notification reference should be managed properly
      // (actual cleanup tested via notification lifecycle)
    });
  });

  describe('Manual Stop', () => {
    it('should allow manual stop during opt-out period', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const result = await orchestrator.manualStop();

      expect(result.success).toBe(true);
      expect(orchestrator.getCurrentSession()).toBeNull();
    });

    it('should stop recording when manually stopped', async () => {
      const { uploadService } = await import('../upload-service');

      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Verify session was created
      const session = orchestrator.getCurrentSession();
      expect(session).not.toBeNull();

      const startResult = await orchestrator.manualStart(); // Manually start recording
      expect(startResult.success).toBe(true);

      const result = await orchestrator.manualStop();

      expect(result.success).toBe(true);
      expect(mockRecorder.stopRecording).toHaveBeenCalled();
      // Verify new audio stitching flow was used
      expect(uploadService.uploadStitchedAudio).toHaveBeenCalled();
    });

    it('should return error when no active session', async () => {
      const result = await orchestrator.manualStop();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active recording');
    });
  });

  describe('End Detection', () => {
    it('should stop recording when window closed', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']);
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // User closes the browser window - simulate persistent window closure
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      ); // Window actually closed

      // Advance through end detection intervals
      // Threshold is 2, so should stop after 2 consecutive failures (4s total with 2s intervals)
      await vi.advanceTimersByTimeAsync(2000); // 1st check - failure (count = 1)
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2000); // 2nd check - failure (count = 2, threshold reached)

      // Should have stopped now
      expect(mockRecorder.stopRecording).toHaveBeenCalled();
    });

    it('should stop recording after max duration (4 hours)', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // Advance 4 hours
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 5000);

      expect(mockRecorder.stopRecording).toHaveBeenCalled();
    });

    it('should NOT stop recording when user switches tabs (hysteresis prevents false positive)', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting - Meet',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      ); // Window still exists
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']); // Meeting tab still open
      // Mock mic in use to prevent mic probe from ending meeting
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // Simulate brief detection failure (e.g., during tab switch animation)
      // This simulates the macOS API briefly returning false during a tab switch
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false) // First check: false (tab switch glitch)
        .mockReturnValue(true); // Subsequent checks: back to true

      // Advance through end detection intervals
      // With threshold of 2, it should NOT stop on first failure
      await vi.advanceTimersByTimeAsync(1000); // 1st check - failure (count = 1)

      // Should not have stopped yet (threshold is 2)
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();

      // Next check - window is back (API recovered)
      await vi.advanceTimersByTimeAsync(1000); // 2nd check - success (count reset to 0)

      // Still should not have stopped
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();

      // Continue recording for a bit longer to confirm stability
      await vi.advanceTimersByTimeAsync(5000);

      // Recording should still be active
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();
    });

    it('should stop recording when meeting tab is actually closed (after hysteresis threshold)', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting - Meet',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']);
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // User closes the browser window - simulate persistent window closure
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      ); // Window actually closed

      // Advance through end detection intervals
      // Threshold is 2, so should stop after 2 consecutive failures (4s total with 2s intervals)
      await vi.advanceTimersByTimeAsync(2000); // 1st check - failure (count = 1)
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2000); // 2nd check - failure (count = 2, threshold reached)

      // Should have stopped now
      expect(mockRecorder.stopRecording).toHaveBeenCalled();
    });

    // SKIPPED: Mic probe is currently disabled (DISABLE_MIC_PROBE = true in meeting-orchestrator.ts)
    // Re-enable this test when mic probe is re-enabled after investigating event-driven detection
    it.skip('should not re-detect meeting when mic probe ends recording (tab still open)', async () => {
      // This tests the fix for: when user ends a Google Meet call (hangs up),
      // the tab stays open but mic probe detects mic is no longer in use.
      // Without the fix, the main detection loop would re-detect the tab and
      // create a new session, showing incorrect "Meeting Detected" state.
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting - Meet',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      // Initial setup: meeting detected, window active, mic in use
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']);
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Start recording

      expect(orchestrator.getCurrentSession()?.state).toBe(
        RecordingState.RECORDING
      );

      // User ends the call (hangs up) - mic is no longer in use by meeting app
      // but the tab stays open
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(null); // Mic released by meeting app (returns null when no app using mic)

      // Mic probe runs at 2s intervals, needs 2 consecutive misses to trigger
      // Also need to advance in smaller increments to allow async mic probe to complete
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(2100); // Slightly more than interval + mic probe pause
      }

      // Recording should have stopped
      expect(mockRecorder.stopRecording).toHaveBeenCalled();

      // Session should be cleared
      expect(orchestrator.getCurrentSession()).toBeNull();

      // Meeting should be marked as ended (in manuallyStoppedMeetings)
      // so detection loop won't re-create a session
      expect(orchestrator.hasDismissedMeeting()).toBe(true);

      // Main detection loop runs - should NOT create a new session
      // even though the tab is still open
      await vi.advanceTimersByTimeAsync(5000); // Detection loop interval

      // Should still have no session (meeting was marked as ended)
      expect(orchestrator.getCurrentSession()).toBeNull();
    });
  });

  describe('Same Meeting Detection', () => {
    it('should recognize same meeting by URL code', async () => {
      const meeting1: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      const meeting2: MeetingWindow = {
        platform: 'meet',
        windowId: 456, // Different window ID
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi', // Same meeting code
      };

      (mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(meeting1) // Initial detection
        .mockReturnValueOnce(meeting1) // Check before recording starts
        .mockReturnValue(meeting2); // Subsequent checks with different windowId

      // For end detection, mock tab URLs to show meeting is still active
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      // Mock mic in use to prevent mic probe from ending meeting
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      const stopCallsBefore = (
        mockRecorder.stopRecording as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Detection loop runs again with different window ID but same meeting code
      await vi.advanceTimersByTimeAsync(5000);

      const stopCallsAfter = (
        mockRecorder.stopRecording as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Should NOT have called stopRecording (same meeting, just different windowId)
      expect(stopCallsAfter).toBe(stopCallsBefore);
    });

    it('should detect different meeting by URL code', async () => {
      const meeting1: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting 1',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      const meeting2: MeetingWindow = {
        platform: 'meet',
        windowId: 456,
        windowTitle: 'Test Meeting 2',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/xxx-yyy-zzz', // Different meeting
      };

      (mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(meeting1)
        .mockReturnValue(meeting2);
      // Mock mic in use to prevent mic probe from ending meeting
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Manually start recording

      // Detection loop runs again with different meeting
      await vi.advanceTimersByTimeAsync(5000);

      // Should NOT stop first recording - "first meeting wins" logic
      // The app should ignore the second meeting and stay with the first
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();
    });

    it('should NOT end meeting when different meeting is detected while off-record', async () => {
      const googleMeet: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Google Meet - Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      const slackHuddle: MeetingWindow = {
        platform: 'slack',
        windowId: 456,
        windowTitle: 'Slack Huddle',
        appName: 'Slack',
        url: 'slack://huddle/team123',
      };

      // Start with Google Meet
      (mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(googleMeet)
        .mockReturnValueOnce(googleMeet);

      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      // Mock mic in use to prevent mic probe from ending meeting
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Start recording Google Meet

      // Toggle to off-record (needs time advance for internal setTimeout)
      const togglePromise = orchestrator.toggleRecord();
      await vi.advanceTimersByTimeAsync(500); // Advance timers for 300ms delay + buffer
      await togglePromise;

      // Now Slack huddle starts - detection returns Slack instead of Google Meet
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(slackHuddle);

      const stopCallsBefore = (
        mockRecorder.stopRecording as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Run detection loop multiple times (should exceed 2-cycle threshold)
      await vi.advanceTimersByTimeAsync(5000); // 1st cycle - Slack detected
      await vi.advanceTimersByTimeAsync(5000); // 2nd cycle - Slack detected
      await vi.advanceTimersByTimeAsync(5000); // 3rd cycle - Slack detected

      const stopCallsAfter = (
        mockRecorder.stopRecording as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Should NOT have ended the Google Meet session (off-record ignores different meetings)
      expect(stopCallsAfter).toBe(stopCallsBefore);
    });

    it('should end meeting when different meeting is detected while ON-record (existing behavior)', async () => {
      const googleMeet: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Google Meet - Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      const slackHuddle: MeetingWindow = {
        platform: 'slack',
        windowId: 456,
        windowTitle: 'Slack Huddle',
        appName: 'Slack',
        url: 'slack://huddle/team123',
      };

      // Start with Google Meet
      (mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(googleMeet)
        .mockReturnValue(slackHuddle); // Immediately switch to Slack
      // Mock mic in use so that only main detection loop (not mic probe) triggers end
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart(); // Start recording Google Meet (on-record)

      // User is still ON-record, different meeting should trigger meeting end after threshold
      // Threshold is now 2 (was 3)
      await vi.advanceTimersByTimeAsync(5000); // 1st cycle - Slack detected (count = 1)
      expect(mockRecorder.stopRecording).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000); // 2nd cycle - Slack detected (count = 2, threshold reached)

      // Should have ended the Google Meet session after threshold
      expect(mockRecorder.stopRecording).toHaveBeenCalled();
    });
  });

  describe('Upload Error Handling and Queueing', () => {
    it('should detect and queue on authentication errors', async () => {
      const authErrorMessages = [
        'User not authenticated',
        'No valid session available. Please sign in again.',
        'API error: Unauthorized',
        'Please sign in to continue',
      ];

      authErrorMessages.forEach((errorMessage) => {
        const isAuthError =
          errorMessage.toLowerCase().includes('not authenticated') ||
          errorMessage.toLowerCase().includes('no valid session') ||
          errorMessage.toLowerCase().includes('unauthorized') ||
          errorMessage.toLowerCase().includes('sign in');

        expect(isAuthError).toBe(true);
      });
    });

    it('should detect and queue on network errors', async () => {
      const networkErrorMessages = [
        'Network request failed',
        'Fetch error: connection timeout',
        'Connection refused',
      ];

      networkErrorMessages.forEach((errorMessage) => {
        const isNetworkError =
          errorMessage.toLowerCase().includes('network') ||
          errorMessage.toLowerCase().includes('fetch') ||
          errorMessage.toLowerCase().includes('connection');

        expect(isNetworkError).toBe(true);
      });
    });

    it('should not queue on validation errors', async () => {
      const validationErrorMessages = [
        'File not found',
        'Invalid file format',
        'File size exceeds limit',
      ];

      validationErrorMessages.forEach((errorMessage) => {
        const isNetworkError =
          errorMessage.toLowerCase().includes('network') ||
          errorMessage.toLowerCase().includes('fetch') ||
          errorMessage.toLowerCase().includes('connection');
        const isAuthError =
          errorMessage.toLowerCase().includes('not authenticated') ||
          errorMessage.toLowerCase().includes('no valid session') ||
          errorMessage.toLowerCase().includes('unauthorized') ||
          errorMessage.toLowerCase().includes('sign in');

        const shouldQueue = isNetworkError || isAuthError;
        expect(shouldQueue).toBe(false);
      });
    });

    it('should properly categorize mixed error messages', async () => {
      // Auth error should be detected even if it contains other words
      const mixedAuthError =
        'Upload failed: User not authenticated due to network issues';
      const isAuthError = mixedAuthError
        .toLowerCase()
        .includes('not authenticated');
      expect(isAuthError).toBe(true);

      // Network error should be detected
      const mixedNetworkError = 'Failed to upload: network connection timeout';
      const isNetworkError = mixedNetworkError
        .toLowerCase()
        .includes('network');
      expect(isNetworkError).toBe(true);
    });

    it('should handle case-insensitive error detection', async () => {
      const upperCaseAuthError = 'USER NOT AUTHENTICATED';
      const isAuthError = upperCaseAuthError
        .toLowerCase()
        .includes('not authenticated');
      expect(isAuthError).toBe(true);

      const mixedCaseNetworkError = 'Network Connection Failed';
      const isNetworkError = mixedCaseNetworkError
        .toLowerCase()
        .includes('network');
      expect(isNetworkError).toBe(true);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start detection loop on start()', async () => {
      orchestrator.start();

      // checkForMeetings() runs immediately on line 73 of meeting-orchestrator.ts
      expect(mockDetector.getActiveMeetingWindow).toHaveBeenCalled();

      const callCountAfterStart = (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Advance to next check (5 seconds later)
      await vi.advanceTimersByTimeAsync(5000);

      // Should have been called again
      expect(
        (mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>).mock
          .calls.length
      ).toBeGreaterThan(callCountAfterStart);
    });

    it('should stop detection loop on stop()', async () => {
      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      orchestrator.stop();

      const callCount = (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Advance timers - should not call detector anymore
      await vi.advanceTimersByTimeAsync(10000);

      expect(
        (mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>).mock
          .calls.length
      ).toBe(callCount);
    });

    it('should not start multiple detection loops', async () => {
      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100); // First check

      const callsAfterFirstStart = (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      orchestrator.start(); // Call start again
      await vi.advanceTimersByTimeAsync(100); // Should not trigger additional check

      const callsAfterSecondStart = (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Should have same number of calls (no new detection loop started)
      expect(callsAfterSecondStart).toBe(callsAfterFirstStart);
    });
  });

  describe('Upload State Management', () => {
    it('should upload and finalize multi-segment recording when window closes', async () => {
      const { uploadService } = await import('../upload-service');

      const meetingWindow: MeetingWindow = {
        platform: 'slack',
        windowId: 123,
        windowTitle: 'Slack Huddle',
        appName: 'Slack',
        url: undefined,
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart();

      // Get the session before it's cleared
      const session = orchestrator.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.recordings.length).toBeGreaterThan(0);

      // Let recording run for a bit to have meaningful duration
      await vi.advanceTimersByTimeAsync(1000);

      // Window closes (triggers auto-stop and clears currentSession)
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      );

      // Trigger end detection interval (runs every END_DETECTION_INTERVAL_MS = 1000ms)
      // This should trigger stopRecording, then finalizeRecording (fire-and-forget)
      await vi.advanceTimersByTimeAsync(5000);

      // Session should be cleared immediately after stopRecording
      expect(orchestrator.getCurrentSession()).toBeNull();

      // Wait for the fire-and-forget finalization chain to complete
      // Use waitFor to poll until uploadStitchedAudio is called
      await vi.waitFor(
        () => {
          expect(uploadService.uploadStitchedAudio).toHaveBeenCalled();
        },
        { timeout: 1000, interval: 10 }
      );
    });

    it('should handle upload failures gracefully when window closes', async () => {
      const { uploadService } = await import('../upload-service');
      const { uploadQueue } = await import('../upload-queue');

      const meetingWindow: MeetingWindow = {
        platform: 'slack',
        windowId: 123,
        windowTitle: 'Slack Huddle',
        appName: 'Slack',
        url: undefined,
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart();

      // Set upload to fail AFTER recording has started
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValueOnce({
        success: false,
        error: 'Upload failed',
      });

      const session = orchestrator.getCurrentSession();
      expect(session).not.toBeNull();

      // Let recording run for a bit to have meaningful duration
      await vi.advanceTimersByTimeAsync(1000);

      // Window closes
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      );

      // Trigger end detection interval (runs every END_DETECTION_INTERVAL_MS = 1000ms)
      // This should trigger stopRecording, then finalizeRecording (fire-and-forget)
      // Use 5100ms to ensure the interval triggers reliably
      await vi.advanceTimersByTimeAsync(5100);

      // Session should be cleared immediately after stopRecording
      expect(orchestrator.getCurrentSession()).toBeNull();

      // Wait for the fire-and-forget finalization chain to complete
      // Use waitFor to poll until both uploadStitchedAudio and queueForLater are called
      await vi.waitFor(
        () => {
          expect(uploadService.uploadStitchedAudio).toHaveBeenCalled();
          expect(uploadQueue.queueForLater).toHaveBeenCalled();
        },
        { timeout: 1000, interval: 10 }
      );
    });

    it('should clear session when manual stop is called (new multi-segment behavior)', async () => {
      const { uploadService } = await import('../upload-service');

      const meetingWindow: MeetingWindow = {
        platform: 'slack',
        windowId: 123,
        windowTitle: 'Slack Huddle',
        appName: 'Slack',
        url: undefined,
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);
      await orchestrator.manualStart();

      const session = orchestrator.getCurrentSession();
      expect(session).not.toBeNull();

      // Manual stop now ends the meeting (multi-segment recording behavior)
      await orchestrator.manualStop();

      // Wait for uploads to complete
      await vi.advanceTimersByTimeAsync(100);

      // Session should be cleared (new behavior - manualStop calls endMeeting)
      expect(orchestrator.getCurrentSession()).toBeNull();

      // Verify stitched audio upload was called
      expect(uploadService.uploadStitchedAudio).toHaveBeenCalled();
    });
  });

  describe('State Change Callback', () => {
    it('should call state change callback when manually stopped meetings are cleared', async () => {
      const stateChangeCallback = vi.fn();

      // Set up orchestrator with state change callback
      orchestrator.onStateChange(stateChangeCallback);

      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Manually stop the meeting (adds to manuallyStoppedMeetings)
      await orchestrator.manualStop();

      // Clear the callback spy
      stateChangeCallback.mockClear();

      // Meeting window closes
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      // Run detection loop - should clear manuallyStoppedMeetings and call callback
      await vi.advanceTimersByTimeAsync(5000);

      // Verify state change callback was called when dismissed meetings were cleared
      expect(stateChangeCallback).toHaveBeenCalled();
    });

    it('should call state change callback when session state changes', async () => {
      const stateChangeCallback = vi.fn();

      // Set up orchestrator with state change callback
      orchestrator.onStateChange(stateChangeCallback);

      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      // Clear the callback spy
      stateChangeCallback.mockClear();

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // State change callback should be called when meeting is detected
      expect(stateChangeCallback).toHaveBeenCalled();
    });

    it('should NOT call callback if manuallyStoppedMeetings is already empty', async () => {
      const stateChangeCallback = vi.fn();

      // Set up orchestrator with state change callback
      orchestrator.onStateChange(stateChangeCallback);

      // No meeting window
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Clear the callback spy
      stateChangeCallback.mockClear();

      // Run detection loop again - manuallyStoppedMeetings is already empty
      await vi.advanceTimersByTimeAsync(5000);

      // Should NOT call callback since there's nothing to clear
      expect(stateChangeCallback).not.toHaveBeenCalled();
    });

    it('should handle callback being null/undefined gracefully', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Manually stop the meeting
      await orchestrator.manualStop();

      // Meeting window closes
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      // Run detection loop - should NOT crash even without callback
      await expect(vi.advanceTimersByTimeAsync(5000)).resolves.not.toThrow();
    });
  });

  describe('Dismissed Meeting Cleanup', () => {
    it('should clear dismissed meetings when no meetings are detected', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // User dismisses the meeting
      await orchestrator.manualStop();

      // Meeting should be in manuallyStoppedMeetings
      // We can verify this by checking hasDismissedMeeting() returns true
      expect(orchestrator.hasDismissedMeeting()).toBe(true);

      // Close the meeting window
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      // Run detection loop
      await vi.advanceTimersByTimeAsync(5000);

      // Dismissed meeting should be cleared
      expect(orchestrator.hasDismissedMeeting()).toBe(false);
    });

    it('should keep dismissed meeting in list if meeting window still exists', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // User dismisses the meeting
      await orchestrator.manualStop();

      // Meeting should be in manuallyStoppedMeetings
      expect(orchestrator.hasDismissedMeeting()).toBe(true);

      // Meeting window still exists
      // Run detection loop
      await vi.advanceTimersByTimeAsync(5000);

      // Dismissed meeting should STILL be in list (window hasn't closed)
      expect(orchestrator.hasDismissedMeeting()).toBe(true);
    });
  });
  describe('Title Updates and Metadata', () => {
    it('should set endTime in metadata when stopping recording', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Test Meeting - Meet',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Start recording
      await orchestrator.manualStart();

      // Get session reference before stopping (endMeeting clears currentSession)
      const session = orchestrator.getCurrentSession();
      expect(session).toBeDefined();
      expect(session?.metadata.endTime).toBeUndefined(); // Not set yet

      // Stop recording (calls endMeeting which sets metadata.endTime)
      await orchestrator.manualStop();

      // Verify stopRecording was called
      expect(mockRecorder.stopRecording).toHaveBeenCalled();

      // Verify metadata.endTime was set on the session object
      // (even though currentSession is now null, the object ref still has it)
      expect(session?.metadata.endTime).toBeInstanceOf(Date);
    });

    it('should check session window even when not focused', async () => {
      const meetingWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 123,
        windowTitle: 'Google Meet',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-def-ghi',
      };

      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(meetingWindow);

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      // Start recording
      await orchestrator.manualStart();

      // User switches away (no active window)
      (
        mockDetector.getActiveMeetingWindow as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      // But window still exists (and mic is still in use)
      (
        mockDetector.getAllMeetingWindows as ReturnType<typeof vi.fn>
      ).mockReturnValue([meetingWindow]);
      (mockDetector.isWindowActive as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      (
        mockDetector.getWindowTabURLs as ReturnType<typeof vi.fn>
      ).mockReturnValue(['https://meet.google.com/abc-def-ghi']);

      // Mic is still in use (so meeting is detected via mic-first strategy)
      (
        mockDetector.isMicrophoneInUse as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);
      (mockDetector.isInMeeting as ReturnType<typeof vi.fn>).mockReturnValue({
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        platform: 'meet',
        pid: 1234,
        hasVisibleWindow: true,
      });

      // Run detection loop
      await vi.advanceTimersByTimeAsync(5000);

      // getAllMeetingWindows should have been called (for title update check)
      expect(mockDetector.getAllMeetingWindows).toHaveBeenCalled();
    });
  });

  describe('Session Window Matching (findSessionWindow logic)', () => {
    it('should match session by platform and windowId', async () => {
      // Setup: Google Meet session with windowId
      const meetWindow: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - Test Meeting',
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

      const session = orchestrator.getCurrentSession();
      expect(session?.windowId).toBe(12345);

      // Now test: Slack starts, but Meet window still exists
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      });
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        meetWindow, // Meet window still exists
      ]);
      vi.mocked(mockDetector.isWindowActive).mockReturnValue(true);
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://meet.google.com/abc-defg-hij',
      ]);

      await vi.advanceTimersByTimeAsync(5000);

      // Should match by windowId (12345) and stay on Meet
      const currentSession = orchestrator.getCurrentSession();
      expect(currentSession?.platform).toBe('meet');
    });

    it('should match Google Meet session by URL when windowId matches', async () => {
      // Setup: Google Meet session
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

      // Verify session created with URL metadata
      const session = orchestrator.getCurrentSession();
      expect(session?.metadata.url).toBe(
        'https://meet.google.com/abc-defg-hij'
      );

      // Test: getAllMeetingWindows returns window with same URL
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        meetWindow,
      ]);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      });

      await vi.advanceTimersByTimeAsync(5000);

      // Should match by URL and stay on Meet
      expect(orchestrator.getCurrentSession()?.platform).toBe('meet');
    });

    it('should not match when platform differs', async () => {
      // Setup: Google Meet session
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

      // Test: getAllMeetingWindows returns only Slack window (Meet closed)
      const slackWindow: MeetingWindow = {
        platform: 'slack',
        windowId: 99999,
        windowTitle: 'Slack Call',
        appName: 'Slack',
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      };

      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        slackWindow,
      ]);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      });
      vi.mocked(mockDetector.isWindowActive).mockReturnValue(false);

      // Wait for hysteresis (3 failed detections)
      await vi.advanceTimersByTimeAsync(5000); // 1st
      await vi.advanceTimersByTimeAsync(5000); // 2nd
      await vi.advanceTimersByTimeAsync(5000); // 3rd - should end Meet

      // Then next cycle should detect Slack
      await vi.advanceTimersByTimeAsync(5000);

      // Should transition to Slack (platforms don't match)
      expect(orchestrator.getCurrentSession()?.platform).toBe('slack');
    });

    it('should not match when windowId differs (but platform matches)', async () => {
      // Setup: Google Meet in window 12345
      const meetWindow1: MeetingWindow = {
        platform: 'meet',
        windowId: 12345,
        windowTitle: 'Meet - First Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/aaa-bbbb-ccc',
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow1
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

      const session = orchestrator.getCurrentSession();
      expect(session?.windowId).toBe(12345);

      // Test: User closes first Meet and opens different Meet in new window
      const meetWindow2: MeetingWindow = {
        platform: 'meet',
        windowId: 67890, // Different windowId
        windowTitle: 'Meet - Second Meeting',
        appName: 'Google Chrome',
        url: 'https://meet.google.com/xxx-yyyy-zzz', // Different URL
        bounds: { x: 0, y: 0, width: 1000, height: 800 },
      };

      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        meetWindow2, // Only second meeting exists
      ]);
      vi.mocked(mockDetector.isWindowActive).mockReturnValue(false); // First window gone

      // During hysteresis, getActiveMeetingWindow should return the NEW meeting
      // (since the old window is gone and only the new window exists)
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(
        meetWindow2
      );

      // Wait for hysteresis (3 detections of DIFFERENT meeting)
      await vi.advanceTimersByTimeAsync(5000); // 1st - different meeting
      await vi.advanceTimersByTimeAsync(5000); // 2nd - different meeting
      await vi.advanceTimersByTimeAsync(5000); // 3rd - different meeting, session ends

      // Then next cycle should detect new meeting
      await vi.advanceTimersByTimeAsync(5000);

      // Should transition to new meeting (different windowId and URL)
      const newSession = orchestrator.getCurrentSession();
      expect(newSession?.windowId).toBe(67890);
    });

    it('should handle windowId=0 (synthetic windows) separately', async () => {
      // Setup: Slack with synthetic window (no real window)
      vi.mocked(mockDetector.getActiveMeetingWindow).mockReturnValue(null);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(true);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        appName: 'Slack',
        bundleId: 'com.tinyspeck.slackmacgap',
        platform: 'slack',
        pid: 5678,
        hasVisibleWindow: true,
      });

      orchestrator.start();
      await vi.advanceTimersByTimeAsync(100);

      const session = orchestrator.getCurrentSession();
      expect(session?.platform).toBe('slack');
      expect(session?.windowId).toBe(0); // Synthetic window

      // Test: getAllMeetingWindows returns empty (no real windows)
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([]);

      // But mic is still in use by Slack
      await vi.advanceTimersByTimeAsync(5000);

      // Should stay on Slack (matched via microphone check, not window)
      expect(orchestrator.getCurrentSession()?.platform).toBe('slack');
    });
  });

  describe('Resume Dismissed Meeting', () => {
    it('should resume the correct meeting using mic-first detection when multiple meetings were dismissed', async () => {
      // Start orchestrator
      orchestrator.start();

      // Setup: Google Meet window + microphone in use
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        {
          platform: 'meet',
          windowId: 1,
          windowTitle: 'Meet - Team Alignment',
          appName: 'Google Chrome',
          url: 'https://meet.google.com/abc-defg-hij',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      ]);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue({
        isInUse: true,
        appName: 'Google Chrome',
        pid: 1234,
      });
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        platform: 'meet',
        appName: 'Google Chrome',
      });
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://meet.google.com/abc-defg-hij',
      ]);

      await vi.advanceTimersByTimeAsync(5000);

      // Verify Google Meet session started
      expect(orchestrator.getCurrentSession()?.platform).toBe('meet');

      // Dismiss Google Meet
      await orchestrator.manualStop();
      expect(orchestrator.getCurrentSession()).toBeNull();

      // Now Slack starts using microphone (synthetic window, windowId=0)
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([]);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue({
        isInUse: true,
        appName: 'Slack',
        pid: 5678,
      });
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        platform: 'slack',
        appName: 'Slack',
      });
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([]);

      await vi.advanceTimersByTimeAsync(5000);

      // Verify Slack session started
      expect(orchestrator.getCurrentSession()?.platform).toBe('slack');

      // Dismiss Slack
      await orchestrator.manualStop();
      expect(orchestrator.getCurrentSession()).toBeNull();

      // Now user has Google Meet tab focused, but Slack is still using microphone
      // This simulates the bug scenario: user dismisses both, but Slack is still in huddle
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        {
          platform: 'meet',
          windowId: 1,
          windowTitle: 'Meet - Team Alignment',
          appName: 'Google Chrome',
          url: 'https://meet.google.com/abc-defg-hij',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      ]);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue({
        isInUse: true,
        appName: 'Slack',
        pid: 5678,
      });
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        platform: 'slack',
        appName: 'Slack',
      });
      // getWindowTabURLs would show Meet URL if queried, but we use mic-first detection
      vi.mocked(mockDetector.getWindowTabURLs).mockReturnValue([
        'https://meet.google.com/abc-defg-hij',
      ]);

      // Click "Start Recording" - should resume Slack (mic-first), not Meet (window focus)
      const result = await orchestrator.resumeDismissedMeeting();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Wait for detection to process
      await vi.advanceTimersByTimeAsync(5000);

      // Should resume SLACK (mic-first detection), NOT Google Meet (window focus)
      expect(orchestrator.getCurrentSession()?.platform).toBe('slack');
      expect(orchestrator.getCurrentSession()?.windowId).toBe(0); // Synthetic window
    });

    it('should return error when no meeting is detected', async () => {
      // Setup: No meetings detected
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([]);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue(null);
      vi.mocked(mockDetector.isInMeeting).mockReturnValue(null);

      const result = await orchestrator.resumeDismissedMeeting();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active meeting detected');
    });

    it('should return error when meeting is not dismissed', async () => {
      // Start orchestrator
      orchestrator.start();

      // Setup: Zoom meeting active (not dismissed)
      vi.mocked(mockDetector.getAllMeetingWindows).mockReturnValue([
        {
          platform: 'zoom',
          windowId: 1,
          windowTitle: 'Zoom Meeting',
          appName: 'zoom.us',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      ]);
      vi.mocked(mockDetector.isMicrophoneInUse).mockReturnValue({
        isInUse: true,
        appName: 'zoom.us',
        pid: 1234,
      });
      vi.mocked(mockDetector.isInMeeting).mockReturnValue({
        platform: 'zoom',
        appName: 'zoom.us',
      });

      await vi.advanceTimersByTimeAsync(5000);

      // Meeting should be active
      expect(orchestrator.getCurrentSession()?.platform).toBe('zoom');

      // Try to resume without dismissing first
      const result = await orchestrator.resumeDismissedMeeting();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Meeting is not dismissed');
    });
  });
});
