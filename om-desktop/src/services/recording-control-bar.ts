import { BrowserWindow, screen } from 'electron';
import { RecordingState } from './meeting-orchestrator';
import type { WindowBounds } from '../native-window-detector';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { generateControlBarHTML } from './control-bar-template';

const execAsync = promisify(exec);

/**
 * RecordingControlBar - Persistent control bar for meeting recordings
 *
 * Shows at top of screen during meetings with start/stop controls and status.
 *
 * **Design Decision: data: URL Approach**
 *
 * This control bar uses inline HTML via data: URLs instead of loading from a file.
 * This approach was chosen because:
 * - Simpler deployment: No separate HTML file to bundle
 * - Single source of truth: HTML, CSS, and JS in one place
 * - No preload script needed: We inject APIs via executeJavaScript
 *
 * **Trade-off:** The HTML cannot use traditional preload scripts, so we use a
 * CustomEvent → console.info IPC pattern for button clicks.
 *
 * **IPC Pattern:**
 * 1. HTML button click → dispatch CustomEvent
 * 2. HTML listener forwards to console.info
 * 3. Main process intercepts console-message event
 * 4. Calls registered callback (onStartCallback/onStopCallback)
 */

export class RecordingControlBar {
  private window: BrowserWindow | null = null;
  private currentState: RecordingState | null = null;
  private isOnRecord: boolean = true; // Track current recording state
  private onStartCallback: (() => void) | null = null;
  private onStopCallback: (() => void) | null = null;
  private onDismissCallback: (() => void) | null = null;
  private onToggleCallback: (() => void) | null = null;
  private onEndMeetingCallback: (() => void) | null = null;
  private consoleMessageListener:
    | ((event: Event, level: number, message: string) => void)
    | null = null;
  private meetingWindowId: number | null = null;
  private meetingAppName: string | null = null;
  private meetingUrl: string | null = null;

  /**
   * Get the display for a given window bounds
   * Falls back to cursor's display, then primary display
   */
  private getDisplayForWindow(windowBounds?: WindowBounds): Electron.Display {
    // Try to get display where the meeting window is located
    if (windowBounds && windowBounds.width > 0 && windowBounds.height > 0) {
      try {
        const display = screen.getDisplayMatching(windowBounds);
        console.log("[ControlBar] Using meeting window's display:", display.id);
        return display;
      } catch (error) {
        console.log(
          '[ControlBar] Failed to match window bounds to display:',
          error
        );
      }
    }

    // Fallback 1: Use cursor's display
    try {
      const cursorPos = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPos);
      console.log("[ControlBar] Using cursor's display:", display.id);
      return display;
    } catch (error) {
      console.log('[ControlBar] Failed to get cursor display:', error);
    }

