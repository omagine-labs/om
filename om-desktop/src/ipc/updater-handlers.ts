import { ipcMain } from 'electron';
import { autoUpdateService } from '../lib/auto-updater';

/**
 * Register auto-updater IPC handlers
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check-for-updates', async () => {
    try {
      // User-initiated check clears retry backoff
      autoUpdateService.clearRetryState();
      await autoUpdateService.checkForUpdates();
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error checking for updates:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('updater:quit-and-install', () => {
    try {
      console.log('[IPC] Quit and install requested');
      // Use autoUpdateService.quitAndInstall() which properly handles
      // macOS menu bar app cleanup (destroys tray, windows, etc.)
      autoUpdateService.quitAndInstall();
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error in quit and install:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
