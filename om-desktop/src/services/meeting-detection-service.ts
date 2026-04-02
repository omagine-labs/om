/**
 * Meeting Detection Service
 *
 * Encapsulates the hybrid detection model (microphone + window detection)
 * Makes detection logic testable and maintainable
 */

import type { WindowDetector, MeetingAppInfo } from '../native-window-detector';

export interface DetectedMeeting {
  platform: 'zoom' | 'meet' | 'teams' | 'slack' | 'manual';
  windowId: number;
  windowTitle: string;
  appName: string;
  url?: string;
  bounds: { x: number; y: number; width: number; height: number };
  detectionMethod: 'window' | 'microphone' | 'both';
}

/**
 * MeetingDetectionService
 *
 * Strategy:
 * 1. Check for meeting via window title (most reliable, gives specific info)
 * 2. If no window, check via microphone + app detection
 * 3. For browsers detected via mic, validate with URL checking
 *
 * This hybrid approach catches:
 * - Regular meetings: Zoom, Meet, Teams with windows
 * - Slack huddles: No dedicated window, detected via mic
 * - Browser meetings: Window or mic-based, validated by URL
 */
export class MeetingDetectionService {
  constructor(private detector: WindowDetector) {}

  /**
   * Detect active meeting using hybrid approach
   *
   * Strategy changed to prioritize microphone detection:
   * - Microphone state is more stable than window focus
   * - Reduces false negatives from window focus changes, tab switches, notifications
   * - Window detection still used when mic isn't in use
   *
   * @returns DetectedMeeting if found, null otherwise
   */
  detectMeeting(): DetectedMeeting | null {
    // Strategy 1: Try microphone-based detection first (more stable)
    // Mic usage persists even when user switches tabs, notifications appear, etc.
    const micMeeting = this.detectViaMicrophone();
    if (micMeeting) {
      return micMeeting;
    }

    // Strategy 2: Fall back to window-based detection
    // Still useful for detecting meetings before mic is enabled
    // and for getting precise window positioning
    const windowMeeting = this.detectViaWindow();
    if (windowMeeting) {
      return windowMeeting;
    }

    return null;
  }

  /**
   * Detect meeting via window title
   * Most reliable - gives us exact window info
   *
   * Filters out terminal windows (iTerm, Terminal) that might have meeting URLs
   * in their titles but aren't actual meeting windows
   */
  private detectViaWindow(): DetectedMeeting | null {
    const window = this.detector.getActiveMeetingWindow();
    if (!window) {
      return null;
    }

    // Filter out terminal windows - they sometimes show meeting URLs but aren't real meetings
    if (this.isTerminalWindow(window)) {
      // Check if there's a real meeting window in all windows
      const allWindows = this.detector.getAllMeetingWindows();
      const realWindow = allWindows.find((w) => !this.isTerminalWindow(w));
      if (realWindow) {
        return {
          ...this.ensureUrlForBrowserMeeting(realWindow),
          detectionMethod: 'window',
        };
      }
      // Only terminal window - not a real meeting
      return null;
    }

    return {
      ...this.ensureUrlForBrowserMeeting(window),
      detectionMethod: 'window',
    };
  }

  /**
   * Ensure browser-based meetings have a URL for proper meeting ID matching
   * Native window detection might not include the URL, so we try to resolve it
   */
  private ensureUrlForBrowserMeeting(
    window: import('../native-window-detector').MeetingWindow
  ): import('../native-window-detector').MeetingWindow {
    // If URL is already present, use it as-is
    if (window.url) {
      return window;
    }

    // Only try to resolve URL for browser-based meetings (Google Meet)
    if (window.platform !== 'meet') {
      return window;
    }

    // Try to get URL from browser tabs
    const urls = this.detector.getWindowTabURLs(window.windowId);
    const meetingUrl = urls.find((url) => this.isMeetingURL(url));

    if (meetingUrl) {
      console.log(
        '[Detection] Resolved URL for window-detected meeting:',
        meetingUrl
      );
      return { ...window, url: meetingUrl };
    }

    // Also try all windows (windowId=0) as fallback
    const allUrls = this.detector.getWindowTabURLs(0);
    const anyMeetingUrl = allUrls.find((url) => this.isMeetingURL(url));

    if (anyMeetingUrl) {
      console.log(
        '[Detection] Resolved URL from all tabs for window-detected meeting:',
        anyMeetingUrl
      );
      return { ...window, url: anyMeetingUrl };
    }

    return window;
  }

  /**
   * Check if window is a terminal window
   */
  private isTerminalWindow(window: {
    appName: string;
    windowTitle: string;
  }): boolean {
    const terminalApps = ['iTerm', 'Terminal', 'iTerm2', 'Hyper', 'Alacritty'];
    return terminalApps.includes(window.appName);
  }

  /**
   * Detect meeting via microphone + app detection
   * Used for Slack huddles and as fallback for browser meetings
   */
  private detectViaMicrophone(): DetectedMeeting | null {
    const meetingApp = this.detector.isInMeeting();
    if (!meetingApp) {
      return null;
    }

    // For browsers, validate that there's actually a meeting URL open
    if (this.isBrowserApp(meetingApp)) {
      return this.validateBrowserMeeting(meetingApp);
    }

    // For native apps (Slack, Zoom, Teams), trust the native detection
    return this.createSyntheticMeeting(meetingApp);
  }

