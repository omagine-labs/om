import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { MeetingWindow } from '../types/electron';
import {
  extractMeetingMetadata,
  type MeetingMetadata,
} from '../lib/meeting-metadata';
import { WindowDetector } from '../native-window-detector';
import { NativeRecorder } from '../native-recorder';
import { uploadService } from './upload-service';
import { uploadQueue } from './upload-queue';
import { getRecordingControlBar } from './recording-control-bar';
import { MeetingDetector } from './meeting-detector';
import { NotificationManager } from './notification-manager';
import { authService } from '../lib/auth';
import {
  MeetingDetectionService,
  type DetectedMeeting,
} from './meeting-detection-service';
import { addBreadcrumb } from '../lib/sentry';

/**
 * Recording configuration constants
 */
const MAX_RECORDING_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const DETECTION_INTERVAL_MS = 5000; // 5 seconds
const END_DETECTION_INTERVAL_MS = 2000; // 2 seconds (4s total with 2 consecutive checks)

/**
 * Mic probe feature flag - temporarily disabled due to unreliable WebRTC detection
 * macOS CoreAudio API doesn't reliably report Chrome/WebRTC mic usage
 * Set to false to re-enable mic probe for meeting end detection
 */
const DISABLE_MIC_PROBE = true;

/**
 * Recording state machine
 */
export enum RecordingState {
  IDLE = 'idle',
  MEETING_DETECTED = 'detected',
  RECORDING = 'recording',
  STOPPING = 'stopping',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

/**
 * Recording segment for multi-segment sessions
 */
export interface RecordingSegment {
  segmentId: string; // UUID
  segmentNumber: number; // 1, 2, 3...
  startTime: Date;
  endTime?: Date;
  filePath?: string;
  uploadJobId?: string; // Track backend processing job
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
  recordType: 'on-record' | 'off-record';
  fileSizeMB?: number;
  durationSeconds?: number;
}

/**
 * Meeting session tracking
 */
export interface MeetingSession {
  sessionId: string;
  platform: 'zoom' | 'meet' | 'teams' | 'slack' | 'manual';
  windowId: number;
  windowTitle: string;
  startTime: Date;
  endTime?: Date;
  recordingPath?: string; // Legacy - for single recordings
  recordings: RecordingSegment[]; // New - for multi-segment recordings
  activeRecordingIndex?: number; // Which segment is currently recording
  isOnRecord: boolean; // Current toggle state (true = recording on-record content)
  meetingId?: string; // Backend meeting ID (returned from first segment upload)
  state: RecordingState;
  metadata: MeetingMetadata;
  error?: string;
}

/**
 * MeetingOrchestrator - Coordinates meeting detection and automatic recording
 */
export class MeetingOrchestrator {
  private detector: WindowDetector;
  private recorder: NativeRecorder;
  private meetingDetector: MeetingDetector;
  private detectionService: MeetingDetectionService;
  private notificationManager: NotificationManager;
  private detectionInterval: NodeJS.Timeout | null = null;
  private endDetectionInterval: NodeJS.Timeout | null = null;
  private currentSession: MeetingSession | null = null;
  private stopScheduled: boolean = false;
  private isProcessingTransition: boolean = false;
  private isProcessingUserAction: boolean = false; // Lock during manual start/stop
  private missedDetectionCount: number = 0; // Hysteresis counter for detection failures
  private readonly MISSED_DETECTION_THRESHOLD = 2; // Wait 2 cycles (10s) before ending
  private missedEndDetectionCount: number = 0; // Hysteresis counter for end detection failures
  private readonly MISSED_END_DETECTION_THRESHOLD = 2; // Wait 2 cycles (2s) before stopping
  private onStateChangeCallback: (() => void) | null = null;
  private manuallyStoppedMeetings: Set<string> = new Set(); // Meetings user manually stopped

  constructor(detector: WindowDetector, recorder: NativeRecorder) {
    this.detector = detector;
    this.recorder = recorder;
    this.meetingDetector = new MeetingDetector(detector);
    this.detectionService = new MeetingDetectionService(detector);
    this.notificationManager = new NotificationManager();
  }

