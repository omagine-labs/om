import { app } from 'electron';

/**
 * Get the application version
 * Returns the version from package.json
 */
export function getAppVersion(): string {
  return app.getVersion();
}

/**
 * Get formatted version string for display
 */
export function getFormattedVersion(): string {
  const version = getAppVersion();
  return `v${version}`;
}
