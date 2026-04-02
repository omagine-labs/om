import {
  app,
  Tray,
  Menu,
  shell,
  BrowserWindow,
  screen,
  nativeTheme,
} from 'electron';
import type {
  MeetingOrchestrator,
  MeetingSession,
} from './meeting-orchestrator';
import { RecordingState } from './meeting-orchestrator';
import { IconGenerator } from '../utils/icon-generator';
import { authService } from '../lib/auth';
import type { User } from '@supabase/supabase-js';
import { config } from '../lib/config';
// Native menu bar appearance module disabled - it creates a hidden NSStatusItem
// that causes spacing issues with our tray icon. Using nativeTheme instead.
// import { getMenuBarAppearance } from '../native-menu-bar-appearance';

/**
 * MenuBarService - Manages the macOS menu bar integration
 */
export class MenuBarService {
  private tray: Tray | null = null;
  private orchestrator: MeetingOrchestrator;
  private updateInterval: NodeJS.Timeout | null = null;
  private iconGenerator: IconGenerator;
  private currentUser: User | null = null;
  private settingsWindowOpener: (() => void) | null = null;

  constructor(orchestrator: MeetingOrchestrator) {
    this.orchestrator = orchestrator;
    this.iconGenerator = new IconGenerator();
  }

  /**
   * Set the settings window opener callback
   */
  setSettingsWindowOpener(opener: () => void): void {
    this.settingsWindowOpener = opener;
  }

  /**
   * Initialize the menu bar tray
   */
  async initialize(): Promise<void> {
    if (this.tray) {
      console.log('[MenuBar] Already initialized');
      return;
    }

    try {
      // Load current user first
      await this.loadCurrentUser();

      // Create tray icon
      console.log('[MenuBar] Creating tray icon...');
      const icon = this.iconGenerator.createIcon('idle');
      console.log('[MenuBar] Icon created:', icon.getSize());

      this.tray = new Tray(icon);
      this.tray.setAutosaveName('om-menu-bar');
      console.log('[MenuBar] Tray object created');

      this.tray.setToolTip('Om - Meeting Recorder');
      console.log('[MenuBar] Tooltip set');

      // Build initial menu
      await this.updateMenu();
      console.log('[MenuBar] Menu updated');

      // Start update loop for recording duration
      this.startUpdateLoop();
      console.log('[MenuBar] Update loop started');

      // Listen for menu bar appearance changes using nativeTheme
      // Note: Native module was disabled because its hidden NSStatusItem caused spacing issues
      nativeTheme.on('updated', () => {
        console.log('[MenuBar] Theme changed, updating icon');
        this.updateMenuNow();
      });

      console.log('[MenuBar] Initialized successfully');
    } catch (error) {
      console.error('[MenuBar] Error during initialization:', error);
    }
  }

  /**
   * Update menu based on current session state
   */
  private async updateMenu(): Promise<void> {
    if (!this.tray) return;

    // Reload current user to ensure auth state is fresh
    await this.loadCurrentUser();

    const session = this.orchestrator.getCurrentSession();

    // Update icon based on state
    const state = this.getStateFromSession(session);
    const icon = this.iconGenerator.createIcon(state);
    this.tray.setImage(icon);

    // Update menu
    const menu = this.buildMenu(session);
    this.tray.setContextMenu(menu);
  }

  /**
   * Get current state from session
   */
  private getStateFromSession(
    session: MeetingSession | null
  ): 'idle' | 'countdown' | 'recording' {
    if (!session) return 'idle';

    console.log('[MenuBar] Session state:', session.state);

    switch (session.state) {
      case RecordingState.MEETING_DETECTED:
        return 'countdown';
      case RecordingState.RECORDING:
        return 'recording';
      case RecordingState.UPLOADING:
      case RecordingState.PROCESSING:
        // Upload happens in background - treat as idle from menu perspective
        return 'idle';
      default:
        console.log('[MenuBar] Unknown state, defaulting to idle');
        return 'idle';
    }
  }

  /**
   * Build menu based on session state
   */
  private buildMenu(session: MeetingSession | null): Menu {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // Check if there's a dismissed meeting that could be resumed
    const hasDismissedMeeting = this.orchestrator.hasDismissedMeeting();

    // Add session-specific menu items
    if (!session) {
      if (hasDismissedMeeting) {
        // Meeting is detected but user dismissed/stopped it
        menuItems.push(
          {
            label: 'Om - Meeting Detected',
            enabled: false,
          },
          { type: 'separator' },
          {
            label: 'Start Recording',
            click: async () => {
              await this.orchestrator.resumeDismissedMeeting();
            },
          },
          { type: 'separator' }
        );
      } else {
        // Truly idle - no meeting detected
        menuItems.push(
          {
            label: 'Om - Ready',
            enabled: false,
          },
          { type: 'separator' },
          {
            label: 'Start Recording',
            click: async () => {
              await this.orchestrator.startManualAudioRecording();
            },
          },
          { type: 'separator' }
        );
      }
    } else if (session.state === RecordingState.MEETING_DETECTED) {
      // Meeting detected state - control bar handles start/stop
      menuItems.push(
        {
          label: 'Om - Meeting Detected',
          enabled: false,
        },
        { type: 'separator' }
      );
    } else if (session.state === RecordingState.RECORDING) {
      // Recording state
      menuItems.push(
        {
          label: 'Om - Recording...',
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Stop Recording',
          click: async () => {
            await this.orchestrator.manualStop();
          },
        },
        { type: 'separator' }
      );
    }
    // UPLOADING/PROCESSING states are handled in background - no menu items needed

    // Add auth-related menu items (same for all states)
    if (this.currentUser) {
      // User is authenticated - show dashboard
      menuItems.push({
        label: 'Dashboard',
        click: async () => {
          await this.openDashboard();
        },
      });
    } else {
      // User is not authenticated - show sign in option
      menuItems.push({
        label: 'Sign In',
        click: () => this.openSignIn(),
      });
    }

    // Add settings option (always present)
    menuItems.push(
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => this.openSettings(),
      }
    );

