/**
 * TypeScript interfaces for Intercom integration
 * Defines user attributes and event payloads
 */

/**
 * Custom user attributes synced to Intercom
 * Used for user identification (JWT), webhook updates, and email targeting
 */
export interface IntercomUserAttributes {
  // Core identity (automatically handled by Intercom SDK)
  // user_id, email, name are set via JWT/boot

  // Onboarding progress attributes
  calendar_connected?: boolean;
  meetings_count?: number;
  first_meeting_analyzed_at?: string | null;

  // Subscription and plan attributes
  plan?: 'free' | 'pro';
  is_trialing?: boolean;

  // Trial timing attributes (for email targeting)
  trial_end_date?: string | null;
  trial_days_remaining?: number | null;
  trial_ending_soon?: boolean;

  // Pricing display (for trial ending emails)
  plan_price?: string; // e.g., "USD 19.00"
  plan_currency?: string; // e.g., "USD"
}

/**
 * JWT payload for Intercom identity verification
 * Contains user identity plus custom attributes
 */
export interface IntercomJWTPayload extends IntercomUserAttributes {
  user_id: string;
  email?: string;
  name?: string;
}

/**
 * Intercom contact object (REST API format)
 */
export interface IntercomContact {
  type: 'user';
  user_id: string;
  email?: string;
  name?: string;
  custom_attributes?: IntercomUserAttributes;
}

/**
 * Intercom API update response
 */
export interface IntercomUpdateResponse {
  type: string;
  id: string;
  user_id?: string;
  email?: string;
}

/**
 * Result of Intercom API operations
 */
export interface IntercomOperationResult {
  success: boolean;
  error?: string;
}
