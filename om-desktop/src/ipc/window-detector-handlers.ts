import { ipcMain } from 'electron';
import type { WindowDetector } from '../native-window-detector';

/**
 * Register window detector IPC handlers
 */
export function registerWindowDetectorHandlers(
  windowDetector: WindowDetector
): void {
  ipcMain.handle('window-detector:get-active-meeting', async () => {
    try {
      const window = windowDetector.getActiveMeetingWindow();
      if (window) {
        return { success: true, data: window };
      }
      return { success: false, error: 'No active meeting window detected' };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(
        '[WindowDetector] Error getting active meeting:',
        errorMessage
      );
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('window-detector:get-all-meetings', async () => {
    try {
      const windows = windowDetector.getAllMeetingWindows();
      return { success: true, data: windows };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(
        '[WindowDetector] Error getting all meetings:',
        errorMessage
      );
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    'window-detector:is-window-active',
    async (_event, windowId: number) => {
      try {
        // Input validation for windowId
        if (!Number.isInteger(windowId)) {
          return {
            success: false,
            error: 'Invalid windowId: must be an integer',
          };
        }
        if (windowId < 0) {
          return {
            success: false,
            error: 'Invalid windowId: must be non-negative',
          };
        }
        if (windowId > 2147483647) {
          // Max safe window ID (2^31-1)
          return {
            success: false,
            error: 'Invalid windowId: exceeds maximum value',
          };
        }

        const isActive = windowDetector.isWindowActive(windowId);
        return { success: true, data: isActive };
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(
          '[WindowDetector] Error checking window active:',
          errorMessage
        );
        return { success: false, error: errorMessage };
      }
    }
  );
}
