import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Auto-updater configuration and management
 *
 * Features:
 * - Automatic update checking on startup
 * - Background download of updates
 * - User notification when update is ready
 * - Configurable update channel (stable/beta)
 */

interface ErrorClassification {
  isTransient: boolean;
  shouldRetry: boolean;
  userMessage?: string;
}

interface RetryState {
  retryCount: number;
  nextRetryTime: number | null;
  lastError: Error | null;
  isRetrying: boolean;
}

export class AutoUpdateService {
  private mainWindow: BrowserWindow | null = null;
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private autoUpdateEnabled: boolean = false;

  // Retry state management
  private retryState: RetryState = {
    retryCount: 0,
    nextRetryTime: null,
    lastError: null,
    isRetrying: false,
  };
  private retryTimeout: NodeJS.Timeout | null = null;

  // Exponential backoff delays: 30s, 1m, 5m, 10m, 10m (~26 min total)
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_DELAYS_MS = [30000, 60000, 300000, 600000, 600000];

  constructor() {
    this.checkAutoUpdateAvailability();
    this.configureUpdater();
    this.setupEventHandlers();
  }

  /**
   * Check if auto-updates are available
   * Auto-updates require app-update.yml which only exists in published builds
   */
  private checkAutoUpdateAvailability(): void {
    // Development mode - no auto-updates
    if (!app.isPackaged) {
      console.log('[AutoUpdate] Disabled in development mode');
      this.autoUpdateEnabled = false;
      return;
    }

    // Check if app-update.yml exists
    const resourcesPath = process.resourcesPath;
    const updateConfigPath = path.join(resourcesPath, 'app-update.yml');

    if (fs.existsSync(updateConfigPath)) {
      console.log('[AutoUpdate] Enabled - config file found');
      this.autoUpdateEnabled = true;
    } else {
      console.log(
        '[AutoUpdate] Disabled - app-update.yml not found (local build)'
      );
      this.autoUpdateEnabled = false;
    }
  }

  /**
   * Configure auto-updater settings
   */
  private configureUpdater(): void {
    // Enable auto-download - updates download automatically in background
    autoUpdater.autoDownload = true;

    // Install automatically on app quit
    autoUpdater.autoInstallOnAppQuit = true;

    // Enable logging for debugging
    autoUpdater.logger = console;

    console.log('[AutoUpdate] Configured - Current version:', app.getVersion());
  }

