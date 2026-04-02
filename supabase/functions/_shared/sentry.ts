/**
 * Shared Sentry initialization for Edge Functions
 * Import and call initSentry() at the top of each Edge Function
 *
 * Using npm:@sentry/deno instead of deprecated deno.land/x/sentry
 * See: https://github.com/getsentry/sentry-javascript/issues/15229
 */

import * as Sentry from '@sentry/deno';

let sentryInitialized = false;

/**
 * Initialize Sentry for Edge Function error tracking
 * Safe to call multiple times - will only initialize once
 *
 * @param functionName - Name of the Edge Function for tagging
 * @returns true if Sentry is enabled, false if disabled
 */
export function initSentry(functionName: string): boolean {
  // Skip if already initialized
  if (sentryInitialized) {
    return true;
  }

  const sentryDsn = Deno.env.get('SENTRY_DSN');
  const sentryEnvironment = Deno.env.get('SENTRY_ENVIRONMENT') || 'production';

  if (!sentryDsn) {
    console.warn(
      `⚠️ [${functionName}] SENTRY_DSN not set - error tracking disabled`
    );
    return false;
  }

  // Skip Sentry initialization in explicit development mode
  if (sentryEnvironment === 'development') {
    console.log(`⚠️ [${functionName}] Sentry disabled in development`);
    return false;
  }

  try {
    // Get release version from environment (set by deployment)
    const gitSha = Deno.env.get('GITHUB_SHA');
    const release = gitSha
      ? `om-supabase@${gitSha.substring(0, 7)}`
      : undefined;

    Sentry.init({
      dsn: sentryDsn,
      environment: sentryEnvironment,
      release,
      tracesSampleRate: 0.1,
      // Disable default integrations to prevent scope contamination between requests
      // See: https://supabase.com/docs/guides/functions/examples/sentry-monitoring
      defaultIntegrations: false,
      integrations: [],
      // Filter out noise before sending to Sentry
      beforeSend(event) {
        // Filter out "Edge Function invoked successfully" messages (platform noise)
        const errorMessage =
          event.exception?.values?.[0]?.value || event.message || '';
        if (errorMessage.includes('Edge Function invoked successfully')) {
          return null;
        }

        return event;
      },
    });

    // Set function name tag for all events
    Sentry.setTag('function_name', functionName);

    // Add Supabase-provided execution context for better debugging
    const region = Deno.env.get('SB_REGION');
    const executionId = Deno.env.get('SB_EXECUTION_ID');
    if (region) Sentry.setTag('region', region);
    if (executionId) Sentry.setTag('execution_id', executionId);

    sentryInitialized = true;
    console.log(`🔍 [${functionName}] Sentry initialized`);
    return true;
  } catch (error) {
    console.error(`❌ [${functionName}] Failed to initialize Sentry:`, error);
    return false;
  }
}

/**
 * Capture an exception in Sentry
 */
export function captureException(error: Error | unknown): void {
  if (!sentryInitialized) return;
  Sentry.captureException(error);
}

/**
 * Capture message (for structured logging)
 *
 * Use this for structured logs at key milestones.
 * These appear in Sentry's "Logs" tab and can be searched/filtered.
 *
 * @param message - The message to log
 * @param level - Severity level (default: 'info')
 *
 * @example
 * captureMessage('User subscribed to newsletter', 'info');
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (!sentryInitialized) return;
  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging context
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (!sentryInitialized) return;
  Sentry.addBreadcrumb({
    category,
    message,
    level: 'info',
    data,
  });
}

/**
 * Set tag for filtering/grouping errors
 */
export function setTag(key: string, value: string): void {
  if (!sentryInitialized) return;
  Sentry.setTag(key, value);
}

/**
 * Set user context for error tracking
 * This enables filtering errors by user in the Sentry dashboard
 */
export function setUser(userId: string): void {
  if (!sentryInitialized) return;
  Sentry.setUser({ id: userId });
}

/**
 * Flush pending Sentry events before the Edge Function terminates
 *
 * CRITICAL: Edge Functions are short-lived. Without calling flush(),
 * events are buffered but never sent because the function terminates first.
 * Always call this before returning from an Edge Function.
 *
 * @param timeout - Maximum time to wait for flush (default: 2000ms)
 */
export async function flush(timeout = 2000): Promise<void> {
  if (!sentryInitialized) return;
  await Sentry.flush(timeout);
}
