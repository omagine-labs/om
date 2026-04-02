import path from 'node:path';
import { app } from 'electron';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MeetingWindow {
  platform: 'zoom' | 'meet' | 'teams' | 'slack';
  windowId: number;
  windowTitle: string;
  appName: string;
  url?: string;
  bounds: WindowBounds;
}

export interface MeetingAppInfo {
  appName: string;
  bundleId: string;
  platform: string;
  pid: number;
  hasVisibleWindow: boolean;
}

interface NativeBindings {
  getActiveMeetingWindow(): MeetingWindow | null;
  getAllMeetingWindows(): MeetingWindow[];
  isWindowActive(windowId: number): boolean;
  getWindowTabURLs(windowId: number): string[];
  // Microphone-based detection
  isMicrophoneInUse(): boolean;
  getRunningMeetingApps(): MeetingAppInfo[];
  isInMeeting(): MeetingAppInfo | null;
}

/**
 * WindowDetector - Native module wrapper for meeting window detection
 *
 * SECURITY NOTES:
 * - Uses macOS Screen Recording APIs (requires user consent via System Preferences)
 * - Read-only operations: Only retrieves window metadata (title, URL, platform)
 * - NO script injection or code execution in detected windows
 * - Native code uses hardcoded window detection logic only (never interpolates user input)
 * - All operations sandboxed by macOS security model
 * - Never logs URLs that may contain query parameters with tokens
 */
export class WindowDetector {
  private addon: NativeBindings;

  constructor() {
    try {
      // Load the compiled addon
      // Dynamic require is necessary here because the native module path is determined at runtime
      // In development: load from build/Release/
      // In production: load from extraResources (outside the asar)
      const getAddonPath = () => {
        const extraResourcePath = path.join(
          process.resourcesPath,
          'window_detector.node'
        );
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (require('fs').existsSync(extraResourcePath)) {
          return extraResourcePath;
        }
        return path.join(
          app.getAppPath(),
          'build/Release/window_detector.node'
        );
      };
      const addonPath = getAddonPath();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.addon = require(addonPath);
    } catch (error) {
      throw new Error(
        `Failed to load window_detector native addon: ${(error as Error).message}\n` +
          'Make sure to run: npm run rebuild'
      );
    }
  }

  /**
   * Get the currently active meeting window (if any)
   * @returns MeetingWindow object or null if no meeting detected
   */
  getActiveMeetingWindow(): MeetingWindow | null {
    try {
      return this.addon.getActiveMeetingWindow();
    } catch (error) {
      console.error('Error getting active meeting window:', error);
      return null;
    }
  }

  /**
   * Get all open meeting windows
   * @returns Array of MeetingWindow objects
   */
  getAllMeetingWindows(): MeetingWindow[] {
    try {
      return this.addon.getAllMeetingWindows();
    } catch (error) {
      console.error('Error getting all meeting windows:', error);
      return [];
    }
  }

  /**
   * Check if a specific window ID is still active
   * @param windowId - The window ID to check
   * @returns true if window exists, false otherwise
   */
  isWindowActive(windowId: number): boolean {
    try {
      return this.addon.isWindowActive(windowId);
    } catch (error) {
      console.error('Error checking window active status:', error);
      return false;
    }
  }

  /**
   * Get all tab URLs for a specific browser window
   * @param windowId - The window ID to check
   * @returns Array of URLs from all tabs in the window
   */
  getWindowTabURLs(windowId: number): string[] {
    try {
      return this.addon.getWindowTabURLs(windowId);
    } catch (error) {
      console.error('Error getting window tab URLs:', error);
      return [];
    }
  }

  // ============================================================================
  // Microphone-based meeting detection (NEW - more reliable approach)
  // ============================================================================

  /**
   * Check if any microphone is currently in use
   * Uses CoreAudio to detect if audio input device is active
   * @returns true if microphone is in use
   */
  isMicrophoneInUse(): boolean {
    try {
      return this.addon.isMicrophoneInUse();
    } catch (error) {
      console.error('Error checking microphone status:', error);
      return false;
    }
  }

  /**
   * Get list of known meeting apps that are currently running
   * @returns Array of MeetingAppInfo objects
   */
  getRunningMeetingApps(): MeetingAppInfo[] {
    try {
      return this.addon.getRunningMeetingApps();
    } catch (error) {
      console.error('Error getting running meeting apps:', error);
      return [];
    }
  }

  /**
   * High-level meeting detection: Check if user is in a meeting
   * Returns info about the meeting app if:
   * 1. Microphone is in use AND
   * 2. A known meeting app (Slack, Zoom, Teams, browser) is running
   *
   * This is more reliable than window title detection because it doesn't
   * depend on specific window title patterns.
   *
   * @returns MeetingAppInfo if in meeting, null otherwise
   */
  isInMeeting(): MeetingAppInfo | null {
    try {
      return this.addon.isInMeeting();
    } catch (error) {
      console.error('Error checking meeting status:', error);
      return null;
    }
  }
}

// Singleton instance
let detector: WindowDetector | null = null;

export function getWindowDetector(): WindowDetector {
  if (!detector) {
    detector = new WindowDetector();
  }
  return detector;
}
