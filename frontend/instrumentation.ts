/**
 * Next.js Instrumentation File
 * Initializes Sentry for server-side and edge runtime error tracking
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Shared Sentry configuration for both Node.js and Edge runtime
 */
function getSentryConfig() {
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  // If no explicit environment is set and we're not on Vercel, assume local development
  const environment =
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    'development'; // Not on Vercel = local development

  return {
    dsn: sentryDsn,
    environment,
    shouldInit:
      sentryDsn && environment !== 'development' && environment !== 'localhost',
  };
}

/**
 * Register function - called when the server starts
 * Initializes Sentry for both Node.js server and Edge runtime
 */
export async function register() {
  const { dsn, environment, shouldInit } = getSentryConfig();

  if (!dsn) {
    console.log('⚠️  NEXT_PUBLIC_SENTRY_DSN not set - error tracking disabled');
    return;
  }

  if (!shouldInit) {
    console.log(
      '⚠️  Sentry disabled in development - only production errors are tracked'
    );
    return;
  }

  // Initialize for Edge runtime (middleware, edge API routes)
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 0.1,
      integrations: [Sentry.consoleLoggingIntegration()],
      attachStacktrace: true,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      enableLogs: true,
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

        return event;
      },
    });

    console.log(
      `🔍 Sentry initialized (edge runtime) - environment: ${environment}`
    );
  }
  // Initialize for Node.js runtime (server components, API routes)
  else {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 0.1,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.consoleLoggingIntegration(),
      ],
      attachStacktrace: true,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      enableLogs: true,
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

        return event;
      },
    });

    console.log(
      `🔍 Sentry initialized (server-side) - environment: ${environment}`
    );
  }
}

/**
 * Capture errors from nested React Server Components
 * See: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
 */
export const onRequestError = Sentry.captureRequestError;