  /**
   * Register callback for state changes (for menu bar updates)
   */
  onStateChange(callback: () => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Notify listeners of state change
   */
  private notifyStateChange(): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  /**
   * Show processing message in control bar with appropriate text based on auth status
   * If authenticated: "Processing your meeting..."
   * If not authenticated: "Meeting queued - sign in to upload"
   */
  private async showProcessingMessage(): Promise<void> {
    const controlBar = getRecordingControlBar();

    // Check if user is authenticated
    const user = authService.getUser();

    if (user) {
      controlBar.showProcessing('Processing your meeting...');
    } else {
      controlBar.showProcessing('Meeting queued - sign in to upload');
    }

    // Schedule auto-close after 3 seconds
    controlBar.scheduleAutoClose(3000);
  }

  /**
   * Check if a meeting title is generic (needs to be replaced with specific title)
   * Generic titles include "Google Meet" or "Google Meet (xyz-abc-def)"
   */
  private isGenericMeetingTitle(title: string): boolean {
    return title === 'Google Meet' || title.startsWith('Google Meet (');
  }

  /**
   * Check if a meeting title is specific (has actual meeting name)
   * A specific title is any title that is not generic
   */
  private isSpecificMeetingTitle(title: string): boolean {
    return !this.isGenericMeetingTitle(title);
  }

  /**
   * Start the orchestrator (begins polling for meetings)
   */
  start(): void {
    if (this.detectionInterval) {
      console.log('[MeetingOrchestrator] Already started');
      return;
    }

    console.log('[MeetingOrchestrator] Starting detection loop (5s interval)');
    this.detectionInterval = setInterval(() => {
      void this.checkForMeetings();
    }, DETECTION_INTERVAL_MS);

    // Run immediately
    void this.checkForMeetings();
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    console.log('[MeetingOrchestrator] Stopping');
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    if (this.endDetectionInterval) {
      clearInterval(this.endDetectionInterval);
      this.endDetectionInterval = null;
    }
    // Reset hysteresis counters
    this.missedDetectionCount = 0;
    this.missedEndDetectionCount = 0;
  }

  /**
   * Main detection loop - checks for meetings every 5 seconds
   *
   * REFACTORED: Now uses MeetingDetectionService for clean hybrid detection
   * Dispatches to focused handler methods instead of nested if-else
   */
  private async checkForMeetings(): Promise<void> {
    try {
      // Skip if currently processing a transition or user action
      // This prevents race conditions between detection loop and user clicks
      if (this.isProcessingTransition || this.isProcessingUserAction) {
        return;
      }

      // Skip detection for manual recordings - they don't need polling
      // Manual recordings are controlled entirely by user actions (start/stop)
      if (this.currentSession?.platform === 'manual') {
        return;
      }

      // Detect meeting using hybrid detection service
      const detectedMeeting = this.detectionService.detectMeeting();

      // Dispatch to appropriate handler
      if (detectedMeeting && !this.currentSession) {
        this.missedDetectionCount = 0; // Reset counter on successful detection
        await this.handleNewMeeting(detectedMeeting);
      } else if (detectedMeeting && this.currentSession) {
        // Only reset counter if it's the SAME meeting
        // If it's a different meeting, increment counter (treat as "miss" for current session)
        const isSameMeeting = this.isSameMeetingAsSession(
          detectedMeeting,
          this.currentSession
        );
        if (isSameMeeting) {
          this.missedDetectionCount = 0; // Reset counter for same meeting
        } else {
          // Different meeting detected
          // If user is off-record, ignore the different meeting (they may be attending another call)
          if (!this.currentSession.isOnRecord) {
            console.log(
              '[MeetingOrchestrator] Different meeting detected but user is off-record, ignoring'
            );
            this.missedDetectionCount = 0; // Reset counter to prevent ending session
          } else {
            // On-record: Treat different meeting as miss for current session
            this.missedDetectionCount++;
            console.log(
              `[MeetingOrchestrator] Different meeting detected (${this.missedDetectionCount}/${this.MISSED_DETECTION_THRESHOLD})`
            );

            if (this.missedDetectionCount >= this.MISSED_DETECTION_THRESHOLD) {
              console.log(
                '[MeetingOrchestrator] Threshold reached, ending current meeting'
              );
              this.missedDetectionCount = 0;
              await this.handleMeetingEnded();
              // After ending current session, check for new meeting in next cycle
              return;
            }
          }
        }
        await this.handleExistingMeeting(detectedMeeting);
      } else if (!detectedMeeting && this.currentSession) {
        // Meeting not detected - use hysteresis to prevent false ends
        // (e.g., window focus changes, brief mic pauses, notification popups)
        // Note: For non-recording state, we rely on window detection only.
        // The mic check (isMicrophoneInUse) doesn't reliably detect Chrome/WebRTC mic usage.
        // For recording state, the mic probe (pause Om's capture, check if mic still in use) works
        // because Om has an active mic session.
        console.log(
          `[MeetingOrchestrator] Meeting not detected (${this.missedDetectionCount + 1}/${this.MISSED_DETECTION_THRESHOLD})`
        );
        this.missedDetectionCount++;

        if (this.missedDetectionCount >= this.MISSED_DETECTION_THRESHOLD) {
          console.log(
            '[MeetingOrchestrator] Threshold reached, ending meeting'
          );
          this.missedDetectionCount = 0;
          await this.handleMeetingEnded();
        }
        // else: Keep session alive, wait for next detection cycle
      } else {
        this.missedDetectionCount = 0; // Reset counter
        this.handleNoMeeting();
      }
    } catch (error) {
      console.error('[MeetingOrchestrator] Error in detection loop:', error);
    }
  }

  /**
   * Handle new meeting detection (no current session)
   */
  private async handleNewMeeting(meeting: DetectedMeeting): Promise<void> {
    // Check if user manually dismissed this meeting
    const meetingId = this.getMeetingIdFromDetected(meeting);
    if (this.manuallyStoppedMeetings.has(meetingId)) {
      console.log(
        '[handleNewMeeting] Meeting blocked by manuallyStoppedMeetings (primary check):',
        meetingId
      );
      return; // User doesn't want to record this meeting
    }

    // Secondary check: try to match by meeting code directly from URL
    // This handles cases where native detection returns URL but ID format differs
    if (meeting.url && meeting.platform === 'meet') {
      const codeMatch = meeting.url.match(/meet\.google\.com\/([a-z-]{3,})/);
      if (codeMatch?.[1]) {
        const codeId = `meet:${codeMatch[1]}`;
        if (this.manuallyStoppedMeetings.has(codeId)) {
          console.log(
            '[handleNewMeeting] Meeting blocked by manuallyStoppedMeetings (code check):',
            codeId
          );
          return; // User doesn't want to record this meeting
        }
      }
    }

    // Convert DetectedMeeting to MeetingWindow for legacy code
    const window = this.convertToMeetingWindow(meeting);

    // Create new session
    await this.handleMeetingDetected(window);
  }

  /**
   * Handle meeting detection when session already exists
   */
  private async handleExistingMeeting(
    detected: DetectedMeeting
  ): Promise<void> {
    // Manual recordings take precedence
    if (this.currentSession!.platform === 'manual') {
      return;
    }

    // Check if it's the same meeting or a different one
    if (this.isSameMeetingAsSession(detected, this.currentSession!)) {
      await this.handleSameMeeting(detected);
    } else {
      // Different meeting detected
      // "First meeting wins" logic:
      // - Always stick with the first detected meeting
      // - Ignore any new meetings while a session is active
      // - Only the hysteresis logic (3 missed detections) should end a session
      console.log(
        `[MeetingOrchestrator] Ignoring new ${detected.platform} meeting - first meeting (${this.currentSession!.platform}) wins`
      );
      // Do nothing - keep current session
    }
  }

  /**
   * Handle same meeting (update title)
   */
  private async handleSameMeeting(detected: DetectedMeeting): Promise<void> {
    const session = this.currentSession!;

    // Update title if it improved (e.g., Google Meet loaded full title)
    if (detected.detectionMethod === 'window') {
      const window = this.convertToMeetingWindow(detected);
      this.updateMeetingTitleIfBetter(window, session);
    } else if (
      detected.detectionMethod === 'microphone' &&
      session.platform === 'meet'
    ) {
      // For browser meetings detected via mic, check if window still exists
      // and update title if it's improved (e.g., user switched tabs but meeting still open)
      this.checkSessionWindowForTitleUpdate(session);
    }
  }

  /**
   * Transition from current meeting to a new one
   */
  private async transitionToMeeting(
    newMeeting: DetectedMeeting
  ): Promise<void> {
    this.isProcessingTransition = true;
    const session = this.currentSession!;

    console.log(
      '[MeetingOrchestrator] Transitioning from',
      session.platform,
      'to',
      newMeeting.platform
    );

    try {
      if (session.state === RecordingState.RECORDING) {
        // Stop recording, show processing, then transition
        await this.stopRecording(session, 'window_closed');
        setTimeout(async () => {
          try {
            const window = this.convertToMeetingWindow(newMeeting);
            await this.handleMeetingDetected(window);
          } catch (error) {
            console.error(
              '[MeetingOrchestrator] Error in delayed transition:',
              error
            );
          } finally {
            // Always release lock, even if transition fails
            this.isProcessingTransition = false;
          }
        }, 1000);
      } else {
        // Just detected, not recording - immediate transition
        try {
          const controlBar = getRecordingControlBar();
          controlBar.close();
          this.currentSession = null;

          const window = this.convertToMeetingWindow(newMeeting);
          await this.handleMeetingDetected(window);
        } finally {
          // Always release lock, even if transition fails
          this.isProcessingTransition = false;
        }
      }
    } catch (error) {
      console.error('[MeetingOrchestrator] Transition error:', error);
      this.isProcessingTransition = false;
    }
  }

  /**
   * Handle meeting ended (no meeting detected, but have session)
   */
  private async handleMeetingEnded(): Promise<void> {
    const session = this.currentSession!;

    // Manual recordings don't auto-end
    if (session.platform === 'manual') {
      return;
    }

    console.log('[MeetingOrchestrator] Meeting ended - no meeting detected');

    // For browser meetings, double-check if tab still exists
    if (session.platform === 'meet' && session.windowId > 0) {
      if (this.isMeetingTabStillOpen(session)) {
        // Tab still exists, user on different tab - check for title updates
        if (!this.isProcessingTransition) {
          this.checkSessionWindowForTitleUpdate(session);
        }
        return;
      }
    }

    // Meeting truly ended - handle based on current state
    if (
      session.state === RecordingState.MEETING_DETECTED ||
      session.state === RecordingState.UPLOADING ||
      session.state === RecordingState.PROCESSING
    ) {
      // Not recording - just close control bar
      this.currentSession = null;
      const controlBar = getRecordingControlBar();
      controlBar.close();
      this.notifyStateChange();
    } else if (
      session.state === RecordingState.RECORDING &&
      !this.stopScheduled
    ) {
      // Recording in progress - stop it immediately
      console.log(
        '[MeetingOrchestrator] Recording in progress, stopping immediately'
      );
      this.stopScheduled = true;
      await this.stopRecording(session, 'window_closed');
    }
  }

  /**
   * Handle no meeting and no session (cleanup)
   */
  private handleNoMeeting(): void {
    // Only clear dismissed meetings if there are truly no meeting windows open
    // We use window detection (not mic detection) since mic detection can be flaky
    // This prevents re-detecting a meeting the user manually ended while the tab is still open
    if (this.manuallyStoppedMeetings.size > 0) {
      const allWindows = this.detector.getAllMeetingWindows();
      if (allWindows.length === 0) {
        this.manuallyStoppedMeetings.clear();
        this.onStateChangeCallback?.();
      }
    }
  }

  /**
   * Check if same meeting as current session
   */
  private isSameMeetingAsSession(
    detected: DetectedMeeting,
    session: MeetingSession
  ): boolean {
    // Convert session to DetectedMeeting format for comparison
    const sessionAsDetected: DetectedMeeting = {
      platform: session.platform,
      windowId: session.windowId,
      windowTitle: session.windowTitle,
      appName: session.metadata.appName || '',
      url: session.metadata.url,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      detectionMethod: session.windowId === 0 ? 'microphone' : 'window',
    };

    // Use detection service's comparison logic
    return this.detectionService.isSameMeeting(detected, sessionAsDetected);
  }

  /**
   * Find a window that matches the current session
   *
   * Matches by:
   * - Platform and windowId (for meetings with real windows)
   * - URL (for browser meetings like Google Meet)
   *
   * @param windows - Array of meeting windows to search
   * @param session - Current meeting session to match against
   * @returns Matching window or undefined if not found
   */
  private findSessionWindow(
    windows: MeetingWindow[],
    session: MeetingSession
  ): MeetingWindow | undefined {
    return windows.find((window) => {
      // Match by platform and windowId
      const platformMatches = window.platform === session.platform;
      const windowIdMatches =
        session.windowId > 0 && window.windowId === session.windowId;

      // For browser meetings, also try matching by URL/meeting code
      let urlMatches = false;
      if (window.platform === 'meet' && window.url && session.metadata.url) {
        urlMatches = window.url === session.metadata.url;
      }

      return (platformMatches && windowIdMatches) || urlMatches;
    });
  }

  /**
   * Check if the current session's meeting is still detectable
   *
   * **Purpose**: Validate if a specific, already-detected meeting still exists.
   * This is different from initial meeting detection (which is mic-first).
   *
   * **Why Window-First?**
   * - We already know the windowId and platform from the session
   * - Checking getAllMeetingWindows() directly verifies that specific window exists
   * - Microphone only tells us "some meeting is happening", not "is it the same meeting"
   * - Window matching is more precise for validation than microphone detection
   *
   * **3-Tier Fallback Strategy:**
   *
   * **Strategy 1: Window Detection (Primary)**
   * - Checks if meeting window exists in getAllMeetingWindows()
   * - Works for both browser meetings (Google Meet) and app meetings (Slack, Zoom)
   * - Matches by platform + windowId OR URL for browser meetings
   * - Most direct way to verify a specific window still exists
   *
   * **Strategy 2: Tab Validation (Secondary)**
   * - For Google Meet with known windowId, validates specific tab still open
   * - Checks if browser window exists and contains the meeting URL
   * - Provides additional validation beyond window existence
   *
   * **Strategy 3: Microphone Check (Fallback)**
   * - For synthetic windows (windowId=0, mic-only detection)
   * - Verifies microphone still in use by same platform app
   * - Last resort for meetings detected without window info
   *
   * @returns true if the current session's meeting is still detectable, false otherwise
   */
  private isCurrentSessionMeetingStillDetectable(): boolean {
    if (!this.currentSession) return false;

    const session = this.currentSession;

    // Strategy 1: Check if meeting still exists via window detection
    // This works for both browser meetings and app meetings
    try {
      const allWindows = this.detector.getAllMeetingWindows();
      const sessionWindow = this.findSessionWindow(allWindows, session);

      if (sessionWindow) {
        return true;
      }
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error checking getAllMeetingWindows:',
        error
      );
    }

    // Strategy 2: For browser meetings with known windowId, check if tab still open
    if (session.platform === 'meet' && session.windowId > 0) {
      return this.isMeetingTabStillOpen(session);
    }

    // Strategy 3: For synthetic windows (windowId=0), check via microphone
    // This is last resort for meetings that were detected via mic only
    if (session.windowId === 0) {
      const micInfo = this.detector.isMicrophoneInUse();
      if (!micInfo) return false;

      const meetingInfo = this.detector.isInMeeting();
      if (!meetingInfo) return false;

      // Check if the app using mic matches our session's platform
      return meetingInfo.platform === session.platform;
    }

    return false;
  }