  /**
   * Set the main window reference for sending notifications
   */
  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Setup event handlers for auto-updater
   */
  private setupEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdate] Checking for updates...');
      // No UI notification - users don't need to see this
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdate] Update available:', info.version);

      // Success - reset any retry state
      this.resetRetryState();

      this.notifyRenderer('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log(
        '[AutoUpdate] No updates available. Current version:',
        info.version
      );

      // Success - reset any retry state
      this.resetRetryState();

      // Notify renderer so UI can update (e.g., Settings "Check for Updates" button)
      this.notifyRenderer('update-not-available');
    });

    autoUpdater.on('error', (error) => {
      console.error('[AutoUpdate] Error:', error);

      const classification = this.classifyUpdateError(error);

      if (classification.isTransient && classification.shouldRetry) {
        this.handleTransientError(error);
      } else {
        this.handlePermanentError(error, classification.userMessage);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(
        `[AutoUpdate] Download progress: ${progressObj.percent.toFixed(2)}%`
      );
      this.notifyRenderer('update-download-progress', {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdate] Update downloaded:', info.version);
      this.notifyRenderer('update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });
  }

  /**
   * Classify update error as transient or permanent
   */
  private classifyUpdateError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase();

    // Transient errors (retry silently)
    if (message.includes('503') || message.includes('429')) {
      return { isTransient: true, shouldRetry: true };
    }
    if (
      message.includes('timeout') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('econnreset')
    ) {
      return { isTransient: true, shouldRetry: true };
    }

    // Permanent errors (show immediately)
    if (message.includes('404')) {
      return {
        isTransient: false,
        shouldRetry: false,
        userMessage: 'Update configuration error. Please contact support.',
      };
    }
    if (message.includes('401') || message.includes('403')) {
      return {
        isTransient: false,
        shouldRetry: false,
        userMessage: 'Update authentication failed. Please reinstall the app.',
      };
    }

    // Default: treat as transient for better UX
    return { isTransient: true, shouldRetry: true };
  }

  /**
   * Handle transient error with exponential backoff retry
   */
  private handleTransientError(error: Error): void {
    // Check if max retries exceeded
    if (this.retryState.retryCount >= this.MAX_RETRY_ATTEMPTS) {
      console.error('[AutoUpdate] Max retries exceeded, showing error to user');
      this.notifyRenderer('update-error', {
        message:
          'Unable to check for updates. Please check your internet connection.',
      });
      this.resetRetryState();
      return;
    }

    // Schedule retry with exponential backoff
    const delay = this.RETRY_DELAYS_MS[this.retryState.retryCount];

    this.retryState.retryCount++;
    this.retryState.nextRetryTime = Date.now() + delay;
    this.retryState.lastError = error;
    this.retryState.isRetrying = true;

    console.warn(
      `[AutoUpdate] Transient error (attempt ${this.retryState.retryCount}/${this.MAX_RETRY_ATTEMPTS}):`,
      error.message,
      `Retrying silently in ${delay / 1000}s...`
    );

    if (this.retryTimeout) clearTimeout(this.retryTimeout);

    this.retryTimeout = setTimeout(() => {
      this.executeRetry();
    }, delay);
  }

  /**
   * Execute silent retry attempt
   */
  private async executeRetry(): Promise<void> {
    console.log('[AutoUpdate] Executing silent retry...');

    this.retryTimeout = null;
    // Keep isRetrying = true during the check to suppress UI notifications

    try {
      await autoUpdater.checkForUpdates();
      console.log('[AutoUpdate] Silent retry succeeded');
      this.resetRetryState();
    } catch (error) {
      console.error('[AutoUpdate] Silent retry failed:', error);
      // isRetrying stays true, will be handled by error handler
    }
  }

  /**
   * Handle permanent error (show to user immediately)
   */
  private handlePermanentError(error: Error, userMessage?: string): void {
    console.error('[AutoUpdate] Permanent error:', error.message);
    this.notifyRenderer('update-error', {
      message: userMessage || error.message,
    });
    this.resetRetryState();
  }

  /**
   * Reset retry state
   */
  private resetRetryState(): void {
    this.retryState = {
      retryCount: 0,
      nextRetryTime: null,
      lastError: null,
      isRetrying: false,
    };
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  /**
   * Clear retry state (public method for user-initiated retries)
   */
  public clearRetryState(): void {
    console.log('[AutoUpdate] Clearing retry state (user-initiated)');
    this.resetRetryState();
  }

  /**
   * Send notification to all renderer processes (main window, dashboard, etc.)
   */
  private notifyRenderer(event: string, data?: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(`auto-updater:${event}`, data);
      }
    });
  }

  /**
   * Start periodic update checks
   * @param intervalMinutes Interval between checks in minutes (default: 60)
   */
  public startPeriodicChecks(intervalMinutes: number = 60): void {
    // Skip if auto-updates are not available
    if (!this.autoUpdateEnabled) {
      console.log('[AutoUpdate] Skipping periodic checks - not available');
      return;
    }

    // Initial check after 10 seconds
    setTimeout(() => {
      this.checkForUpdates();
    }, 10000);

    // Periodic checks
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    this.updateCheckInterval = setInterval(
      () => {
        this.checkForUpdates();
      },
      intervalMinutes * 60 * 1000
    );

    console.log(
      `[AutoUpdate] Periodic checks started (every ${intervalMinutes} minutes)`
    );
  }

  /**
   * Stop periodic update checks
   */
  public stopPeriodicChecks(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }

    // Clear retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    console.log('[AutoUpdate] Periodic checks stopped');
  }

  /**
   * Manually check for updates
   */
  public async checkForUpdates(): Promise<void> {
    // Skip if auto-updates are not available (e.g., dev mode)
    if (!this.autoUpdateEnabled) {
      console.log('[AutoUpdate] Skipping check - not available');
      // Notify UI so "Checking..." button resets
      this.notifyRenderer('update-not-available');
      return;
    }

    // Skip if currently in retry backoff
    if (this.retryState.isRetrying) {
      console.log('[AutoUpdate] Skipping check - retry in progress');
      return;
    }

    // Clear stale retry state (e.g., after computer sleep)
    if (this.retryState.retryCount > 0 && this.retryState.nextRetryTime) {
      const now = Date.now();
      if (now > this.retryState.nextRetryTime + 60000) {
        console.log(
          '[AutoUpdate] Clearing stale retry state (likely computer slept)'
        );
        this.resetRetryState();
      }
    }

    try {
      console.log('[AutoUpdate] Manually checking for updates...');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('[AutoUpdate] Failed to check for updates:', error);
    }
  }

  /**
   * Quit the app and install the downloaded update.
   * Handles macOS menu bar app cleanup properly.
   *
   * For menu bar apps, we must:
   * 1. Set app.isQuitting = true to allow windows to close
   * 2. Remove window-all-closed listener to prevent interference
   * 3. Destroy the tray/menu bar (keeps app running otherwise)
   * 4. Destroy all browser windows
   * 5. Call quitAndInstall inside setImmediate for proper cleanup
   *
   * @see https://github.com/electron-userland/electron-builder/issues/1604
   */
  public quitAndInstall(): void {
    console.log('[AutoUpdate] Initiating quit and install...');

    // Use setImmediate to ensure any pending operations complete
    setImmediate(async () => {
      try {
        // Import getMenuBarService dynamically to avoid circular dependency
        const { getMenuBarService } = await import('../main');
        // 1. Set quitting flag to allow windows to actually close
        app.isQuitting = true;

        // 2. Remove window-all-closed listener to prevent interference
        app.removeAllListeners('window-all-closed');

        // 3. Destroy the tray/menu bar (this keeps the app running otherwise)
        const menuBarService = getMenuBarService();
        if (menuBarService) {
          console.log('[AutoUpdate] Destroying menu bar service...');
          menuBarService.destroy();
        }

        // 4. Close all browser windows
        const windows = BrowserWindow.getAllWindows();
        console.log(`[AutoUpdate] Closing ${windows.length} window(s)...`);
        windows.forEach((win) => {
          win.removeAllListeners('close');
          win.destroy();
        });

        // 5. Now call quitAndInstall - the app should fully quit and restart
        console.log('[AutoUpdate] Calling autoUpdater.quitAndInstall()...');
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        console.error('[AutoUpdate] Error during quit and install:', error);
        // Fallback: attempt direct quitAndInstall without cleanup
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }

  /**
   * Check if app is in development mode
   */
  public isDev(): boolean {
    return !app.isPackaged;
  }
}

// Export singleton instance
export const autoUpdateService = new AutoUpdateService();