  /**
   * Check if app is a browser
   */
  private isBrowserApp(app: MeetingAppInfo): boolean {
    return app.platform === 'meet' || app.platform === 'browser';
  }

  /**
   * Validate browser meeting by checking for meeting URLs
   *
   * IMPORTANT: Only returns a meeting if we find a valid meeting URL
   * This prevents false positives from "mic in use + browser open"
   */
  private validateBrowserMeeting(app: MeetingAppInfo): DetectedMeeting | null {
    // Get all browser tabs
    const urls = this.detector.getWindowTabURLs(0); // 0 = all windows

    // Find the first valid meeting URL
    const meetingUrl = urls.find((url) => this.isMeetingURL(url));

    if (!meetingUrl) {
      console.log(
        '[Detection] Browser detected but no meeting URL found, not creating session'
      );
      return null;
    }

    // Found valid meeting URL - create synthetic meeting with URL for ID matching
    return this.createSyntheticMeeting(app, meetingUrl);
  }

  /**
   * Check if URL is a valid meeting URL
   *
   * Valid formats:
   * - meet.google.com/abc-defg-hij (meeting code with hyphens)
   * - zoom.us/j/123456789 or zoom.us/wc/join/123456789
   * - teams.microsoft.com/.../...?meetingId=... (enterprise)
   * - teams.live.com/meet/... or teams.live.com/v2/... (consumer)
   */
  private isMeetingURL(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Google Meet: must have meeting code (not just /new or homepage)
      if (urlObj.hostname === 'meet.google.com') {
        const path = urlObj.pathname.slice(1); // Remove leading /
        // Valid meeting code has hyphens (e.g., abc-defg-hij)
        return path.length >= 3 && path.includes('-');
      }

      // Zoom: must have /j/ (join) or /wc/join/ pattern
      if (urlObj.hostname.includes('zoom.us')) {
        return url.includes('/j/') || url.includes('/wc/join/');
      }

      // Teams: supports both enterprise (teams.microsoft.com) and consumer (teams.live.com)
      if (urlObj.hostname.includes('teams.microsoft.com')) {
        return (
          urlObj.searchParams.has('meetingId') || url.includes('meetingId=')
        );
      }
      if (urlObj.hostname.includes('teams.live.com')) {
        // Teams Live URLs: /meet/... or /v2/ (new interface)
        return url.includes('/meet/') || url.includes('/v2/');
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Create a "synthetic" meeting from mic-based detection
   *
   * Synthetic meetings have windowId=0 because we detected via mic, not window
   * For browser meetings, we include the URL for proper meeting ID matching
   */
  private createSyntheticMeeting(
    app: MeetingAppInfo,
    url?: string
  ): DetectedMeeting {
    return {
      platform: app.platform as 'zoom' | 'meet' | 'teams' | 'slack',
      windowId: 0, // Synthetic window marker
      windowTitle: `${app.appName} Meeting`,
      appName: app.appName,
      url, // Include URL for meeting ID matching (important for manuallyStoppedMeetings)
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      detectionMethod: 'microphone',
    };
  }

  /**
   * Get meeting code from a meeting, either from URL or by querying window tabs
   */
  private getMeetingCode(meeting: DetectedMeeting): string | null {
    // Try URL first
    if (meeting.url) {
      return this.extractMeetingCode(meeting.url);
    }

    // If no URL and we have a real window ID, query the window's tabs
    if (meeting.windowId > 0) {
      const windowUrls = this.detector.getWindowTabURLs(meeting.windowId);
      const meetUrl = windowUrls.find((url) => this.isMeetingURL(url));

      if (meetUrl) {
        return this.extractMeetingCode(meetUrl);
      }
    }

    return null;
  }

  /**
   * Check if two meetings are the same
   *
   * Comparison logic:
   * - For Google Meet: compare meeting codes from URLs or window tabs
   * - For other platforms: compare platform + window title
   * - For synthetic windows: compare platform only
   */
  isSameMeeting(meeting1: DetectedMeeting, meeting2: DetectedMeeting): boolean {
    // Different platforms = different meetings
    if (meeting1.platform !== meeting2.platform) {
      return false;
    }

    // For Google Meet, compare meeting codes (from URL or window tabs)
    if (meeting1.platform === 'meet') {
      // Get meeting codes (will query window tabs if URL not available)
      const code1 = this.getMeetingCode(meeting1);
      const code2 = this.getMeetingCode(meeting2);

      // If both have codes, compare them (this handles tab being moved to new window)
      if (code1 && code2) {
        return code1 === code2;
      }

      // If we couldn't get codes for both, fall through to window ID comparison
    }

    // For synthetic windows (windowId=0), same platform = same meeting
    // (user can only be in one Slack huddle at a time, for example)
    if (meeting1.windowId === 0 || meeting2.windowId === 0) {
      return true; // Same platform, synthetic window
    }

    // For real windows, compare window IDs
    return meeting1.windowId === meeting2.windowId;
  }

  /**
   * Extract Google Meet meeting code from URL
   */
  private extractMeetingCode(url: string): string | null {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'meet.google.com') {
        return null;
      }

      const code = urlObj.pathname.slice(1); // Remove leading /
      // Ensure code has proper format (minimum 2 hyphens)
      const hyphenCount = (code.match(/-/g) || []).length;
      if (hyphenCount < 2) {
        return null;
      }

      return code;
    } catch {
      return null;
    }
  }
}
