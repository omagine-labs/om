import { ipcMain, systemPreferences, desktopCapturer, shell } from 'electron';

/**
 * Register IPC handlers for permission status checks and requests
 */
export function registerPermissionHandlers(): void {
  // Get current permission status
  ipcMain.handle('permissions:getStatus', async () => {
    try {
      // Check microphone permission
      const microphoneStatus =
        systemPreferences.getMediaAccessStatus('microphone');

      // Check screen recording permission (best effort)
      let screenRecording = false;
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1, height: 1 },
        });
        screenRecording = sources.length > 0;
      } catch {
        screenRecording = false;
      }

      return {
        microphone: microphoneStatus,
        screenRecording,
      };
    } catch (error) {
      console.error('[Permissions] Error getting permission status:', error);
      throw error;
    }
  });

  // Request microphone permission
  ipcMain.handle('permissions:requestMicrophone', async () => {
    try {
      console.log('[Permissions] Requesting microphone permission...');
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('[Permissions] Microphone permission granted:', granted);
      return { success: true, granted };
    } catch (error) {
      console.error(
        '[Permissions] Error requesting microphone permission:',
        error
      );
      return { success: false, error: (error as Error).message };
    }
  });

  // Request screen recording permission
  ipcMain.handle('permissions:requestScreenRecording', async () => {
    try {
      console.log('[Permissions] Requesting screen recording permission...');

      // Import the native recorder to trigger actual screen recording permission
      const { NativeRecorder } = await import('../native-recorder');
      const recorder = new NativeRecorder();

      // Attempt to start recording briefly to trigger the permission prompt
      // This will add the app to the Screen Recording permission list
      try {
        const os = await import('node:os');
        const tmpPath = os.tmpdir() + '/om-permission-test.mp4';
        await recorder.startRecording({
          displayId: 0,
          outputPath: tmpPath,
        });

        // Stop immediately and clean up
        setTimeout(async () => {
          try {
            await recorder.stopRecording();
            // Delete the test file
            const fs = await import('node:fs');
            if (fs.existsSync(tmpPath)) {
              fs.unlinkSync(tmpPath);
            }
          } catch (cleanupError) {
            console.log('[Permissions] Test recording cleanup:', cleanupError);
          }
        }, 100);

        console.log(
          '[Permissions] Screen recording test triggered permission prompt'
        );
      } catch {
        // Expected to fail if permission not granted
        console.log(
          '[Permissions] Screen recording permission not yet granted (expected)'
        );
      }

      // Open System Settings to Screen Recording panel
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      );

      return { success: true, requiresManualEnable: true };
    } catch (error) {
      console.error(
        '[Permissions] Error requesting screen recording permission:',
        error
      );
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('[IPC] Permission handlers registered');
}
