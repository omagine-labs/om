import type { MeetingWindow } from '../types/electron';
import type { WindowDetector, MeetingAppInfo } from '../native-window-detector';
import type { MeetingSession } from './meeting-orchestrator';

/**
 * MeetingDetector - Handles detection of meeting windows and session matching
 *
 * Detection Strategy (Hybrid Approach):
 * 1. PRIMARY: Check if microphone is in use + known meeting app is running
 *    - More reliable than window title detection
 *    - Works for Slack huddles, browser meetings, etc.
 * 2. FALLBACK: Window title-based detection (original approach)
 *    - Useful for getting specific window info when mic detection succeeds
 */
export class MeetingDetector {
  private detector: WindowDetector;

  constructor(detector: WindowDetector) {
    this.detector = detector;
  }

  /**
   * Check if user is currently in a meeting using microphone-based detection
   * This is more reliable than window title detection.
   * @returns MeetingAppInfo if in meeting, null otherwise
   */
  isInMeeting(): MeetingAppInfo | null {
    return this.detector.isInMeeting();
  }

  /**
   * Check if microphone is currently in use
   */
  isMicrophoneInUse(): boolean {
    return this.detector.isMicrophoneInUse();
  }

  /**
   * Get list of running meeting apps
   */
  getRunningMeetingApps(): MeetingAppInfo[] {
    try {
      return this.detector.getRunningMeetingApps();
    } catch (error) {
      console.error(
        '[MeetingDetector] Error getting running meeting apps:',
        error
      );
      return [];
    }
  }

  /**
   * Get the active meeting window, filtering out terminal windows if a real app exists
   * This is the LEGACY approach - prefer isInMeeting() for reliability
   */
  getActiveMeetingWindow(): MeetingWindow | null {
    let meetingWindow = this.detector.getActiveMeetingWindow();

    // Filter out terminal windows if real app window exists
    if (meetingWindow && this.isTerminalWindow(meetingWindow)) {
      const allWindows = this.detector.getAllMeetingWindows();
      const realApp = allWindows.find((w) => !this.isTerminalWindow(w));
      if (realApp) {
        meetingWindow = realApp;
      }
    }

    return meetingWindow;
  }

  /**
   * Check if window is a terminal (to prioritize real app windows)
   */
  isTerminalWindow(window: MeetingWindow): boolean {
    const terminals = ['iTerm', 'Terminal', 'Alacritty', 'Hyper', 'Warp'];
    return terminals.includes(window.appName);
  }

  /**
   * Get a unique identifier for a meeting
   */
  getMeetingId(window: MeetingWindow): string {
    // For Google Meet, use meeting code
    if (window.url && window.platform === 'meet') {
      const match = window.url.match(/meet\.google\.com\/([a-z-]{3,})/);
      if (match && match[1]) {
        return `meet:${match[1]}`;
      }
    }

    // For other platforms, use platform + window title
    return `${window.platform}:${window.windowTitle}`;
  }

  /**
   * Get meeting ID from a session
   */
  getMeetingIdFromSession(session: MeetingSession): string {
    if (session.metadata.meetingCode) {
      return `meet:${session.metadata.meetingCode}`;
    }
    return `${session.platform}:${session.windowTitle}`;
  }

  /**
   * Check if two meeting windows represent the same meeting
   */
  isSameMeeting(window: MeetingWindow, session: MeetingSession): boolean {
    // For browser-based meetings (Google Meet), compare URLs (meeting code will be the same)
    if (window.url && session.metadata.url && window.platform === 'meet') {
      const windowCode = this.extractMeetingCode(window.url);
      const sessionCode =
        session.metadata.meetingCode ||
        this.extractMeetingCode(session.metadata.url);

      if (windowCode && sessionCode && windowCode === sessionCode) {
        return true;
      }
    }

    // For Zoom/Teams/Slack, compare platform and window title
    if (
      window.platform !== 'meet' &&
      window.platform === session.platform &&
      window.windowTitle === session.windowTitle
    ) {
      return true;
    }

    return false;
  }

  /**
   * Extract meeting code from a URL
   */
  private extractMeetingCode(url: string): string | null {
    try {
      if (!url || typeof url !== 'string') return null;

      // Validate URL scheme first using URL constructor (throws if invalid)
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) return null;

      // Now safely match against validated URL
      const match = urlObj.href.match(/meet\.google\.com\/([a-z-]{3,})/);
      if (!match || !match[1]) return null;

      const code = match[1];
      // Ensure code has proper Google Meet format (minimum 2 hyphens: xxx-xxxx-xxx)
      const hyphenCount = (code.match(/-/g) || []).length;
      if (hyphenCount < 2) return null;

      return code;
    } catch {
      return null;
    }
  }

  /**
   * Check if a window is still active
   */
  isWindowActive(windowId: number): boolean {
    return this.detector.isWindowActive(windowId);
  }

  /**
   * Get all tab URLs for a window
   */
  getWindowTabURLs(windowId: number): string[] {
    return this.detector.getWindowTabURLs(windowId);
  }
}
