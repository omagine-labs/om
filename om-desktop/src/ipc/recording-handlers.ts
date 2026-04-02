import { ipcMain, desktopCapturer, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { NativeRecorder } from '../native-recorder';

/**
 * Get the recordings directory path
 */
function getRecordingsDirectory(): string {
  const userDataPath = app.getPath('userData');
  const recordingsPath = path.join(userDataPath, 'recordings');

  // Create directory if it doesn't exist
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }

  return recordingsPath;
}

/**
 * Register recording-related IPC handlers
 */
export function registerRecordingHandlers(recorder: NativeRecorder): void {
  ipcMain.handle('get-sources', async () => {
    try {
      console.log('[IPC] Getting desktop sources...');
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });

      console.log(`[IPC] Found ${sources.length} sources`);

      // Convert thumbnails to data URLs for proper serialization
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      }));
    } catch (error) {
      console.error('[IPC] Error getting desktop sources:', error);
      console.error(
        '[IPC] This may indicate missing Screen Recording permission (needed for system audio).'
      );
      console.error(
        '[IPC] Grant permission in System Settings > Privacy & Security > Screen Recording'
      );
      throw error;
    }
  });

  ipcMain.handle('get-recordings', async () => {
    try {
      const recordingsPath = getRecordingsDirectory();
      const files = fs.readdirSync(recordingsPath);

      // Filter for video files (.mov) and get their stats
      const recordings = files
        .filter((file) => file.endsWith('.mov'))
        .map((file) => {
          const filePath = path.join(recordingsPath, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
          };
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      return recordings;
    } catch (error) {
      console.error('Error getting recordings:', error);
      return [];
    }
  });

  ipcMain.handle('open-recordings-folder', async () => {
    try {
      const recordingsPath = getRecordingsDirectory();
      await shell.openPath(recordingsPath);
      return { success: true };
    } catch (error) {
      console.error('Error opening recordings folder:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('open-recording', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      console.error('Error opening recording:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Native recording with ScreenCaptureKit
  ipcMain.handle(
    'start-native-recording',
    async (
      _event,
      options: {
        displayId?: number;
        windowId?: number;
        includeSystemAudio?: boolean;
        includeMicrophone?: boolean;
        audioDeviceId?: string;
      }
    ) => {
      try {
        const recordingsPath = getRecordingsDirectory();
        const now = new Date();
        const timestamp = now
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .split('.')[0];
        const filename = `om-recording-${timestamp}.mov`;
        const outputPath = path.join(recordingsPath, filename);

        console.log('Starting native recording with options:', options);
        console.log('Output path:', outputPath);

        const result = await recorder.startRecording({
          displayId: options.displayId || 0,
          windowId: options.windowId,
          outputPath,
        });

        return result.success
          ? { success: true, outputPath }
          : { success: false, error: result.error };
      } catch (error) {
        console.error('Error starting native recording:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('stop-native-recording', async () => {
    try {
      const result = await recorder.stopRecording();
      console.log('Recording stopped:', result);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Return the original file with separate audio tracks
      // No mixing - we need separate tracks for user identification
      console.log('Recording saved with separate audio tracks');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error('Error stopping native recording:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-audio-devices', async () => {
    // Native implementation captures system audio by default
    // Return empty array for now
    return [];
  });

  ipcMain.handle('check-recording-permissions', async () => {
    // Permissions are handled at the OS level when ScreenCaptureKit is first used
    // Return optimistic permissions for now
    return { screenRecording: true, microphone: true };
  });
}
