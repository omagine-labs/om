/**
 * Sentry Error Tracking - Renderer Process
 * Error tracking for React/UI code in Electron renderer
 */

import * as Sentry from '@sentry/electron/renderer';
import { getEnvironment } from '../dashboard/lib/config';

/**
 * Initialize Sentry for renderer process
 * Call this in your app entry point (App.tsx or index.tsx)
 *
 * Note: This will fail silently if main process hasn't initialized Sentry yet.
 * The main process MUST call initSentryMain() first for IPC to work.
 */
export function initSentryRenderer(): void {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

  if (!sentryDsn) {
    console.log('⚠️ VITE_SENTRY_DSN not set - error tracking disabled');
    return;
  }

  // Skip Sentry initialization in local/development to avoid wasting quota
  if (getEnvironment() === 'local') {
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
      tracesSampleRate: 0.1,
      // Custom integrations for log capture
      integrations: [Sentry.consoleLoggingIntegration()],
      attachStacktrace: true,
      // Enable logs to be sent to Sentry (experimental feature)
      _experiments: {
        enableLogs: true,
      },
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
      `🔍 Sentry error tracking initialized (renderer process) - environment: ${environment}`
    );
  } catch (error) {
    // Log but don't crash if Sentry init fails
    console.warn('Sentry renderer initialization warning:', error);
  }
}

/**
 * Add breadcrumb for debugging context
 *
 * Breadcrumbs are lightweight logs attached to errors to help debug issues.
 * Use for key UI events (e.g., "button clicked", "modal opened").
 *
 * @param category - Event category (e.g., "ui", "navigation", "auth")
 * @param message - Human-readable description of what happened
 * @param data - Additional context data
 *
 * @example
 * addBreadcrumb('ui', 'User clicked record button', { timestamp: Date.now() });
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
 * Set user context
 */
export function setUser(userId: string, email?: string): void {
  Sentry.setUser({
    id: userId,
    email,
  });
}

/**
 * Clear user context
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Capture exception
 */
export function captureException(error: Error | unknown): void {
  Sentry.captureException(error);
}

/**
 * Capture message (for non-error events and structured logging)
 *
 * Use this for structured logs at key UI milestones.
 * These appear in Sentry's "Issues" tab and can be searched/filtered.
 *
 * For detailed structured logs with custom attributes, use the full Sentry API:
 * Sentry.captureMessage('message', { level: 'info', extra: { key: 'value' } })
 *
 * @param message - The message to log
 * @param level - Severity level (default: 'info')
 *
 * @example
 * captureMessage('User authenticated successfully', 'info');
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  Sentry.captureMessage(message, level);
}
