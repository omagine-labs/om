import { ipcMain, shell, app } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { config } from '../lib/config';
import { appStore } from '../lib/app-store';
import { authService, sessionPersistence } from '../lib/auth';

/**
 * Register miscellaneous IPC handlers
 */
export function registerMiscHandlers(): void {
  ipcMain.handle('get-web-app-url', async () => {
    return config.webApp.url;
  });

  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // Remember Me preference handlers
  ipcMain.handle('settings:get-remember-me', () => {
    return appStore.getRememberMe();
  });

  ipcMain.handle('settings:set-remember-me', async (_event, value: boolean) => {
    try {
      appStore.setRememberMe(value);

      // If enabling rememberMe, persist the current session
      if (value) {
        const session = await authService.getSession();
        if (session) {
          sessionPersistence.save(session);
          console.log('[Settings] RememberMe enabled, session persisted');
        } else {
          console.log(
            '[Settings] RememberMe enabled, but no session to persist'
          );
        }
      } else {
        // If disabling rememberMe, clear persistent session but keep in-memory
        sessionPersistence.clear();
        console.log(
          '[Settings] RememberMe disabled, persistent session cleared'
        );
      }

      return { success: true };
    } catch (error) {
      console.error('[Settings] Error setting rememberMe:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Support: Report issue handler
  // Sends user description and diagnostic breadcrumbs to Sentry
  ipcMain.handle(
    'support:report-issue',
    async (_event, userDescription: string) => {
      try {
        console.log('[Support] User reporting issue:', userDescription);

        // Set context for the user's report (appears in dedicated section in Sentry)
        Sentry.setContext('user_report', {
          description: userDescription,
          app_version: app.getVersion(),
          platform: process.platform,
          reported_at: new Date().toISOString(),
        });

        // Use captureException to create a proper Issue in Sentry
        // captureMessage with @sentry/electron can be unreliable for Issues
        const reportError = new Error(`User Report: ${userDescription}`);
        reportError.name = 'UserReport';

        Sentry.captureException(reportError, {
          level: 'warning',
          tags: {
            report_type: 'user_submitted',
          },
        });

        // Flush to ensure event is sent before returning
        await Sentry.flush(2000);

        return { success: true };
      } catch (error) {
        console.error('[Support] Error reporting issue:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );
}