    // Add quit option (always present)
    menuItems.push(
      { type: 'separator' },
      {
        label: 'Quit Om',
        click: () => app.quit(),
      }
    );

    return Menu.buildFromTemplate(menuItems);
  }

  /**
   * Load current user from auth
   */
  private async loadCurrentUser(): Promise<void> {
    try {
      // authService.getUser() is synchronous and returns cached user
      this.currentUser = authService.getUser();
      console.log(
        '[MenuBar] Current user loaded:',
        this.currentUser?.email || 'Not authenticated'
      );
    } catch (error) {
      console.error('[MenuBar] Error loading current user:', error);
      this.currentUser = null;
    }
  }

  /**
   * Open embedded dashboard window
   * Dashboard now runs as embedded React app with direct Supabase authentication
   */
  async openDashboard(): Promise<void> {
    try {
      // Reload current user to ensure we have the latest auth state
      await this.loadCurrentUser();

      if (!this.currentUser) {
        // No session, user needs to sign in first
        console.log('[MenuBar] No user session, opening sign in');
        this.openSignIn();
        return;
      }

      // Reload window with dashboard URL to prevent flicker
      console.log('[MenuBar] Opening dashboard');
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows.find(
        (win) => !win.isDestroyed() && win.getTitle() !== 'Om Control Bar'
      );
      if (mainWindow) {
        // Ensure window is hidden before reloading to prevent visible flash
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        }

        // Position window on the display where the cursor is (where menu bar was clicked)
        this.positionWindowOnCursorDisplay(mainWindow);

        // Get current URL and update hash to dashboard
        const currentUrl = mainWindow.webContents.getURL();
        const url = new URL(currentUrl);
        url.hash = '#/dashboard';

        // Load with new hash - this prevents flicker by loading correct route from start
        mainWindow.webContents
          .loadURL(url.toString())
          .then(() => {
            mainWindow.show();
            mainWindow.focus();
          })
          .catch((err) => {
            console.error('[MenuBar] Error loading dashboard:', err);
            // Fallback to just showing window
            mainWindow.show();
            mainWindow.focus();
          });
      }
    } catch (error) {
      console.error('[MenuBar] Error opening dashboard:', error);
    }
  }

  /**
   * Open sign in in system browser
   */
  private openSignIn(): void {
    // Open in system browser (OAuth 2.0 recommended approach for desktop apps)
    // User will manually close the tab after seeing success message
    const webAppUrl = config.webApp.url;
    const signInUrl = `${webAppUrl}/login?source=desktop`;
    console.log('[MenuBar] Opening sign in URL:', signInUrl);
    shell.openExternal(signInUrl);
  }

  /**
   * Handle user sign out
   */
  private async handleSignOut(): Promise<void> {
    try {
      console.log('[MenuBar] Signing out...');
      await authService.signOut();
      console.log('[MenuBar] Sign out successful');

      // Main window will handle clearing session state via renderer
      // Update menu to show sign in option
      await this.updateAuthState();
    } catch (error) {
      console.error('[MenuBar] Error during sign out:', error);
    }
  }

  /**
   * Position a window on the display where the cursor is currently located
   */
  private positionWindowOnCursorDisplay(window: BrowserWindow): void {
    try {
      const cursorPos = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPos);
      const { x, y, width, height } = display.workArea;

      // Center window on the display
      const windowBounds = window.getBounds();
      const centerX = x + Math.floor((width - windowBounds.width) / 2);
      const centerY = y + Math.floor((height - windowBounds.height) / 2);

      window.setPosition(centerX, centerY);
      console.log('[MenuBar] Positioned window on cursor display:', {
        displayId: display.id,
        x: centerX,
        y: centerY,
      });
    } catch (error) {
      console.error('[MenuBar] Failed to position window:', error);
      // Window will stay at its current position
    }
  }

  /**
   * Open settings window
   */
  openSettings(): void {
    if (this.settingsWindowOpener) {
      this.settingsWindowOpener();
    } else {
      console.error('[MenuBar] Settings window opener not set');
    }
  }

  /**
   * Start update loop (currently unused but kept for future features)
   */
  private startUpdateLoop(): void {
    // Menu updates are handled via onStateChange callback
    // This interval is kept for potential future features
  }

  /**
   * Force menu update (call this when session state changes)
   */
  updateMenuNow(): void {
    void this.updateMenu();
  }

  /**
   * Update auth state (call this when user signs in/out)
   */
  async updateAuthState(): Promise<void> {
    await this.updateMenu();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }

    console.log('[MenuBar] Destroyed');
  }
}