  /**
   * Check if Google Meet tab is still open
   */
  private isMeetingTabStillOpen(session: MeetingSession): boolean {
    const windowExists = this.meetingDetector.isWindowActive(session.windowId);
    if (!windowExists) return false;

    const tabURLs = this.meetingDetector.getWindowTabURLs(session.windowId);
    const meetingCode = session.metadata.meetingCode;

    if (!meetingCode) return false;

    return tabURLs.some((url) => {
      try {
        const urlObj = new URL(url);
        return (
          urlObj.hostname === 'meet.google.com' &&
          urlObj.pathname.includes(`/${meetingCode}`)
        );
      } catch {
        return false;
      }
    });
  }

  /**
   * Convert DetectedMeeting to MeetingWindow (for legacy code compatibility)
   */
  private convertToMeetingWindow(detected: DetectedMeeting): MeetingWindow {
    return {
      platform: detected.platform,
      windowId: detected.windowId,
      windowTitle: detected.windowTitle,
      appName: detected.appName,
      url: detected.url,
      bounds: detected.bounds,
    };
  }

  /**
   * Get meeting ID from detected meeting
   */
  private getMeetingIdFromDetected(detected: DetectedMeeting): string {
    const window = this.convertToMeetingWindow(detected);
    return this.meetingDetector.getMeetingId(window);
  }

  /**
   * Check if session's window still exists (even if not focused) and update title
   * This ensures we update titles even when user has switched away from the meeting tab
   */
  private checkSessionWindowForTitleUpdate(session: MeetingSession): void {
    try {
      // Get all meeting windows (not just the active one)
      const allWindows = this.detector.getAllMeetingWindows();

      // Find the window that matches our session by meeting code
      let sessionWindow = allWindows.find((window) =>
        this.meetingDetector.isSameMeeting(window, session)
      );

      // Fallback: If no match found but there's a window with same platform, use it
      // This handles cases where meeting code matching fails (URL missing, code extraction fails)
      if (!sessionWindow && session.platform === 'meet') {
        sessionWindow = allWindows.find((window) => window.platform === 'meet');
        if (sessionWindow) {
          console.log(
            '[MeetingOrchestrator] Using fallback window match by platform'
          );
        }
      }

      if (sessionWindow) {
        // Found the session's window - update title if better
        this.updateMeetingTitleIfBetter(sessionWindow, session);
      }
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error checking session window:',
        error
      );
    }
  }

  /**
   * Update meeting title if the new title is more specific than the current one
   * This handles cases where Google Meet loads the title after the page is opened
   */
  private updateMeetingTitleIfBetter(
    window: MeetingWindow,
    session: MeetingSession
  ): void {
    const currentTitle = session.metadata.title;
    const newMetadata = extractMeetingMetadata(window, session.startTime);
    const newTitle = newMetadata.title;

    // Check if we should update the title (new title is more specific)
    const isCurrentGeneric = this.isGenericMeetingTitle(currentTitle);
    const isNewMoreSpecific = this.isSpecificMeetingTitle(newTitle);

    if (isCurrentGeneric && isNewMoreSpecific && currentTitle !== newTitle) {
      console.log('[MeetingOrchestrator] Updating meeting title:', {
        from: currentTitle,
        to: newTitle,
      });

      // Update session metadata
      session.metadata.title = newTitle;
      session.metadata.windowTitle = window.windowTitle;
      session.windowTitle = window.windowTitle;

      // Update control bar to show the new title
      const controlBar = getRecordingControlBar();
      controlBar.updateTitle(newTitle);
    }
  }

  /**
   * Handle new meeting detection
   */
  private async handleMeetingDetected(window: MeetingWindow): Promise<void> {
    // Security: Never log window.url directly - it may contain tokens in query params
    console.log('[MeetingOrchestrator] Meeting detected:', window.windowTitle);
    addBreadcrumb('meeting', 'Meeting detected', {
      platform: window.platform,
      windowTitle: window.windowTitle,
    });

    const metadata = extractMeetingMetadata(window);
    const session: MeetingSession = {
      sessionId: randomUUID(),
      platform: window.platform,
      windowId: window.windowId,
      windowTitle: window.windowTitle,
      startTime: new Date(),
      state: RecordingState.MEETING_DETECTED,
      metadata,
      recordings: [], // Initialize empty segments array
      isOnRecord: true, // Default to on-record when starting
    };

    this.currentSession = session;

    // Notify menu bar of state change
    this.notifyStateChange();

    // Hide dashboard if it's open
    this.hideDashboardWindow();

    // Show control bar when meeting is detected - user can manually start recording
    // Pass window bounds for multi-monitor positioning
    const controlBar = getRecordingControlBar();
    controlBar.show(
      metadata.title,
      session.state,
      window.bounds,
      window.windowId,
      window.appName,
      window.url
    );
  }

