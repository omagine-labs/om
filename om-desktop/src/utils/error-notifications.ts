import { Notification, shell } from 'electron';

/**
 * Show error notification with user guidance
 */
export function showErrorNotification(
  title: string,
  body: string,
  actionUrl?: string
): void {
  const notification = new Notification({
    title,
    body,
    silent: false, // Play sound for errors
  });

  if (actionUrl) {
    notification.on('click', () => {
      shell.openExternal(actionUrl);
    });
  }

  notification.show();
}

/**
 * Show auth error with guidance to sign in
 */
export function showAuthError(message: string, webAppUrl: string): void {
  showErrorNotification(
    'Authentication Required',
    message || 'Please sign in to continue',
    `${webAppUrl}/login?source=desktop`
  );
}

/**
 * Show permission error with guidance to System Settings
 */
export function showPermissionError(
  permissionType: 'screen' | 'microphone'
): void {
  const permissions = {
    screen: {
      title: 'Screen Recording Permission Required',
      body: 'Om needs Screen Recording permission to capture system audio from meetings. Click to open System Settings → Privacy & Security → Screen Recording',
      url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    },
    microphone: {
      title: 'Microphone Permission Required',
      body: 'Om needs permission to record audio. Click to open System Settings → Privacy & Security → Microphone',
      url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    },
  };

  const config = permissions[permissionType];
  showErrorNotification(config.title, config.body, config.url);
}

/**
 * Show network error with retry guidance
 */
export function showNetworkError(isQueued: boolean): void {
  if (isQueued) {
    new Notification({
      title: 'Upload Queued',
      body: "No internet connection. Recording will upload when you're back online.",
      silent: true,
    }).show();
  } else {
    showErrorNotification(
      'Network Error',
      'Unable to connect. Please check your internet connection and try again.'
    );
  }
}

/**
 * Show upload error with retry guidance
 */
export function showUploadError(
  attemptNumber: number,
  maxAttempts: number
): void {
  if (attemptNumber < maxAttempts) {
    new Notification({
      title: 'Upload Failed',
      body: `Retrying upload (attempt ${attemptNumber + 1}/${maxAttempts})...`,
      silent: true,
    }).show();
  } else {
    showErrorNotification(
      'Upload Failed',
      'Recording upload failed after multiple attempts. Your recording is saved locally and will retry when connection improves.'
    );
  }
}

/**
 * Show processing error
 */
export function showProcessingError(errorMessage?: string): void {
  showErrorNotification(
    'Processing Failed',
    errorMessage || 'Meeting processing failed. Please try uploading again.'
  );
}
