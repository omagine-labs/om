import { systemPreferences, desktopCapturer } from 'electron';

/**
 * Request all required permissions at app launch
 * This triggers macOS permission prompts for:
 * - Screen Recording (for capturing system audio from meetings)
 * - Microphone (for recording your voice)
 */
export async function requestAllPermissions(): Promise<void> {
  console.log('[Permissions] Requesting all permissions at launch...');

  try {
    // 1. Request Screen Recording permission
    // Trigger by attempting to get desktop sources
    await requestScreenRecordingPermission();

    // 2. Request Microphone permission
    // Trigger by checking/requesting microphone access
    await requestMicrophonePermission();

    console.log('[Permissions] All permission requests initiated');
  } catch (error) {
    console.error('[Permissions] Error requesting permissions:', error);
  }
}

/**
 * Request Screen Recording permission
 * macOS will prompt the user to grant permission in System Settings
 * Note: We need Screen Recording permission to capture system audio from meetings
 */
async function requestScreenRecordingPermission(): Promise<void> {
  try {
    console.log(
      '[Permissions] Requesting Screen Recording permission (for system audio)...'
    );

    // Calling getSources() triggers the Screen Recording permission prompt
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }, // Minimal size to reduce overhead
    });

    console.log('[Permissions] Screen Recording permission requested');
  } catch (error) {
    console.error('[Permissions] Error requesting Screen Recording:', error);
  }
}

/**
 * Request Microphone permission
 * macOS will prompt the user to grant permission
 */
async function requestMicrophonePermission(): Promise<void> {
  try {
    console.log('[Permissions] Requesting Microphone permission...');

    // Check current microphone permission status
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log('[Permissions] Current microphone status:', micStatus);

    if (micStatus !== 'granted') {
      // Request microphone access
      // This triggers the macOS permission prompt
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('[Permissions] Microphone permission granted:', granted);
    } else {
      console.log('[Permissions] Microphone permission already granted');
    }
  } catch (error) {
    console.error('[Permissions] Error requesting Microphone:', error);
  }
}

/**
 * Check if Screen Recording permission is granted
 * Note: This is best-effort - macOS doesn't provide a reliable API to check this
 */
export async function hasScreenRecordingPermission(): Promise<boolean> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });
    return sources.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if Microphone permission is granted
 */
export function hasMicrophonePermission(): boolean {
  return systemPreferences.getMediaAccessStatus('microphone') === 'granted';
}
