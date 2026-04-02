import React, { useState, useEffect } from 'react';

interface UpdateInfo {
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export function UpdateNotification() {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Check if electronAPI is available (not in test environment)
    if (!window.electronAPI?.on) {
      return;
    }

    // Register event listeners for auto-updater events and collect cleanup functions
    const cleanups = [
      window.electronAPI.on('auto-updater:update-checking', () => {
        setUpdateState('checking');
      }),

      window.electronAPI.on(
        'auto-updater:update-available',
        (info: UpdateInfo) => {
          setUpdateState('available');
          setUpdateInfo(info);
        }
      ),

      window.electronAPI.on('auto-updater:update-not-available', () => {
        setUpdateState('not-available');
        // Hide notification after 3 seconds
        setTimeout(() => setUpdateState('idle'), 3000);
      }),

      window.electronAPI.on(
        'auto-updater:update-error',
        (data: { message: string }) => {
          setUpdateState('error');
          setErrorMessage(data.message);
        }
      ),

      window.electronAPI.on(
        'auto-updater:update-download-progress',
        (progress: DownloadProgress) => {
          setUpdateState('downloading');
          setDownloadProgress(progress);
        }
      ),

      window.electronAPI.on(
        'auto-updater:update-downloaded',
        (info: UpdateInfo) => {
          setUpdateState('downloaded');
          setUpdateInfo(info);
        }
      ),
    ];

    // Clean up all event listeners when component unmounts
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updater) return;
    try {
      await window.electronAPI.updater.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const handleDismiss = () => {
    setUpdateState('idle');
  };

  const handleQuitAndInstall = async () => {
    if (!window.electronAPI?.updater) return;
    try {
      await window.electronAPI.updater.quitAndInstall();
    } catch (error) {
      console.error('Failed to quit and install:', error);
    }
  };

  // Don't render anything if idle or available (auto-download starts immediately)
  if (updateState === 'idle' || updateState === 'available') {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.notification}>
        {updateState === 'checking' && (
          <div style={styles.content}>
            <p style={styles.title}>Checking for updates...</p>
          </div>
        )}

        {updateState === 'not-available' && (
          <div style={styles.content}>
            <p style={styles.title}>You're up to date!</p>
          </div>
        )}

        {updateState === 'downloading' && downloadProgress && (
          <div style={styles.content}>
            <p style={styles.title}>Downloading Update</p>
            <div style={styles.progressBarContainer}>
              <div
                style={{
                  ...styles.progressBar,
                  width: `${downloadProgress.percent}%`,
                }}
              />
            </div>
            <p style={styles.message}>
              {downloadProgress.percent.toFixed(1)}% -{' '}
              {formatBytes(downloadProgress.bytesPerSecond)}/s
            </p>
          </div>
        )}

        {updateState === 'downloaded' && (
          <div style={styles.content}>
            <p style={styles.title}>Update Ready</p>
            <p style={styles.message}>
              Version {updateInfo?.version} is ready to install.
            </p>
            <div style={styles.actions}>
              <button
                onClick={handleQuitAndInstall}
                style={styles.primaryButton}
              >
                Restart Now
              </button>
              <button onClick={handleDismiss} style={styles.secondaryButton}>
                Later
              </button>
            </div>
          </div>
        )}

        {updateState === 'error' && (
          <div style={styles.content}>
            <p style={styles.title}>Update Error</p>
            <p style={styles.message}>{errorMessage}</p>
            <div style={styles.actions}>
              <button
                onClick={handleCheckForUpdates}
                style={styles.primaryButton}
              >
                Retry
              </button>
              <button onClick={handleDismiss} style={styles.secondaryButton}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const styles = {
  container: {
    position: 'fixed' as const,
    top: 20,
    right: 20,
    zIndex: 1000,
  },
  notification: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: 16,
    minWidth: 320,
    maxWidth: 400,
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
    color: '#1a1a1a',
  },
  message: {
    fontSize: 14,
    margin: 0,
    color: '#666666',
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#007aff',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    flex: 1,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007aff',
    transition: 'width 0.3s ease',
  },
};