  /**
   * Hide the dashboard window if it's open
   */
  private hideDashboardWindow(): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows.find(
        (win) => !win.isDestroyed() && win.getTitle() !== 'Om Control Bar'
      );
      if (mainWindow && mainWindow.isVisible()) {
        console.log('[MeetingOrchestrator] Hiding dashboard window');
        mainWindow.hide();
      }
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error hiding dashboard window:',
        error
      );
    }
  }

  /**
   * Start recording for a session
   * Now uses segment-based recording
   */
  private async startRecording(session: MeetingSession): Promise<void> {
    console.log(
      '[MeetingOrchestrator] startRecording() called for session:',
      session.sessionId
    );
    addBreadcrumb('meeting', 'Recording started', {
      sessionId: session.sessionId,
      platform: session.platform,
    });
    try {
      // Hide dashboard if it's open
      this.hideDashboardWindow();

      // Start first segment as on-record
      await this.startSegment(session, 'on-record');
    } catch (error) {
      console.error('[MeetingOrchestrator] Error starting recording:', error);
      const errorMessage =
        error instanceof Error ? error : new Error(String(error));
      this.handleError(session, errorMessage);
    }
  }

  /**
   * Monitor for meeting end conditions
   *
   * This runs every 1 second during recording to check for:
   * 1. Meeting tab/window closure
   * 2. Max duration (2 hours)
   *
   * Uses hysteresis to prevent false positives from:
   * - Brief macOS window API glitches during tab switches
   * - Temporary window focus changes
   * - Animation/transition states
   */
  // Counter for mic probe misses (mic not in use by external apps)
  private micProbeMissCount = 0;
  private readonly MIC_PROBE_MISS_THRESHOLD = 3; // 3 consecutive misses = meeting ended (6s with 2s interval)
  private readonly MIC_PROBE_PAUSE_MS = 50; // Pause duration in ms - increased for CoreAudio reliability

  private startEndDetection(session: MeetingSession): void {
    if (this.endDetectionInterval) {
      clearInterval(this.endDetectionInterval);
    }

    // Reset end detection counters when starting
    this.missedEndDetectionCount = 0;
    this.micProbeMissCount = 0;

    this.endDetectionInterval = setInterval(() => {
      // Only run detection if still recording (not if manually stopped and back in detected state)
      if (session.state !== RecordingState.RECORDING) {
        return;
      }

      // Check if the meeting is still active
      // Skip this check for screen recordings (windowId = 0), as we're recording the entire screen
      const isScreenRecording = session.windowId === 0;

      if (!isScreenRecording) {
        // Check if the browser window still exists (not if meeting changed)
        // End detection only cares about window closure, not meeting transitions
        // Meeting transitions are handled by the main detection loop
        const windowExists = this.meetingDetector.isWindowActive(
          session.windowId
        );

        if (!windowExists) {
          this.missedEndDetectionCount++;
          console.log(
            `[MeetingOrchestrator] Window not active in end detection (${this.missedEndDetectionCount}/${this.MISSED_END_DETECTION_THRESHOLD})`
          );

          if (
            this.missedEndDetectionCount >=
              this.MISSED_END_DETECTION_THRESHOLD &&
            !this.stopScheduled
          ) {
            console.log(
              '[MeetingOrchestrator] End detection threshold reached, window closed'
            );
            this.missedEndDetectionCount = 0;
            this.stopScheduled = true;
            void this.stopRecording(session, 'window_closed');
            if (this.endDetectionInterval) {
              clearInterval(this.endDetectionInterval);
              this.endDetectionInterval = null;
            }
            return;
          }
        } else {
          // Window still active - reset counter
          this.missedEndDetectionCount = 0;
        }
      }

      // Mic probe: Check if meeting app released the mic
      // This detects when user hangs up but tab stays open (e.g., Google Meet)
      // Run for ALL meetings including windowId=0 (mic-detected meetings)
      // Skip for manual recordings - no meeting app is using the mic
      // Skip if mic probe is disabled (see DISABLE_MIC_PROBE flag)
      if (session.platform !== 'manual' && !DISABLE_MIC_PROBE) {
        void this.runMicProbe(session);
      }

      // Check max duration (2 hours)
      const duration = Date.now() - session.startTime.getTime();
      if (duration > MAX_RECORDING_DURATION_MS) {
        console.log('[MeetingOrchestrator] Max duration reached (2 hours)');
        void this.stopRecording(session, 'max_duration');
        if (this.endDetectionInterval) {
          clearInterval(this.endDetectionInterval);
          this.endDetectionInterval = null;
        }
      }
    }, END_DETECTION_INTERVAL_MS); // 2 second interval (4s total with 2 consecutive checks)
  }

  /**
   * Run a mic probe to check if external apps (meeting apps) are still using the mic.
   * This works by briefly pausing Om's mic capture, checking if mic is still in use,
   * then resuming. If mic is NOT in use, the meeting app has released it = meeting ended.
   */
  private async runMicProbe(session: MeetingSession): Promise<void> {
    try {
      // Step 1: Pause Om's mic capture
      const pauseResult = this.recorder.pauseMicCapture();
      if (!pauseResult.success) {
        console.warn('[MicProbe] Failed to pause mic:', pauseResult.error);
        return;
      }

      // Step 2: Wait for CoreAudio to register the mic release
      await new Promise((resolve) =>
        setTimeout(resolve, this.MIC_PROBE_PAUSE_MS)
      );

      // Step 3: Check if mic is still in use by another app
      const micInUse = this.detector.isMicrophoneInUse();

      // Step 4: Resume Om's mic capture immediately
      const resumeResult = this.recorder.resumeMicCapture();
      if (!resumeResult.success) {
        console.error(
          '[MicProbe] CRITICAL: Failed to resume mic:',
          resumeResult.error
        );
        // Continue anyway - don't want to break the detection loop
      }

      // Step 5: Process result
      if (micInUse) {
        // Meeting app still using mic - reset counter
        this.micProbeMissCount = 0;
      } else {
        // Mic not in use - meeting app may have released it
        this.micProbeMissCount++;
        console.log(
          `[MicProbe] External mic not in use (${this.micProbeMissCount}/${this.MIC_PROBE_MISS_THRESHOLD})`
        );

        if (
          this.micProbeMissCount >= this.MIC_PROBE_MISS_THRESHOLD &&
          !this.stopScheduled
        ) {
          console.log('[MicProbe] Meeting ended - mic released by meeting app');
          addBreadcrumb(
            'mic-probe',
            'Mic probe threshold reached - ending meeting',
            {
              missCount: this.micProbeMissCount,
              threshold: this.MIC_PROBE_MISS_THRESHOLD,
              platform: session.platform,
            }
          );
          this.micProbeMissCount = 0;
          this.stopScheduled = true;

          // Add meeting to manuallyStoppedMeetings to prevent re-detection
          // (the meeting tab may still be open even though call ended)
          // We add multiple ID formats to handle cases where window detection
          // returns different data than mic detection (e.g., URL missing)
          const meetingId =
            this.meetingDetector.getMeetingIdFromSession(session);
          this.manuallyStoppedMeetings.add(meetingId);

          // Also add meetingCode-based ID if available (most reliable for Google Meet)
          if (session.metadata.meetingCode) {
            const codeId = `meet:${session.metadata.meetingCode}`;
            this.manuallyStoppedMeetings.add(codeId);
          }

          // Also add fallback ID using windowTitle in case URL is not available
          const fallbackId = `${session.platform}:${session.windowTitle}`;
          if (fallbackId !== meetingId) {
            this.manuallyStoppedMeetings.add(fallbackId);
          }

          console.log(
            '[MicProbe] Marked meeting as ended to prevent re-detection:',
            meetingId,
            'manuallyStoppedMeetings:',
            Array.from(this.manuallyStoppedMeetings)
          );

          void this.stopRecording(session, 'window_closed');
          if (this.endDetectionInterval) {
            clearInterval(this.endDetectionInterval);
            this.endDetectionInterval = null;
          }
        }
      }
    } catch (error) {
      console.error('[MicProbe] Error during probe:', error);
      // Always try to resume mic on error
      this.recorder.resumeMicCapture();
    }
  }

  /**
   * Stop recording
   */
  private async stopRecording(
    session: MeetingSession,
    reason: 'window_closed' | 'max_duration' | 'user_manual'
  ): Promise<void> {
    try {
      console.log('[MeetingOrchestrator] Stopping recording:', reason);
      const durationSeconds = Math.round(
        (Date.now() - session.startTime.getTime()) / 1000
      );
      addBreadcrumb('meeting', 'Recording stopped', {
        sessionId: session.sessionId,
        reason,
        durationSeconds,
        platform: session.platform,
      });
      session.state = RecordingState.STOPPING;
      session.endTime = new Date();

      // Stop native recording
      const result = await this.recorder.stopRecording();

      if (!result.success) {
        // If recording is already stopped (e.g., by native recorder detecting window closure),
        // this is not an error - just log and continue with cleanup
        if (result.error === 'No active recording') {
          console.log(
            '[MeetingOrchestrator] Recording already stopped (likely by native recorder), continuing with cleanup'
          );
        } else {
          throw new Error(result.error || 'Failed to stop recording');
        }
      }

      const finalPath = result.filePath || session.recordingPath;
      if (finalPath) {
        session.recordingPath = finalPath;

        console.log(
          '[MeetingOrchestrator] Recording stopped, file path:',
          finalPath
        );

        // Check if file exists
        const fileExists = fs.existsSync(finalPath);
        console.log('[MeetingOrchestrator] File exists:', fileExists);

        if (fileExists) {
          // Calculate duration and size
          const stats = fs.statSync(finalPath);
          const duration = Math.floor(
            (session.endTime.getTime() - session.startTime.getTime()) / 1000
          );

          console.log('[MeetingOrchestrator] File stats:', {
            sizeMB: (stats.size / 1024 / 1024).toFixed(2),
            durationSeconds: duration,
          });

          session.metadata.fileSizeMB = stats.size / 1024 / 1024;
          session.metadata.durationSeconds = duration;
          session.metadata.endTime = session.endTime;
        } else {
          console.error(
            '[MeetingOrchestrator] ERROR: Recording file does not exist!'
          );
        }
      }

      session.state = RecordingState.COMPLETED;

      // For auto-detected end (window closed, max duration), show processing message then close
      console.log(
        '[MeetingOrchestrator] Auto-detected end - showing processing message'
      );
      this.currentSession = null;
      this.stopScheduled = false;

      // Show appropriate processing message based on auth status and schedule auto-close
      void this.showProcessingMessage();

      // Notify menu bar of state change
      this.notifyStateChange();
      if (this.endDetectionInterval) {
        clearInterval(this.endDetectionInterval);
        this.endDetectionInterval = null;
      }

      // Finalize recording with stitching (works for both segmented and single-file recordings)
      void this.finalizeRecording(session, finalPath);
    } catch (error) {
      console.error('[MeetingOrchestrator] Error stopping recording:', error);
      const errorMessage =
        error instanceof Error ? error : new Error(String(error));
      this.handleError(session, errorMessage);
    }
  }

  /**
   * Finalize recording after window closes
   * Updates current segment and uploads with stitching
   */
  private async finalizeRecording(
    session: MeetingSession,
    finalPath: string
  ): Promise<void> {
    try {
      console.log('[MeetingOrchestrator] Finalizing recording');
      console.log('[MeetingOrchestrator] Final path:', finalPath);
      console.log(
        '[MeetingOrchestrator] Session has',
        session.recordings.length,
        'segments'
      );

      const endTime = new Date();

      // Set meeting end time in metadata (for backend upload)
      session.metadata.endTime = endTime;

      // Get current active segment
      const activeIndex =
        session.activeRecordingIndex !== undefined
          ? session.activeRecordingIndex
          : session.recordings.length - 1;
      const segment = session.recordings[activeIndex];

      if (segment) {
        // Calculate segment duration using segment's start time (not session start time)
        const segmentStartTime = segment.startTime || session.startTime;
        const duration = Math.floor(
          (endTime.getTime() - segmentStartTime.getTime()) / 1000
        );

        // Update segment timing (always set these, even if file doesn't exist)
        segment.endTime = endTime;
        segment.filePath = finalPath;
        segment.durationSeconds = duration;
        segment.uploadStatus = 'pending';

        // Validate recording file exists and get size
        if (!fs.existsSync(finalPath)) {
          console.error(
            '[MeetingOrchestrator] Final recording file not found:',
            finalPath
          );
          segment.fileSizeMB = 0; // Set to 0 if file doesn't exist
          // In test environment or when file doesn't exist, continue with upload of other segments
          if (process.env.NODE_ENV !== 'test') {
            throw new Error(`Recording file not found: ${finalPath}`);
          }
        } else {
          // Calculate size for the final segment (async to avoid blocking main process)
          const stats = await fs.promises.stat(finalPath);
          segment.fileSizeMB = stats.size / 1024 / 1024;
        }

        console.log('[MeetingOrchestrator] Updated final segment:', {
          segmentNumber: segment.segmentNumber,
          recordType: segment.recordType,
          fileSizeMB: segment.fileSizeMB?.toFixed(2) || '0',
          durationSeconds: duration,
        });
      } else {
        console.warn(
          '[MeetingOrchestrator] No active segment found for final recording'
        );
      }

      // Process and upload stitched audio
      await this.processAndUploadStitchedAudio(session);
    } catch (error) {
      console.error('[MeetingOrchestrator] Error finalizing recording:', error);
      // Don't throw - we've already closed the UI, just log the error
    }
  }

  /**
   * Handle recording errors
   */
  private handleError(session: MeetingSession, error: Error): void {
    console.error('[MeetingOrchestrator] Recording error:', error);

    session.state = RecordingState.IDLE;
    session.error = error.message;

    // Clear session
    this.currentSession = null;
    this.stopScheduled = false;

    // Close control bar
    const controlBar = getRecordingControlBar();
    controlBar.close();

    // Notify menu bar of state change
    this.notifyStateChange();
    if (this.endDetectionInterval) {
      clearInterval(this.endDetectionInterval);
      this.endDetectionInterval = null;
    }
  }

  /**
   * Safely delete a file with proper async check and error handling
   * Continues execution even if deletion fails
   */
  private async safeDeleteFile(
    filePath: string,
    fileType: string
  ): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
      console.log(`[MeetingOrchestrator] Deleted ${fileType}:`, filePath);
    } catch (error) {
      // ENOENT means file doesn't exist - not an error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(
          `[MeetingOrchestrator] Failed to delete ${fileType}:`,
          filePath,
          error
        );
      }
    }
  }

  /**
   * Get current session state
   */
  getCurrentSession(): MeetingSession | null {
    return this.currentSession;
  }

  /**
   * Toggle between on-record and off-record
   * Stops current segment and starts new one with opposite type
   */
  async toggleRecord(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession) {
      return { success: false, error: 'No active session' };
    }

    if (this.currentSession.state !== RecordingState.RECORDING) {
      return { success: false, error: 'Not currently recording' };
    }

    try {
      console.log(
        '[MeetingOrchestrator] Toggle record requested, current state:',
        this.currentSession.isOnRecord
      );

      // Set flag to prevent UI flicker during transition
      this.isProcessingTransition = true;

      // Stop current segment (without updating control bar)
      await this.stopSegmentSilent(this.currentSession);

      // Flip the record state
      this.currentSession.isOnRecord = !this.currentSession.isOnRecord;

      // Small delay to ensure clean transition
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Start new segment with new type
      await this.startSegment(
        this.currentSession,
        this.currentSession.isOnRecord ? 'on-record' : 'off-record'
      );

      // Clear transition flag
      this.isProcessingTransition = false;

      return { success: true };
    } catch (error) {
      console.error('[MeetingOrchestrator] Error toggling record:', error);
      this.isProcessingTransition = false;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Stop current recording segment (silent - no UI updates)
   * Used during toggle to prevent flicker
   */
  private async stopSegmentSilent(session: MeetingSession): Promise<void> {
    console.log('[MeetingOrchestrator] Stopping segment (silent)');

    // Stop native recording
    const result = await this.recorder.stopRecording();

    if (!result.success) {
      // If recording is already stopped, this is not an error during toggle
      if (result.error === 'No active recording') {
        console.log(
          '[MeetingOrchestrator] Recording already stopped during toggle, continuing'
        );
      } else {
        throw new Error(result.error || 'Failed to stop recording');
      }
    }

    const finalPath = result.filePath || session.recordingPath;
    if (!finalPath) {
      throw new Error('No recording path available');
    }

    const endTime = new Date();

    // Get current segment (last one added)
    const activeIndex =
      session.activeRecordingIndex !== undefined
        ? session.activeRecordingIndex
        : session.recordings.length - 1;
    const segment = session.recordings[activeIndex];

    if (segment) {
      // Calculate duration from segment start time (not session start time!)
      const duration = Math.floor(
        (endTime.getTime() - segment.startTime.getTime()) / 1000
      );
      const stats = fs.statSync(finalPath);
      const fileSizeMB = stats.size / 1024 / 1024;

      // Update existing segment
      segment.endTime = endTime;
      segment.filePath = finalPath;
      segment.fileSizeMB = fileSizeMB;
      segment.durationSeconds = duration;
      segment.uploadStatus = 'pending';
    } else {
      console.warn(
        '[MeetingOrchestrator] No active segment found, this should not happen'
      );
    }

    // Clear active recording index
    session.activeRecordingIndex = undefined;

    // Keep state as RECORDING (no UI update)
    // State will be updated when new segment starts

    // Segment is marked as 'pending' and will be uploaded when meeting ends
    if (segment && segment.recordType === 'on-record') {
      console.log(
        '[MeetingOrchestrator] On-record segment saved, will upload when meeting ends'
      );
    } else if (segment) {
      console.log(
        '[MeetingOrchestrator] Off-record segment kept local, not uploading'
      );
    }
  }

  /**
   * Stop current recording segment
   */
  private async stopSegment(session: MeetingSession): Promise<void> {
    console.log('[MeetingOrchestrator] Stopping segment');

    // Stop native recording
    const result = await this.recorder.stopRecording();

    if (!result.success) {
      // If recording is already stopped, this is not an error - continue with cleanup
      if (result.error === 'No active recording') {
        console.log(
          '[MeetingOrchestrator] Recording already stopped, continuing with segment cleanup'
        );
      } else {
        throw new Error(result.error || 'Failed to stop recording');
      }
    }

    const finalPath = result.filePath || session.recordingPath;
    if (!finalPath) {
      throw new Error('No recording path available');
    }

    const endTime = new Date();

    // Get current segment (last one added) or create new one
    const activeIndex =
      session.activeRecordingIndex !== undefined
        ? session.activeRecordingIndex
        : session.recordings.length - 1;
    const segment = session.recordings[activeIndex];

    if (segment) {
      // Calculate duration from segment start time (not session start time!)
      const duration = Math.floor(
        (endTime.getTime() - segment.startTime.getTime()) / 1000
      );
      const stats = fs.statSync(finalPath);
      const fileSizeMB = stats.size / 1024 / 1024;

      // Update existing segment
      segment.endTime = endTime;
      segment.filePath = finalPath;
      segment.fileSizeMB = fileSizeMB;
      segment.durationSeconds = duration;
      segment.uploadStatus = 'pending';
    } else {
      console.warn(
        '[MeetingOrchestrator] No active segment found, this should not happen'
      );
    }

    // Clear active recording index
    session.activeRecordingIndex = undefined;

    // Note: State management and UI updates are handled by the caller (endMeeting())
    // This allows the caller to properly clear the session before notifying state change

    // Segment is now marked as 'pending' and ready for upload
    // Upload will be handled by the caller (endMeeting() or toggleRecord())
    if (segment && segment.recordType === 'on-record') {
      console.log(
        '[MeetingOrchestrator] Segment stopped and marked as pending for upload'
      );
    } else if (segment) {
      console.log(
        '[MeetingOrchestrator] Off-record segment kept local, not uploading'
      );
    }
  }

  /**
   * Start new recording segment
   */
  private async startSegment(
    session: MeetingSession,
    recordType: 'on-record' | 'off-record'
  ): Promise<void> {
    console.log('[MeetingOrchestrator] Starting segment, type:', recordType);

    const segmentNumber = session.recordings.length + 1;
    const segment: RecordingSegment = {
      segmentId: randomUUID(),
      segmentNumber,
      startTime: new Date(),
      recordType,
      uploadStatus: 'pending',
    };

    // Add segment to session
    session.recordings.push(segment);
    session.activeRecordingIndex = session.recordings.length - 1;

    // Generate output path
    const userDataPath = app.getPath('userData');
    const recordingsDir = path.join(userDataPath, 'recordings');

    // Ensure directory exists
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    // Security: Verify recordings directory real path is within userData before writing
    const realPath = fs.realpathSync(recordingsDir);
    const realUserData = fs.realpathSync(userDataPath);
    if (!realPath.startsWith(realUserData)) {
      throw new Error(
        'Security: Recordings directory resolves outside userData path'
      );
    }

    const filename = `${session.sessionId}_seg${segmentNumber}.mov`;
    const outputPath = path.join(recordingsDir, filename);

    console.log('[MeetingOrchestrator] Starting segment recording:', {
      recordingsDir,
      filename,
      outputPath,
    });

    // Start native recording (audio-only, no need for windowId/displayId)
    const result = await this.recorder.startRecording({
      outputPath,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to start recording');
    }

    segment.filePath = outputPath;
    session.recordingPath = outputPath; // Keep legacy field updated
    session.state = RecordingState.RECORDING;

    // Update control bar
    const controlBar = getRecordingControlBar();
    controlBar.updateState(session.state);
    this.notifyStateChange();

    // Restart end detection if not already running
    if (!this.endDetectionInterval) {
      this.startEndDetection(session);
    }
  }

  /**
   * Process and upload stitched audio from recorded segments
   * Shared by both manual stop and automatic window close
   */
  private async processAndUploadStitchedAudio(
    session: MeetingSession
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Extract, stitch, and upload single audio file
      const onRecordSegments = session.recordings.filter(
        (seg) => seg.recordType === 'on-record'
      );

      if (onRecordSegments.length === 0) {
        console.log('[MeetingOrchestrator] No on-record segments to upload');
        return { success: true };
      }

      console.log(
        `[MeetingOrchestrator] Processing ${onRecordSegments.length} on-record segments`
      );

      // Step 1: Extract audio from each .mov segment
      const { audioService } = await import('./audio-service');
      const extractionResults = await audioService.extractAudioFromSegments(
        onRecordSegments
          .map((seg) => seg.filePath!)
          .filter((path) => path !== undefined)
      );

      // Check for extraction failures
      const failedExtractions = extractionResults.filter((r) => !r.success);
      if (failedExtractions.length > 0) {
        console.error(
          `[MeetingOrchestrator] ${failedExtractions.length} audio extractions failed`
        );
        console.error(
          '[MeetingOrchestrator] Failed extractions:',
          failedExtractions
        );
        return {
          success: false,
          error: `Failed to extract audio from ${failedExtractions.length} segments`,
        };
      }

      // Step 2: Prepare segments for stitching (include mic/system tracks for user identification)
      const audioSegments = onRecordSegments.map((seg, index) => ({
        segmentNumber: seg.segmentNumber,
        audioPath: extractionResults[index].audioPath!,
        micAudioPath: extractionResults[index].micAudioPath,
        systemAudioPath: extractionResults[index].systemAudioPath,
        startTime: seg.startTime,
        endTime: seg.endTime!,
        durationSeconds: seg.durationSeconds!,
      }));

      // Step 3: Calculate off-record periods from actual off-record segments
      // Stitched audio has 5s silence placeholders, but we track the actual duration
      const offRecordPeriods: Array<{
        placeholderStart: number;
        placeholderEnd: number;
        actualDuration: number;
      }> = [];

      // Calculate position in stitched audio timeline (includes 5s silence gaps)
      const SILENCE_GAP_SECONDS = 5;
      let stitchedOffset = 0;

      for (const seg of session.recordings) {
        if (seg.recordType === 'on-record') {
          // On-record segment: advance offset by its duration
          stitchedOffset += seg.durationSeconds || 0;
        } else {
          // Off-record segment: add 5s silence placeholder in stitched audio
          const actualDuration = seg.durationSeconds || 0;
          offRecordPeriods.push({
            placeholderStart: stitchedOffset,
            placeholderEnd: stitchedOffset + SILENCE_GAP_SECONDS,
            actualDuration,
          });
          stitchedOffset += SILENCE_GAP_SECONDS;
        }
      }

      console.log(
        '[MeetingOrchestrator] Calculated off-record periods:',
        offRecordPeriods
      );

      // Step 4: Stitch audio files together
      console.log('[MeetingOrchestrator] Stitching audio segments...');
      const stitchResult = await audioService.stitchAudio(
        audioSegments,
        session.sessionId
      );

      if (!stitchResult.success || !stitchResult.stitchedPath) {
        console.error(
          '[MeetingOrchestrator] Audio stitching failed:',
          stitchResult.error
        );
        return {
          success: false,
          error: stitchResult.error || 'Audio stitching failed',
        };
      }

      console.log(
        '[MeetingOrchestrator] Audio stitched successfully:',
        stitchResult.stitchedPath
      );

      // Step 5: Upload stitched audio file
      console.log('[MeetingOrchestrator] Uploading stitched audio...');
      const uploadResult = await uploadService.uploadStitchedAudio(
        session.sessionId,
        stitchResult.stitchedPath,
        session.metadata,
        offRecordPeriods,
        stitchResult.totalDuration || 0,
        stitchResult.stitchedMicPath,
        stitchResult.stitchedSystemPath
      );

      if (!uploadResult.success) {
        console.error(
          '[MeetingOrchestrator] Upload failed:',
          uploadResult.error
        );

        // Queue the stitched file for later upload (e.g., when user regains network/auth)
        console.log(
          '[MeetingOrchestrator] Queueing stitched audio for later upload'
        );
        await uploadQueue.queueForLater(
          session.sessionId,
          stitchResult.stitchedPath,
          session.metadata,
          offRecordPeriods,
          stitchResult.totalDuration || 0,
          stitchResult.stitchedMicPath,
          stitchResult.stitchedSystemPath
        );

        // Note: Control bar already shows "Meeting queued - sign in to upload" message

        // Clean up original segments but keep stitched file (for queue)
        console.log(
          '[MeetingOrchestrator] Cleaning up original segment files...'
        );
        for (const segment of session.recordings) {
          if (segment.filePath) {
            await this.safeDeleteFile(segment.filePath, '.mov file');
          }
        }

        // Delete extracted .mp3 files (but keep stitched files for queue)
        for (const result of extractionResults) {
          if (result.audioPath) {
            await this.safeDeleteFile(
              result.audioPath,
              'extracted .mp3 (mixed)'
            );
          }
          if (result.micAudioPath) {
            await this.safeDeleteFile(
              result.micAudioPath,
              'extracted .mp3 (mic)'
            );
          }
          if (result.systemAudioPath) {
            await this.safeDeleteFile(
              result.systemAudioPath,
              'extracted .mp3 (system)'
            );
          }
        }

        // DO NOT delete stitched files - they're queued for upload
        console.log(
          '[MeetingOrchestrator] Keeping stitched files for queued upload'
        );

        return { success: true }; // Return success since file is queued
      }

      console.log(
        '[MeetingOrchestrator] Upload successful, meetingId:',
        uploadResult.meetingId
      );

      // Step 5: Clean up local files
      console.log('[MeetingOrchestrator] Cleaning up local files...');

      // Delete original .mov files
      for (const segment of session.recordings) {
        if (segment.filePath) {
          await this.safeDeleteFile(segment.filePath, '.mov file');
        }
      }

      // Delete extracted .mp3 files (mixed, mic, and system tracks)
      for (const result of extractionResults) {
        if (result.audioPath) {
          await this.safeDeleteFile(result.audioPath, 'extracted .mp3 (mixed)');
        }
        if (result.micAudioPath) {
          await this.safeDeleteFile(
            result.micAudioPath,
            'extracted .mp3 (mic)'
          );
        }
        if (result.systemAudioPath) {
          await this.safeDeleteFile(
            result.systemAudioPath,
            'extracted .mp3 (system)'
          );
        }
      }

      // Delete stitched files (mixed, mic, and system tracks)
      await this.safeDeleteFile(
        stitchResult.stitchedPath,
        'stitched file (mixed)'
      );
      if (stitchResult.stitchedMicPath) {
        await this.safeDeleteFile(
          stitchResult.stitchedMicPath,
          'stitched file (mic)'
        );
      }
      if (stitchResult.stitchedSystemPath) {
        await this.safeDeleteFile(
          stitchResult.stitchedSystemPath,
          'stitched file (system)'
        );
      }

      console.log('[MeetingOrchestrator] Meeting processing complete');

      // Note: Control bar already shows "Processing your meeting..." message
      // No additional desktop notification needed

      return { success: true };
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error processing stitched audio:',
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * End meeting - stops current segment and uploads all on-record segments
   */
  async endMeeting(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession) {
      return { success: false, error: 'No active session' };
    }

    try {
      console.log('[MeetingOrchestrator] End meeting requested');

      // Set meeting end time in metadata (for backend upload)
      this.currentSession.metadata.endTime = new Date();

      // Stop current segment if recording (handle failures gracefully)
      if (this.currentSession.state === RecordingState.RECORDING) {
        try {
          await this.stopSegment(this.currentSession);
        } catch (error) {
          console.error(
            '[MeetingOrchestrator] Failed to stop segment, but continuing with end meeting:',
            error
          );
          // Continue with cleanup even if stop fails
        }
      }

      // Mark this meeting as manually stopped so we don't re-detect it
      const meetingId = this.meetingDetector.getMeetingIdFromSession(
        this.currentSession
      );
      this.manuallyStoppedMeetings.add(meetingId);
      console.log(
        '[MeetingOrchestrator] Marked meeting as manually ended:',
        meetingId
      );

      // Show appropriate processing message based on auth status and schedule auto-close
      void this.showProcessingMessage();

      // Clear session
      const session = this.currentSession;
      this.currentSession = null;
      this.stopScheduled = false;

      // Notify state change
      this.notifyStateChange();

      // Stop end detection
      if (this.endDetectionInterval) {
        clearInterval(this.endDetectionInterval);
        this.endDetectionInterval = null;
      }

      // Process and upload stitched audio
      return await this.processAndUploadStitchedAudio(session);
    } catch (error) {
      console.error('[MeetingOrchestrator] Error ending meeting:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Do a final check for an improved meeting title before upload (only for "End Meeting" button)
   *
   * NOTE: This is ONLY useful when user clicks "End Meeting" button while window is still open.
   * In the common case (closing tab/window), the window is already gone and we just use
   * what's in session.metadata (which has been updated by polling every 5s).
   *
   * This method safely handles the window-gone case by returning existing metadata.
   */
  private getFinalMetadataForUpload(session: MeetingSession): MeetingMetadata {
    try {
      // Only re-check for browser-based meetings that might have dynamic titles
      if (
        session.platform === 'meet' ||
        session.platform === 'zoom' ||
        session.platform === 'teams'
      ) {
        // Try to get the currently active meeting window (might be null if already closed)
        const currentWindow = this.meetingDetector.getActiveMeetingWindow();

        // If window is still open and it's the same meeting, check for improved title
        if (
          currentWindow &&
          this.meetingDetector.isSameMeeting(currentWindow, session)
        ) {
          const currentMetadata = extractMeetingMetadata(
            currentWindow,
            session.startTime
          );

          // Check if the new title is better than what we have
          const currentTitle = session.metadata.title;
          const newTitle = currentMetadata.title;
          const isCurrentGeneric = this.isGenericMeetingTitle(currentTitle);
          const isNewMoreSpecific = this.isSpecificMeetingTitle(newTitle);

          if (
            isCurrentGeneric &&
            isNewMoreSpecific &&
            currentTitle !== newTitle
          ) {
            console.log(
              '[MeetingOrchestrator] Final metadata check - found better title:',
              {
                from: currentTitle,
                to: newTitle,
              }
            );

            // Return updated metadata
            return {
              ...session.metadata,
              title: newTitle,
              windowTitle: currentWindow.windowTitle,
            };
          }
        } else if (!currentWindow) {
          console.log(
            '[MeetingOrchestrator] Final metadata check - window already closed, using cached metadata'
          );
        }
      }
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error during final metadata check (safe to ignore):',
        error
      );
      // Fall through to return original metadata
    }

    // Return original metadata if window is closed, no improvement found, or error occurred
    return session.metadata;
  }

  /**
   * Manually stop current recording
   * Now calls endMeeting to handle segment-based recording
   */
  async manualStop(): Promise<{ success: boolean; error?: string }> {
    // Lock to prevent detection loop interference during user action
    this.isProcessingUserAction = true;
    try {
      if (!this.currentSession) {
        return { success: false, error: 'No active recording' };
      }

      if (this.currentSession.state === RecordingState.MEETING_DETECTED) {
        // User cancelled before starting recording
        const meetingId = this.meetingDetector.getMeetingIdFromSession(
          this.currentSession
        );
        this.manuallyStoppedMeetings.add(meetingId);
        console.log(
          '[MeetingOrchestrator] Marked meeting as manually cancelled:',
          meetingId
        );

        this.currentSession = null;

        // Close control bar
        const controlBar = getRecordingControlBar();
        controlBar.close();

        // Notify menu bar of state change
        this.notifyStateChange();
        return { success: true };
      }

      if (this.currentSession.state === RecordingState.RECORDING) {
        // End meeting (stops recording and uploads all segments)
        console.log(
          '[MeetingOrchestrator] Manual stop requested - ending meeting'
        );
        return await this.endMeeting();
      }

      return { success: false, error: 'Invalid state for manual stop' };
    } finally {
      // Always release lock, even if error occurs
      this.isProcessingUserAction = false;
    }
  }

  /**
   * Manually start recording (from control bar)
   */
  async manualStart(): Promise<{ success: boolean; error?: string }> {
    console.log('[MeetingOrchestrator] Manual start requested');

    // Lock to prevent detection loop interference during user action
    this.isProcessingUserAction = true;
    try {
      if (!this.currentSession) {
        console.log('[MeetingOrchestrator] No active session');
        return { success: false, error: 'No active session' };
      }

      console.log(
        '[MeetingOrchestrator] Current session state:',
        this.currentSession.state
      );

      if (this.currentSession.state === RecordingState.MEETING_DETECTED) {
        // User manually started recording
        console.log('[MeetingOrchestrator] Starting recording manually');
        await this.startRecording(this.currentSession);
        return { success: true };
      }

      console.log(
        '[MeetingOrchestrator] Invalid state for manual start:',
        this.currentSession.state
      );
      return { success: false, error: 'Invalid state for manual start' };
    } finally {
      // Always release lock, even if error occurs
      this.isProcessingUserAction = false;
    }
  }

  /**
   * Check if there's a currently dismissed meeting that could be recorded
   * This is used by the menu bar to enable/disable the "Record Current Meeting" option
   */
  hasDismissedMeeting(): boolean {
    // Get the currently active meeting window (if any)
    const meetingWindow = this.meetingDetector.getActiveMeetingWindow();

    if (!meetingWindow) {
      return false;
    }

    // Check if this meeting has been manually stopped
    const meetingId = this.meetingDetector.getMeetingId(meetingWindow);
    return this.manuallyStoppedMeetings.has(meetingId);
  }

  /**
   * Re-enable recording for a dismissed meeting and start recording immediately
   * Called when user clicks "Start Recording" from the menu after dismissing a meeting
   */
  async resumeDismissedMeeting(): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Use the same detection logic as the main detection loop (mic-first)
    // This ensures we resume the meeting that's actually happening, not just the focused window
    const detectedMeeting = this.detectionService.detectMeeting();

    if (!detectedMeeting) {
      return { success: false, error: 'No active meeting detected' };
    }

    // Get meeting ID from detected meeting
    const meetingId = this.getMeetingIdFromDetected(detectedMeeting);

    if (!this.manuallyStoppedMeetings.has(meetingId)) {
      return { success: false, error: 'Meeting is not dismissed' };
    }

    // Remove from dismissed set
    this.manuallyStoppedMeetings.delete(meetingId);
    console.log(
      '[MeetingOrchestrator] Re-enabled recording for meeting:',
      meetingId
    );

    // Trigger detection to create session
    await this.checkForMeetings();

    // Start recording immediately (user clicked "Start Recording")
    return await this.manualStart();
  }

  /**
   * Open screen picker for manual recording
   * Allows user to select any window/screen to record
   *
   * @param closeCurrentSession - If true, close the current detected session before opening picker
   *                              Used when multiple meetings are detected and user wants to choose
   */
  async openScreenPicker(closeCurrentSession: boolean = false): Promise<void> {
    // Check if already recording (not just detected)
    if (this.currentSession) {
      if (this.currentSession.state === RecordingState.RECORDING) {
        console.log(
          '[MeetingOrchestrator] Already recording, cannot start manual recording'
        );
        this.notificationManager.showNotification({
          title: 'Already Recording',
          body: 'Please end the current recording before starting a new one.',
        });
        return;
      }

      // If we're in detected state and closeCurrentSession is true, clear the session
      if (closeCurrentSession) {
        console.log(
          '[MeetingOrchestrator] Closing current detected session to open picker'
        );
        this.currentSession = null;
        const controlBar = getRecordingControlBar();
        controlBar.close();
        this.notifyStateChange();
      } else if (
        this.currentSession.state === RecordingState.MEETING_DETECTED
      ) {
        // Session exists but not recording - still block unless explicitly requested
        console.log(
          '[MeetingOrchestrator] Session exists in detected state, cannot open picker'
        );
        return;
      }
    }

    // Navigate main window to screen picker
    const { BrowserWindow } = await import('electron');
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('navigate', '/screen-picker');
    }
  }

  /**
   * Start manual audio recording immediately (no screen picker)
   * For audio-only recording without screen selection
   */
  async startManualAudioRecording(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('[MeetingOrchestrator] Starting manual audio recording');

      // Check if already recording
      if (this.currentSession?.state === RecordingState.RECORDING) {
        console.log(
          '[MeetingOrchestrator] Already recording, cannot start another recording'
        );
        this.notificationManager.showNotification({
          title: 'Already Recording',
          body: 'Please end the current recording before starting a new one.',
        });
        return { success: false, error: 'Already recording' };
      }

      // Create manual audio recording session
      const session: MeetingSession = {
        sessionId: randomUUID(),
        platform: 'manual',
        windowId: 0, // No window ID for audio-only
        windowTitle: 'Manual Recording',
        startTime: new Date(),
        state: RecordingState.MEETING_DETECTED,
        metadata: {
          title: 'Manual Recording',
          platform: 'manual',
          windowTitle: 'Manual Recording',
          appName: 'Manual',
          startTime: new Date(),
        },
        recordings: [],
        isOnRecord: true,
      };

      this.currentSession = session;
      this.notifyStateChange();

      // Show control bar
      const controlBar = getRecordingControlBar();
      await controlBar.show(session.metadata.title, session.state);

      // Auto-start recording immediately
      console.log(
        '[MeetingOrchestrator] Auto-starting audio recording for manual session'
      );
      const startResult = await this.manualStart();

      if (!startResult.success) {
        console.error(
          '[MeetingOrchestrator] Failed to auto-start audio recording:',
          startResult.error
        );
        return startResult;
      }

      console.log(
        '[MeetingOrchestrator] Manual audio recording started successfully'
      );
      return { success: true };
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error starting manual audio recording:',
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start recording from manually selected window
   * Called when user selects a window from the screen picker
   */
  async startManualRecording(
    sourceId: string,
    sourceName: string,
    displayId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[MeetingOrchestrator] Starting manual recording for:', {
        sourceName,
        sourceId,
        displayId,
      });

      // Navigate main window back to home/dashboard
      const { BrowserWindow } = await import('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('navigate', '/');
      }

      // Parse source ID to determine if it's a screen or window
      const isScreen = sourceId.startsWith('screen:');
      const sourceNumber = this.parseIdFromSource(sourceId);

      console.log('[MeetingOrchestrator] Parsed source:', {
        isScreen,
        sourceNumber,
        displayId,
      });

      // Create manual session
      // For screens: use displayId, for windows: use windowId
      const session: MeetingSession = {
        sessionId: randomUUID(),
        platform: 'manual',
        windowId: isScreen ? 0 : sourceNumber,
        windowTitle: sourceName,
        startTime: new Date(),
        state: RecordingState.MEETING_DETECTED,
        metadata: {
          title: sourceName || 'Manual Recording',
          platform: 'manual',
          windowTitle: sourceName,
          appName: 'Manual',
          startTime: new Date(),
          displayId: isScreen
            ? displayId
              ? parseInt(displayId, 10)
              : sourceNumber
            : undefined,
        },
        recordings: [],
        isOnRecord: true,
      };

      this.currentSession = session;
      this.notifyStateChange();

      // Show control bar
      const controlBar = getRecordingControlBar();
      await controlBar.show(session.metadata.title, session.state);

      // Auto-start recording immediately for manual recordings
      console.log(
        '[MeetingOrchestrator] Auto-starting recording for manual session'
      );
      const startResult = await this.manualStart();

      if (!startResult.success) {
        console.error(
          '[MeetingOrchestrator] Failed to auto-start recording:',
          startResult.error
        );
        // Clean up session
        this.currentSession = null;
        controlBar.close();
        this.notifyStateChange();
        return {
          success: false,
          error: `Failed to start recording: ${startResult.error}`,
        };
      }

      console.log('[MeetingOrchestrator] Recording auto-started successfully');

      // Start monitoring window for closure (only for windows, not screens)
      if (!isScreen && sourceNumber > 0) {
        this.startWindowMonitoring(sourceNumber);
      }

      console.log(
        '[MeetingOrchestrator] Manual recording session created and started:',
        session.sessionId
      );
      return { success: true };
    } catch (error) {
      console.error(
        '[MeetingOrchestrator] Error starting manual recording:',
        error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Parse ID from source ID string
   *
   * Source ID format: "window:123456:0" or "screen:123456:0"
   * - Part 0: Type ("window" or "screen")
   * - Part 1: ID (window ID or screen ID)
   * - Part 2: Display index (always 0 for desktopCapturer sources)
   *
   * @param sourceId - The source ID string from Electron's desktopCapturer
   * @returns The numeric ID (windowId or screenId), or 0 if parsing fails
   *
   * @example
   * parseIdFromSource("window:123456:0") // Returns 123456
   * parseIdFromSource("screen:789012:0") // Returns 789012
   * parseIdFromSource("invalid")         // Returns 0
   */
  private parseIdFromSource(sourceId: string): number {
    try {
      const parts = sourceId.split(':');
      if (parts.length >= 2) {
        return parseInt(parts[1], 10);
      }
      console.warn(
        '[MeetingOrchestrator] Could not parse ID from sourceId:',
        sourceId
      );
      return 0;
    } catch (error) {
      console.error('[MeetingOrchestrator] Error parsing ID:', error);
      return 0;
    }
  }

  /**
   * Monitor manually-selected window for closure
   * Automatically finalizes recording when window closes
   */
  private startWindowMonitoring(windowId: number): void {
    const checkInterval = setInterval(() => {
      if (!this.currentSession || this.currentSession.platform !== 'manual') {
        clearInterval(checkInterval);
        return;
      }

      // Check if window still exists
      const windowStillExists = this.detector.isWindowActive(windowId);
      if (!windowStillExists) {
        console.log(
          '[MeetingOrchestrator] Manual recording window closed, finalizing'
        );
        clearInterval(checkInterval);

        // Only finalize if we're actually recording
        if (this.currentSession.state === RecordingState.RECORDING) {
          void this.manualStop();
        } else {
          // If not recording yet, just close the control bar
          console.log(
            '[MeetingOrchestrator] Window closed before recording started, closing control bar'
          );
          this.currentSession = null;
          const controlBar = getRecordingControlBar();
          controlBar.close();
          this.notifyStateChange();
        }
      }
    }, END_DETECTION_INTERVAL_MS); // Check every 2 seconds
  }
}
