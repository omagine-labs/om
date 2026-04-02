/**
 * Unified Analytics Tracking
 *
 * This module provides a dual-logging analytics system that tracks events to both:
 * 1. PostHog - For product analytics, funnels, session replay
 * 2. Supabase user_event_log - For SQL-queryable event stream and custom reporting
 *
 * Usage:
 * ```typescript
 * import { trackEvent, AcquisitionEvents } from '@/lib/analytics';
 *
 * trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, { method: 'email' });
 * ```
 */

import { analytics as posthog } from './posthog';
import { intercom } from './intercom';
import { createClient } from './supabase';
import { AllEventEnums } from '@/types/analytics';

/**
 * Track an analytics event to both PostHog and Supabase.
 *
 * This function:
 * - Always logs to PostHog (works for anonymous + identified users)
 * - Logs to Supabase user_event_log table if user is authenticated
 * - Handles errors gracefully (won't throw if database logging fails)
 * - Validates events in development mode
 *
 * @param eventName - The event name (use enum values from @/types/analytics)
 * @param properties - Event properties specific to this event type
 *
 * @example
 * ```typescript
 * // Fire-and-forget (most UI contexts)
 * trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, { method: 'email' });
 *
 * // Await in server-side contexts
 * await trackEvent(ActivationEvents.CALENDAR_CONNECTED, {
 *   provider: 'google',
 *   has_refresh_token: true
 * });
 * ```
 */
export async function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): Promise<void> {
  try {
    // Validate event in development
    if (process.env.NODE_ENV === 'development') {
      validateEvent(eventName, properties);
    }

    // 1. Always log to PostHog (works for anonymous + identified users)
    posthog.capture(eventName, properties);

    // 2. Log to Supabase if user is authenticated
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error } = await supabase.from('user_event_log').insert({
          user_id: user.id,
          event_name: eventName,
          payload: properties || null,
        });

        if (error) {
          console.error('[Analytics] Failed to log event to database:', error);
          // Don't throw - DB logging is supplementary to PostHog
        } else if (process.env.NODE_ENV === 'development') {
          console.log(
            '[Analytics] Event logged to database:',
            eventName,
            properties
          );
        }
      }
    } catch (dbError) {
      console.error('[Analytics] Error logging to database:', dbError);
      // Don't throw - PostHog logging already succeeded
    }
  } catch (error) {
    console.error('[Analytics] Error in trackEvent:', error);
    // Don't throw - analytics failures shouldn't break app functionality
  }
}

/**
 * Validate that event name is in the known taxonomy.
 * Only runs in development mode to catch typos and unknown events.
 *
 * @param eventName - Event name to validate
 * @param properties - Event properties (for future validation)
 */
function validateEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  const knownEvents = Object.values(AllEventEnums);

  if (!knownEvents.includes(eventName as any)) {
    console.warn(
      `[Analytics] Unknown event: "${eventName}". This event is not in the AARRR taxonomy. ` +
        `Please add it to frontend/types/analytics.ts or check for typos.`
    );
  }

  // Future: Add property validation based on event type
  // For now, just validate event name exists in taxonomy
}

// =============================================================================
// CONVENIENCE EXPORTS - Proxy PostHog methods for user identification
// =============================================================================

/**
 * Identify a user with PostHog.
 * Call this after successful login/signup to associate future events with the user.
 *
 * @param userId - Unique user identifier
 * @param properties - User properties (email, name, plan, etc.)
 *
 * @example
 * ```typescript
 * identifyUser(user.id, {
 *   email: user.email,
 *   full_name: user.full_name,
 *   created_at: user.created_at
 * });
 * ```
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, any>
): void {
  posthog.identify(userId, properties);
}

/**
 * Reset analytics on logout.
 * Clears the PostHog session and stops associating events with the previous user.
 *
 * @example
 * ```typescript
 * async function handleLogout() {
 *   await trackEvent(RetentionEvents.USER_LOGGED_OUT);
 *   await supabase.auth.signOut();
 *   resetAnalytics();
 * }
 * ```
 */
export function resetAnalytics(): void {
  posthog.reset();
  intercom.shutdown();
}

/**
 * Set person properties for the current user in PostHog.
 * These properties persist across sessions.
 *
 * @param properties - User properties to set/update
 *
 * @example
 * ```typescript
 * setUserProperties({
 *   plan: 'pro',
 *   meetings_count: 42
 * });
 * ```
 */
export function setUserProperties(properties: Record<string, any>): void {
  posthog.setPersonProperties(properties);
}

// =============================================================================
// RE-EXPORTS - Export event enums for convenience
// =============================================================================

export {
  AcquisitionEvents,
  ActivationEvents,
  EngagementEvents,
  RevenueEvents,
  TechEvents,
} from '@/types/analytics';

export type {
  AnalyticsEvent,
  EventName,
  // Acquisition
  SignupCompletedProperties,
  SignupSourceProperties,
  OAuthLoginAttemptProperties,
  OAuthCallbackErrorProperties,
  // Activation
  CalendarConnectedProperties,
  FirstMeetingRecordedProperties,
  WeeklyRoundupViewedProperties,
  UserLoggedInProperties,
  // Engagement
  DashboardViewedProperties,
  AnalysisViewedProperties,
  MeetingAnalyzedProperties,
  // Tech Health
  UploadFailedProperties,
  // Revenue
  PricingViewedProperties,
  PlanSelectedProperties,
  CheckoutStartedProperties,
  SubscriptionCreatedProperties,
  SubscriptionUpgradedProperties,
  SubscriptionDowngradedProperties,
  SubscriptionCanceledProperties,
  PaymentSucceededProperties,
  PaymentFailedProperties,
} from '@/types/analytics';
