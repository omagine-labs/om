import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { NativeRecorder } from './native-recorder';
import { WindowDetector } from './native-window-detector';
import { MeetingOrchestrator } from './services/meeting-orchestrator';
import { MenuBarService } from './services/menu-bar';
import { getRecordingControlBar } from './services/recording-control-bar';
import { config } from './lib/config';
import { autoUpdateService } from './lib/auto-updater';
import { appStore } from './lib/app-store';
import { initSentryMain } from './lib/sentry';

// Expose environment to renderer via process.env (preload can read this)
process.env.OM_ENVIRONMENT = config.environment;

// Initialize Sentry BEFORE app ready (to capture early errors)
initSentryMain();

// IPC Handlers
import {
  registerAuthHandlers,
  setupAuthStateNotifications,
} from './ipc/auth-handlers';
import { registerApiHandlers } from './ipc/api-handlers';
import { registerRecordingHandlers } from './ipc/recording-handlers';
import { registerWindowDetectorHandlers } from './ipc/window-detector-handlers';
import { registerOrchestratorHandlers } from './ipc/orchestrator-handlers';
import { registerUpdaterHandlers } from './ipc/updater-handlers';
import { registerMiscHandlers } from './ipc/misc-handlers';
import { registerPermissionHandlers } from './ipc/permission-handlers';
import { registerUploadHandlers } from './ipc/upload-handlers';

// New auth system
import { authService, handleDeepLink as handleAuthDeepLink } from './lib/auth';

// Register custom protocol for OAuth callbacks
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('om', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('om');
}

// Handle deep links on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Handle deep links on Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Someone tried to run a second instance, focus our window instead
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle deep link URL from second instance
    const url = commandLine.find((arg) => arg.startsWith('om://'));
    if (url) {
      handleDeepLink(url);
    }
  });
}

async function handleDeepLink(url: string) {
  console.log('[DeepLink] Received URL:', url);
  // Delegate all auth deep links to the new auth system
  await handleAuthDeepLink(url, menuBarService);
}

/**
 * Feature 1: Enable Start at Login
 * Automatically enables "Open at Login" on first launch
 */