    // Fallback 2: Use primary display
    console.log('[ControlBar] Using primary display as final fallback');
    return screen.getPrimaryDisplay();
  }

  /**
   * Calculate position for control bar - always centered on meeting window's monitor
   * Option 1: Fresh position for each meeting, no saved preferences
   */
  private calculatePosition(windowBounds?: WindowBounds): {
    x: number;
    y: number;
  } {
    // Get the display where the meeting window is located
    const display = this.getDisplayForWindow(windowBounds);
    const { x, y, width } = display.workArea;

    // Center control bar horizontally on the display, 10px from top
    const controlBarX = x + Math.floor((width - 500) / 2);
    const controlBarY = y + 10;

    console.log('[ControlBar] Calculated position on display:', {
      x: controlBarX,
      y: controlBarY,
      displayId: display.id,
    });
    return { x: controlBarX, y: controlBarY };
  }

  /**
   * Activate the meeting window and switch to the meeting tab
   */
  private async activateMeetingWindow(): Promise<void> {
    if (!this.meetingAppName || !this.meetingUrl) {
      console.log('[ControlBar] No meeting window info available:', {
        appName: this.meetingAppName,
        url: this.meetingUrl,
      });
      return;
    }

    try {
      console.log('[ControlBar] Activating meeting tab:', {
        appName: this.meetingAppName,
        url: this.meetingUrl,
      });

      // Extract the meeting code from the URL (e.g., abc-def-ghi from meet.google.com/abc-def-ghi)
      // We'll match on the meeting code part only, not query params
      let searchPattern = this.meetingUrl;
      const meetCodeMatch = this.meetingUrl.match(
        /meet\.google\.com\/([a-z-]{3,})/
      );
      if (meetCodeMatch && meetCodeMatch[1]) {
        searchPattern = `meet.google.com/${meetCodeMatch[1]}`;
      }

      console.log('[ControlBar] Search pattern:', searchPattern);

      // Determine browser type and use appropriate AppleScript
      let script = '';

      if (
        this.meetingAppName === 'Google Chrome' ||
        this.meetingAppName === 'Chromium'
      ) {
        // Chrome/Chromium: Find tab with matching URL and activate it
        script = `
tell application "${this.meetingAppName}"
  activate
  set theUrl to "${searchPattern}"
  set found to false
  set foundWindow to 0
  set foundTab to 0
  set windowIndex to 1
  repeat with w in windows
    set tabIndex to 1
    repeat with t in tabs of w
      if URL of t contains theUrl then
        set active tab index of w to tabIndex
        set index of w to 1
        set found to true
        set foundWindow to windowIndex
        set foundTab to tabIndex
        exit repeat
      end if
      set tabIndex to tabIndex + 1
    end repeat
    if found then exit repeat
    set windowIndex to windowIndex + 1
  end repeat
  return "Found: " & found & ", Window: " & foundWindow & ", Tab: " & foundTab
end tell`;
      } else if (this.meetingAppName === 'Safari') {
        // Safari: Find tab with matching URL and activate it
        script = `
tell application "Safari"
  activate
  set theUrl to "${searchPattern}"
  set found to false
  set foundWindow to 0
  set foundTab to 0
  set windowIndex to 1
  repeat with w in windows
    set tabIndex to 1
    repeat with t in tabs of w
      if URL of t contains theUrl then
        set current tab of w to t
        set index of w to 1
        set found to true
        set foundWindow to windowIndex
        set foundTab to tabIndex
        exit repeat
      end if
      set tabIndex to tabIndex + 1
    end repeat
    if found then exit repeat
    set windowIndex to windowIndex + 1
  end repeat
  return "Found: " & found & ", Window: " & foundWindow & ", Tab: " & foundTab
end tell`;
      } else {
        // Fallback: just activate the app
        console.log(
          '[ControlBar] Using fallback activation for:',
          this.meetingAppName
        );
        script = `tell application "${this.meetingAppName}" to activate`;
      }

      console.log('[ControlBar] Executing AppleScript...');

      // Execute the AppleScript
      const { stdout, stderr } = await execAsync(
        `osascript -e '${script.replace(/'/g, "'\\''")}'`
      );

      console.log('[ControlBar] AppleScript result:', { stdout, stderr });
      console.log('[ControlBar] Meeting tab activation completed');
    } catch (error) {
      console.error('[ControlBar] Failed to activate meeting tab:', error);
      if (error instanceof Error) {
        console.error('[ControlBar] Error details:', {
          message: error.message,
          stack: error.stack,
        });
      }
    }
  }

  /**
   * Show the control bar
   * Returns a Promise that resolves when the window is fully ready
   */
  async show(
    meetingTitle: string,
    state: RecordingState,
    windowBounds?: WindowBounds,
    windowId?: number,
    appName?: string,
    meetingUrl?: string
  ): Promise<void> {
    console.log('[ControlBar] show() called with:', {
      meetingTitle,
      state,
      windowBounds,
      windowId,
      appName,
      meetingUrl,
    });

    // Store meeting window info for activation
    if (windowId !== undefined) this.meetingWindowId = windowId;
    if (appName !== undefined) this.meetingAppName = appName;
    if (meetingUrl !== undefined) this.meetingUrl = meetingUrl;

    if (this.window && !this.window.isDestroyed()) {
      console.log('[ControlBar] Window already exists, updating state');
      // Update existing window
      this.updateState(state);
      return;
    }

    console.log('[ControlBar] Creating new control bar window');
    this.currentState = state;

    // Calculate position based on meeting window location and saved preferences
    const position = this.calculatePosition(windowBounds);

    // Create a persistent control bar at the calculated position
    this.window = new BrowserWindow({
      width: 500,
      height: 64,
      x: position.x,
      y: position.y,
      title: 'Om Control Bar', // Used to identify window and skip during auth reload
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true, // Allow closing
      hasShadow: false,
      roundedCorners: true,
      focusable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // No preload needed - we inject APIs via executeJavaScript since we use data: URLs
      },
    });

    // Set a higher alwaysOnTop level to appear above other apps' control bars (like Notion)
    // The constructor's alwaysOnTop: true defaults to 'floating' level, but other apps may use
    // higher levels. 'pop-up-menu' is a good middle ground - above most app windows but below
    // system UI. If this isn't enough, 'screen-saver' is the highest level.
    this.window.setAlwaysOnTop(true, 'pop-up-menu');

    // Make control bar visible on all macOS Spaces/workspaces
    // visibleOnFullScreen ensures it appears even when a fullscreen app is active
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Don't prevent app from quitting when this window is open
    this.window.on('close', (event) => {
      // Just destroy the window, don't prevent closing
      event.preventDefault();
      if (this.window && !this.window.isDestroyed()) {
        this.window.destroy();
        this.window = null;
      }
    });

    // Create a promise that resolves when the window is fully initialized
    const windowReadyPromise = new Promise<void>((resolve) => {
      // Expose IPC to the window for button clicks (since preload doesn't work with data URLs)
      this.window!.webContents.on('did-finish-load', () => {
        console.log(
          '[ControlBar] WebContents finished loading, injecting API...'
        );
        // Inject the IPC bridge using console messages (not hash navigation which is blocked on data URLs)
        this.window?.webContents
          .executeJavaScript(
            `
          window.controlBarAPI = {
            startRecording: () => {
              // Use a special console message that won't be caught by the override
              const event = new CustomEvent('control-bar-action', { detail: 'start-recording' });
              window.dispatchEvent(event);
            },
            stopRecording: () => {
              const event = new CustomEvent('control-bar-action', { detail: 'stop-recording' });
              window.dispatchEvent(event);
            },
            dismissMeeting: () => {
              const event = new CustomEvent('control-bar-action', { detail: 'dismiss-meeting' });
              window.dispatchEvent(event);
            },
            toggleRecord: () => {
              const event = new CustomEvent('control-bar-action', { detail: 'toggle-record' });
              window.dispatchEvent(event);
            },
            endMeeting: () => {
              const event = new CustomEvent('control-bar-action', { detail: 'end-meeting' });
              window.dispatchEvent(event);
            },
            switchToMeeting: () => {
              const event = new CustomEvent('control-bar-action', { detail: 'switch-to-meeting' });
              window.dispatchEvent(event);
            },
            selectMeeting: () => {
              const event = new CustomEvent('control-bar-action', { detail: 'select-meeting' });
              window.dispatchEvent(event);
            }
          };
          // Wait for init to complete by checking if updateButtonsFromMain exists
          let attempts = 0;
          const checkInit = () => {
            if (typeof window.updateButtonsFromMain === 'function') {
              return true;
            }
            attempts++;
            return attempts > 20; // Give up after 1 second (20 * 50ms)
          };

          const waitForInit = () => {
            if (checkInit()) {
              return true;
            } else {
              return new Promise(resolve => setTimeout(() => resolve(waitForInit()), 50));
            }
          };

          waitForInit();
        `
          )
          .then((result) => {
            console.log(
              '[ControlBar] API injection and init completed, result:',
              result
            );
            resolve();
          })
          .catch((error) => {
            console.error('[ControlBar] API injection failed:', error);
            resolve(); // Resolve anyway to prevent hanging
          });
      });
    });

    // Listen for console messages to handle button clicks
    // Store reference so we can remove it later to prevent memory leaks
    this.consoleMessageListener = (_event, level, message) => {
      if (message.startsWith('CONTROL_BAR_ACTION:')) {
        const action = message.replace('CONTROL_BAR_ACTION:', '');
        console.log('[ControlBar] Received action:', action);

        if (action === 'start-recording') {
          console.log('[ControlBar] Start recording requested');
          if (this.onStartCallback) {
            this.onStartCallback();
          }
        } else if (action === 'stop-recording') {
          console.log('[ControlBar] Stop recording requested');
          if (this.onStopCallback) {
            this.onStopCallback();
          }
        } else if (action === 'dismiss-meeting') {
          console.log('[ControlBar] Dismiss meeting requested');
          if (this.onDismissCallback) {
            this.onDismissCallback();
          }
        } else if (action === 'toggle-record') {
          console.log('[ControlBar] Toggle record requested');
          // Flip the state immediately for responsive UI
          this.isOnRecord = !this.isOnRecord;
          // Update UI immediately
          this.updateState(this.currentState || RecordingState.RECORDING);
          if (this.onToggleCallback) {
            this.onToggleCallback();
          }
        } else if (action === 'end-meeting') {
          console.log('[ControlBar] End meeting requested');
          if (this.onEndMeetingCallback) {
            this.onEndMeetingCallback();
          }
        } else if (action === 'switch-to-meeting') {
          console.log('[ControlBar] Switch to meeting requested');
          this.activateMeetingWindow().catch((error) => {
            console.error(
              '[ControlBar] Failed to activate meeting window:',
              error
            );
          });
        }
      }
    };
    // @ts-expect-error - console-message is a valid Electron event but types don't include it in overload
    this.window.webContents.on('console-message', this.consoleMessageListener);

    // Create HTML content for the control bar
    const html = generateControlBarHTML(meetingTitle, state);

    this.window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );

    // Don't show on ready-to-show - wait for JS initialization to complete
    // This prevents flash of default HTML state (wave icon) before updateButtons runs

    // Prevent the window from being focused
    this.window.on('focus', () => {
      this.window?.blur();
    });

    // Wait for window to be fully initialized before returning
    console.log('[ControlBar] Waiting for window to be fully initialized...');
    await windowReadyPromise;
    console.log('[ControlBar] Window is ready!');

    // Show window only after JS initialization complete (prevents flash of wrong state)
    this.window?.show();
  }

  /**
   * Update the recording state
   */
  updateState(state: RecordingState): void {
    console.log(
      '[ControlBar] Updating state to:',
      state,
      'isOnRecord:',
      this.isOnRecord
    );
    this.currentState = state;
    if (this.window && !this.window.isDestroyed()) {
      // Since preload doesn't work with data URLs, we inject the state update directly
      this.window.webContents
        .executeJavaScript(
          `
        if (typeof window.updateButtonsFromMain === 'function') {
          console.log('[ControlBar UI] Updating buttons from main, state:', '${state}', 'isOnRecord:', ${this.isOnRecord});
          window.updateButtonsFromMain('${state}', ${this.isOnRecord});
        } else {
          console.log('[ControlBar UI] updateButtonsFromMain not ready yet, state:', '${state}');
        }
      `
        )
        .catch((error) => {
          console.error('[ControlBar] Failed to update state:', error);
        });
    }
  }

  /**
   * Show processing state in control bar with a message
   * Used when meeting ends to show "Processing your meeting..."
   */
  showProcessing(message: string): void {
    console.log('[ControlBar] showProcessing called with:', message);
    if (this.window && !this.window.isDestroyed()) {
      const safeMessage = JSON.stringify(message);
      this.window.webContents
        .executeJavaScript(
          `
        if (typeof window.showProcessingFromMain === 'function') {
          console.log('[ControlBar UI] Showing processing state');
          window.showProcessingFromMain(${safeMessage});
        } else {
          console.log('[ControlBar UI] showProcessingFromMain not ready yet');
        }
      `
        )
        .catch((error) => {
          console.error('[ControlBar] Failed to show processing:', error);
        });
    }
  }

  /**
   * Schedule auto-close of control bar after specified delay
   * Used to close control bar after showing processing message
   */
  scheduleAutoClose(delayMs: number = 3000): void {
    console.log('[ControlBar] Scheduling auto-close in', delayMs, 'ms');
    setTimeout(() => {
      console.log('[ControlBar] Auto-close timer fired');
      this.close();
    }, delayMs);
  }

  /**
   * Update the meeting title displayed in the control bar
   * Uses JSON.stringify for safe escaping to prevent XSS injection
   */
  updateTitle(newTitle: string): void {
    console.log('[ControlBar] Updating title to:', newTitle);
    if (this.window && !this.window.isDestroyed()) {
      // Use JSON.stringify for comprehensive escaping of all special characters
      // This prevents XSS via backticks, newlines, template expressions, etc.
      const safeTitle = JSON.stringify(newTitle);
      this.window.webContents
        .executeJavaScript(
          `
        const titleElement = document.getElementById('title');
        if (titleElement) {
          titleElement.textContent = ${safeTitle};
        } else {
          console.log('[ControlBar UI] Title element not found');
        }
      `
        )
        .catch((error) => {
          console.error('[ControlBar] Failed to update title:', error);
        });
    }
  }

  /**
   * Close the control bar
   */
  close(): void {
    console.log('[ControlBar] close() called');
    if (this.window && !this.window.isDestroyed()) {
      // Remove console message listener to prevent memory leaks
      if (this.consoleMessageListener) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.window.webContents as any).removeListener(
          'console-message',
          this.consoleMessageListener
        );
        this.consoleMessageListener = null;
      }
      this.window.close();
      this.window = null;
    }
    this.currentState = null;
    this.isTabSwitched = false;
    // Reset to "on the record" for next meeting
    this.isOnRecord = true;
  }

  /**
   * Check if control bar is currently showing
   */
  isShowing(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  /**
   * Set callback for start recording button
   */
  onStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  /**
   * Set callback for stop recording button
   */
  onStop(callback: () => void): void {
    this.onStopCallback = callback;
  }

  /**
   * Set callback for dismiss button
   */
  onDismiss(callback: () => void): void {
    this.onDismissCallback = callback;
  }

  /**
   * Set callback for toggle record button
   */
  onToggle(callback: () => void): void {
    this.onToggleCallback = callback;
  }

  /**
   * Set callback for end meeting button
   */
  onEndMeeting(callback: () => void): void {
    this.onEndMeetingCallback = callback;
  }
}

/**
 * Singleton instance
 */
let controlBar: RecordingControlBar | null = null;

export function getRecordingControlBar(): RecordingControlBar {
  if (!controlBar) {
    controlBar = new RecordingControlBar();
  }
  return controlBar;
}
