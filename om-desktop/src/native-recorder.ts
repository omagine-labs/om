import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';

// Import the native addon
// Dynamic require is necessary here because the native module path is determined at runtime
// In development: load from build/Release/
// In production: load from extraResources (outside the asar)
const getAddonPath = () => {
  // Try extraResources first (production)
  const extraResourcePath = path.join(
    process.resourcesPath,
    'screen_recorder.node'
  );
  if (fs.existsSync(extraResourcePath)) {
    return extraResourcePath;
  }
  // Fall back to development path
  return path.join(app.getAppPath(), 'build/Release/screen_recorder.node');
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const screenRecorderAddon = require(getAddonPath());

/**
 * NativeRecorder using ScreenCaptureKit via native Node.js addon
 * Captures screen + system audio on macOS
 */
export class NativeRecorder {
  private recordingPath: string | null = null;

  /**
   * Start recording using native addon (audio-only)
   */
  async startRecording(options: {
    displayId?: number;
    windowId?: number;
    outputPath: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Stop any existing recording
      if (this.isRecording()) {
        await this.stopRecording();
      }

      this.recordingPath = options.outputPath;
      // For audio-only recording, displayId and windowId are not used
      // We pass 0 for both to indicate audio-only mode
      const displayId = 0;
      const windowId = 0;

      console.log('[NativeRecorder] Starting audio-only recording...');
      console.log('[NativeRecorder] Output path:', options.outputPath);

      // Call native addon
      const result = screenRecorderAddon.startRecording(
        displayId,
        windowId,
        options.outputPath
      );

      if (result.success) {
        console.log(
          '[NativeRecorder] Audio-only recording started successfully'
        );
      } else {
        console.error(
          '[NativeRecorder] Failed to start recording:',
          result.error
        );
      }

      return result;
    } catch (error) {
      console.error('[NativeRecorder] Error starting recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stop the current recording
   */
  async stopRecording(): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }> {
    try {
      if (!this.isRecording()) {
        console.log(
          '[NativeRecorder] No active recording to stop (already stopped or never started)'
        );
        return {
          success: false,
          error: 'No active recording',
        };
      }

      console.log('[NativeRecorder] Stopping recording...');

      // Call native addon
      const result = screenRecorderAddon.stopRecording();

      if (result.success) {
        console.log(
          '[NativeRecorder] Recording stopped, file path:',
          result.filePath
        );
        this.recordingPath = null;
      } else {
        console.error(
          '[NativeRecorder] Failed to stop recording:',
          result.error
        );
      }

      return result;
    } catch (error) {
      console.error('[NativeRecorder] Error stopping recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    try {
      return screenRecorderAddon.isRecording();
    } catch {
      return false;
    }
  }

  /**
   * Pause microphone capture (for mic probe detection)
   * This briefly stops the mic to check if other apps are using it
   */
  pauseMicCapture(): { success: boolean; error?: string } {
    try {
      return screenRecorderAddon.pauseMicCapture();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resume microphone capture after a probe
   */
  resumeMicCapture(): { success: boolean; error?: string } {
    try {
      return screenRecorderAddon.resumeMicCapture();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if microphone capture is currently paused
   */
  isMicCapturePaused(): boolean {
    try {
      return screenRecorderAddon.isMicCapturePaused();
    } catch {
      return false;
    }
  }
}
