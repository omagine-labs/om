/**
 * Sentry Client-Side Configuration
 * Error tracking for client-side React code
 */

import * as Sentry from '@sentry/nextjs';

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryDsn) {
  // Default to development unless explicitly set or running on Vercel
  const environment =
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    'development'; // Default to development

  // Skip Sentry initialization in explicit development mode only
  // (e.g., localhost or when NEXT_PUBLIC_SENTRY_ENVIRONMENT=development)
  if (environment === 'development' || environment === 'localhost') {
    console.log(
      '⚠️  Sentry disabled in development - only production errors are tracked'
    );
  } else {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      tracesSampleRate: 0.1,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
        Sentry.consoleLoggingIntegration(),
      ],
      // Session replay on errors only (to minimize quota usage)
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      attachStacktrace: true,
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      // Enable logs to be sent to Sentry
      enableLogs: true,
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

        // Filter out CefSharp bot errors (Microsoft Outlook SafeSearch, security scanners)
        // These errors come from automated crawlers, not real users
        if (
          errorMessage.includes('Object Not Found Matching Id') &&
          errorMessage.includes('MethodName')
        ) {
          return null;
        }

        // Filter browser extension DOM manipulation errors (not app bugs)
        if (
          errorMessage.includes('removeChild') &&
          errorMessage.includes('not a child of this node')
        ) {
          return null;
        }

        // Filter cross-origin iframe errors from Sentry Replay
        if (
          errorMessage.includes('cross-origin frame') ||
          (event.exception?.values?.[0]?.type === 'SecurityError' &&
            errorMessage.includes('removeEventListener'))
        ) {
          return null;
        }

        return event;
      },
    });

    console.log(
      `🔍 Sentry initialized (client-side) - environment: ${environment}`
    );
  }
} else {
  console.log('⚠️  NEXT_PUBLIC_SENTRY_DSN not set - error tracking disabled');
}

/**
 * Export router transition hook for navigation instrumentation
 * Required by Sentry SDK to track client-side navigation events
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