function enableStartAtLogin() {
  if (appStore.hasSetLoginItem()) {
    console.log('[App] Login item already set, skipping');
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false, // Show menu bar immediately
    });

    appStore.markLoginItemSet();
    console.log('[App] Enabled "Open at Login" for first-time user');
  } catch (error) {
    console.error('[App] Failed to enable login item:', error);
  }
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Om',
    show: false, // Will show after ready-to-show
    titleBarStyle: 'hidden', // Hide title bar but keep traffic lights (macOS)
    trafficLightPosition: { x: 16, y: 16 }, // Position traffic lights
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the dashboard (single app)
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Prevent HTML <title> tag from overriding our window title
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Prevent window from closing - just hide it instead (menu bar app behavior)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Initialize auto-updater (only in production builds)
  if (!autoUpdateService.isDev()) {
    autoUpdateService.setMainWindow(mainWindow);
    autoUpdateService.startPeriodicChecks(60); // Check every 60 minutes
  } else {
    console.log('[AutoUpdate] Skipped in development mode');
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// NOTE: Moved to combined ready handler below (line ~234)

// Clean up control bar before quitting
app.on('before-quit', () => {
  app.isQuitting = true;
  const controlBar = getRecordingControlBar();
  controlBar.close();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, clicking the Dock icon should focus the main window
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Initialize Native Recorder
const recorder = new NativeRecorder();

// Initialize Window Detector
const windowDetector = new WindowDetector();

// Initialize Meeting Orchestrator
const meetingOrchestrator = new MeetingOrchestrator(windowDetector, recorder);

// Wire up control bar callbacks
const controlBar = getRecordingControlBar();
controlBar.onStart(() => {
  console.log('[Main] Control bar start button clicked');
  void meetingOrchestrator.manualStart();
});
controlBar.onStop(() => {
  console.log('[Main] Control bar stop button clicked');
  void meetingOrchestrator.manualStop();
});
controlBar.onDismiss(() => {
  console.log('[Main] Control bar dismiss button clicked');
  void meetingOrchestrator.manualStop();
});
controlBar.onToggle(() => {
  console.log('[Main] Control bar toggle button clicked');
  void meetingOrchestrator.toggleRecord();
});
controlBar.onEndMeeting(() => {
  console.log('[Main] Control bar end meeting button clicked');
  void meetingOrchestrator.endMeeting();
});

// Initialize Menu Bar Service
let menuBarService: MenuBarService;

/**
 * Get the menu bar service instance for cleanup during quit.
 * Used by auto-updater to destroy the tray before quitAndInstall.
 */
export function getMenuBarService(): MenuBarService | null {
  return menuBarService || null;
}

// Start orchestrator and menu bar when app is ready
app.on('ready', async () => {
  // Validate configuration (ensures environment is detected and config is correct)
  config.validate();

  // Feature 1: Enable Start at Login (first launch only)
  enableStartAtLogin();

  // Register IPC handlers BEFORE creating window to prevent race condition
  // Window renderer may immediately call IPC methods on load
  registerMiscHandlers();
  registerPermissionHandlers();
  registerRecordingHandlers(recorder);
  registerAuthHandlers(null); // Will update with menuBarService later
  registerApiHandlers(); // NEW: API proxy handlers
  registerWindowDetectorHandlers(windowDetector);
  registerOrchestratorHandlers(meetingOrchestrator);
  registerUpdaterHandlers();
  registerUploadHandlers();

  // Initialize new auth service (handles session restoration internally)
  console.log('[App] Initializing auth service');
  await authService.initialize();

  // Create the browser window
  createWindow();

  // Set up auth state notifications to renderer
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    setupAuthStateNotifications(mainWindow.webContents);
  }

  // Request all required permissions at launch
  // This triggers prompts for Screen Recording (system audio) and Microphone
  // Better UX: Get all permissions upfront rather than interrupting user later
  setTimeout(async () => {
    const { requestAllPermissions } = await import('./lib/permissions');
    await requestAllPermissions();
  }, 1000); // Request after 1 second to let app finish initializing

  console.log('[App] Starting meeting orchestrator');
  meetingOrchestrator.start();

  // Initialize menu bar
  menuBarService = new MenuBarService(meetingOrchestrator);

  // Set up settings window opener callback
  // Reload window with settings URL to prevent flicker
  menuBarService.setSettingsWindowOpener(() => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(
      (win) => !win.isDestroyed() && win.getTitle() !== 'Om Control Bar'
    );
    if (mainWindow) {
      // Ensure window is hidden before reloading to prevent visible flash
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      }

      // Position window on cursor display (where menu bar was clicked)
      try {
        const cursorPos = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursorPos);
        const { x, y, width, height } = display.workArea;
        const windowBounds = mainWindow.getBounds();
        const centerX = x + Math.floor((width - windowBounds.width) / 2);
        const centerY = y + Math.floor((height - windowBounds.height) / 2);
        mainWindow.setPosition(centerX, centerY);
      } catch (error) {
        console.error('[Main] Failed to position settings window:', error);
      }

      // Get current URL and update hash to settings
      const currentUrl = mainWindow.webContents.getURL();
      const url = new URL(currentUrl);
      url.hash = '#/settings';

      // Load with new hash - this prevents flicker by loading correct route from start
      mainWindow.webContents
        .loadURL(url.toString())
        .then(() => {
          mainWindow.show();
          mainWindow.focus();
        })
        .catch((err) => {
          console.error('[Main] Error loading settings:', err);
          // Fallback to just showing window
          mainWindow.show();
          mainWindow.focus();
        });
    }
  });

  await menuBarService.initialize();
  console.log('[App] Menu bar initialized');

  // Wire up state change events
  meetingOrchestrator.onStateChange(() => {
    menuBarService.updateMenuNow();
  });

  // Update auth handlers with menuBarService (handlers already registered)
  // Auth handlers need menuBarService to update menu state after auth changes
  registerAuthHandlers(menuBarService);
});
