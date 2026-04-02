/**
 * Sentry Error Tracking - Desktop App
 * Centralized error tracking and monitoring for Electron app
 */

import * as Sentry from '@sentry/electron/main';
import { IPCMode } from '@sentry/electron/main';
import { config } from './config';

/**
 * Initialize Sentry for main process
 * Call this BEFORE app.ready in main.ts
 */
export function initSentryMain(): void {
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn) {
    console.log('⚠️ SENTRY_DSN not set - error tracking disabled');
    return;
  }

  // Skip Sentry initialization in local/development to avoid wasting quota
  if (config.environment === 'local') {
    console.log(
      '⚠️ Sentry disabled in development - only production errors are tracked'
    );
    return;
  }

  try {
    const environment = 'production';

    Sentry.init({
      dsn: sentryDsn,
      environment,
      tracesSampleRate: 0.1, // Sample 10% of transactions for performance monitoring
      // Use classic IPC mode for bundled apps (required when using Vite/webpack)
      // This fixes "Fetch API cannot load sentry-ipc://" errors
      ipcMode: IPCMode.Classic,
      // Custom integrations for log capture
      integrations: [Sentry.consoleLoggingIntegration()],
      // Attach stack traces to messages
      attachStacktrace: true,
      // Release tracking (use app version)
      release: `om-desktop@${process.env.npm_package_version || 'unknown'}`,
      // Enable logs to be sent to Sentry (experimental feature)
      _experiments: {
        enableLogs: true,
      },
      // Filter out non-error events
      beforeSend(event) {
        // Filter out info-level messages (only send warnings and errors)
        if (event.level === 'info' || event.level === 'log') {
          return null;
        }

        // Filter out expected validation errors (business logic, not system errors)
        const errorMessage =
          event.exception?.values?.[0]?.value || event.message || '';
        if (
          errorMessage.includes('Recording duration') &&
          errorMessage.includes('below the minimum requirement')
        ) {
          return null;
        }

        return event;
      },
    });

    console.log(
      `🔍 Sentry error tracking initialized (main process) - environment: ${environment}`
    );
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
}

/**
 * Add breadcrumb for debugging context
 *
 * Breadcrumbs are lightweight logs attached to errors to help debug issues.
 * Use for key events in your workflow (e.g., "upload started", "file validated").
 *
 * @param category - Event category (e.g., "upload", "auth", "recording")
 * @param message - Human-readable description of what happened
 * @param data - Additional context data (file sizes, IDs, etc.)
 *
 * @example
 * addBreadcrumb('upload', 'File validation passed', { fileSizeMB: 45.2 });
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    level: 'info',
    data,
  });
}

/**
 * Set user context for error tracking
 */
export function setUser(userId: string, email?: string): void {
  Sentry.setUser({
    id: userId,
    email,
  });
}

/**
 * Clear user context (on logout)
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Set custom tag for filtering/grouping errors
 */
export function setTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * Capture exception manually
 */
export function captureException(error: Error | unknown): void {
  Sentry.captureException(error);
}

/**
 * Capture message (for non-error events and structured logging)
 *
 * Use this for structured logs at key milestones (e.g., "Upload completed").
 * These appear in Sentry's "Issues" tab and can be searched/filtered.
 *
 * For detailed structured logs with custom attributes, use the full Sentry API:
 * Sentry.captureMessage('message', { level: 'info', extra: { key: 'value' } })
 *
 * @param message - The message to log
 * @param level - Severity level (default: 'info')
 *
 * @example
 * captureMessage('Upload completed successfully', 'info');
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  Sentry.captureMessage(message, level);
}
