/**
 * Analytics Event Taxonomy (AARRR Framework)
 *
 * This file defines all analytics events tracked in the application using the AARRR
 * (Pirate Metrics) framework: Acquisition, Activation, Retention, Revenue, Referral.
 *
 * Events are logged to both PostHog (for product analytics) and Supabase (for SQL queries).
 */

// =============================================================================
// ACQUISITION EVENTS
// Events related to user signup and acquisition sources
// =============================================================================

export enum AcquisitionEvents {
  /** User completed signup process */
  SIGNUP_COMPLETED = 'signup_completed',
  /** Track signup source/referral */
  SIGNUP_SOURCE = 'signup_source',
  /** User attempted OAuth login */
  OAUTH_LOGIN_ATTEMPT = 'oauth_login_attempt',
  /** OAuth callback failed with an error */
  OAUTH_CALLBACK_ERROR = 'oauth_callback_error',
  /** User authenticated from desktop app via magic link */
  DESKTOP_AUTH = 'desktop_auth',
}

export interface SignupCompletedProperties {
  /** Authentication method used */
  method: 'email' | 'google' | 'microsoft';
  /** App the user signed up from */
  app?: 'om' | 'blindslide';
}

export interface SignupSourceProperties {
  /** Referral source (utm_source, referrer, etc.) */
  source: string;
  /** Campaign identifier if applicable */
  campaign?: string;
  /** Medium (organic, paid, social, etc.) */
  medium?: string;
}

export interface OAuthLoginAttemptProperties {
  /** OAuth provider */
  provider: 'google' | 'microsoft';
}

export interface OAuthCallbackErrorProperties {
  /** OAuth provider */
  provider?: 'google' | 'microsoft';
  /** Error message */
  error: string;
}

export interface DesktopAuthProperties {
  /** Source of authentication */
  source: 'desktop';
  /** User's intent (what they're trying to do) */
  intent: string;
}

// =============================================================================
// ACTIVATION EVENTS
// Events indicating users are getting value from the product
// =============================================================================

export enum ActivationEvents {
  /** User successfully connected their calendar */
  CALENDAR_CONNECTED = 'calendar_connected',
  /** User recorded their first meeting */
  FIRST_MEETING_RECORDED = 'first_meeting_recorded',
  /** User viewed their weekly roundup */
  WEEKLY_ROUNDUP_VIEWED = 'weekly_roundup_viewed',
  /** User logged in */
  USER_LOGGED_IN = 'user_logged_in',
}

export interface CalendarConnectedProperties {
  /** Calendar provider */
  provider: 'google' | 'microsoft';
  /** Whether a refresh token was obtained */
  has_refresh_token: boolean;
}

export interface FirstMeetingRecordedProperties {
  /** How the meeting was added */
  source: 'upload' | 'calendar_sync';
  /** File type if uploaded */
  file_type?: string;
}

export interface WeeklyRoundupViewedProperties {
  /** Week identifier (ISO week) */
  week: string;
  /** Number of meetings in the roundup */
  meeting_count: number;
}

export interface UserLoggedInProperties {
  /** Login method */
  method: 'email' | 'google' | 'microsoft';
}

// =============================================================================
// ENGAGEMENT EVENTS
// Events related to ongoing product usage and user engagement
// =============================================================================

export enum EngagementEvents {
  /** User viewed the dashboard (return visit signal) */
  DASHBOARD_VIEWED = 'dashboard_viewed',
  /** User viewed analysis panel (value realization) */
  ANALYSIS_VIEWED = 'analysis_viewed',
  /** Meeting analysis completed (tracks every analyzed meeting) */
  MEETING_ANALYZED = 'meeting_analyzed',
}

export interface DashboardViewedProperties {
  /** Number of meetings visible */
  meeting_count?: number;
}

export interface AnalysisViewedProperties {
  /** Meeting identifier */
  meeting_id: string;
}

export interface MeetingAnalyzedProperties {
  /** How the meeting was added */
  source: 'upload' | 'calendar_sync';
  /** Meeting identifier */
  meeting_id: string;
  /** Processing time in seconds */
  processing_time_seconds?: number;
}

// =============================================================================
// TECH HEALTH EVENTS
// Events for debugging and technical monitoring (not part of AARRR metrics)
// =============================================================================

export enum TechEvents {
  /** File upload failed (for debugging upload issues) */
  UPLOAD_FAILED = 'upload_failed',
}

export interface UploadFailedProperties {
  /** File MIME type */
  file_type: string;
  /** File size in bytes */
  file_size: number;
  /** Error message */
  error: string;
}

// =============================================================================
// MONITORING EVENTS
// Events for fraud prevention, rate limiting, and system health monitoring
// =============================================================================

export enum MonitoringEvents {
  /** Anonymous upload succeeded */
  ANON_UPLOAD_SUCCEEDED = 'anon_upload_succeeded',
  /** Anonymous upload failed */
  ANON_UPLOAD_FAILED = 'anon_upload_failed',
  /** Monthly capacity threshold reached */
  ANON_UPLOAD_CAPACITY_WARNING = 'anon_upload_capacity_warning',
  /** Rate limit triggered for anonymous uploads */
  ANON_UPLOAD_RATE_LIMITED = 'anon_upload_rate_limited',
  /** Fraud pattern detected in anonymous uploads */
  ANON_UPLOAD_FRAUD_DETECTED = 'anon_upload_fraud_detected',
  /** IP-based abuse detected */
  ANON_UPLOAD_IP_BLOCKED = 'anon_upload_ip_blocked',
}

export interface AnonUploadSucceededProperties {
  /** User's email */
  email: string;
  /** File size in bytes */
  file_size: number;
  /** File MIME type */
  file_type: string;
  /** Request IP (hashed for privacy) */
  ip_hash: string;
}

export interface AnonUploadFailedProperties {
  /** User's email */
  email?: string;
  /** File size in bytes */
  file_size?: number;
  /** File MIME type */
  file_type?: string;
  /** Error message */
  error: string;
  /** Request IP (hashed for privacy) */
  ip_hash?: string;
}

export interface AnonUploadCapacityWarningProperties {
  /** Current usage count */
  current_count: number;
  /** Maximum capacity */
  max_capacity: number;
  /** Percentage used */
  percentage_used: number;
}

export interface AnonUploadRateLimitedProperties {
  /** User's email */
  email: string;
  /** Rate limit type */
  limit_type: 'per_email' | 'per_ip' | 'distributed_abuse';
  /** Current count that triggered the limit */
  current_count: number;
  /** Maximum allowed */
  max_allowed: number;
  /** Request IP (hashed for privacy) */
  ip_hash: string;
}

export interface AnonUploadFraudDetectedProperties {
  /** User's email */
  email: string;
  /** Fraud detection reason */
  reason:
    | 'suspicious_pattern'
    | 'duplicate_content'
    | 'invalid_user_agent'
    | 'multiple_emails_from_ip';
  /** Additional context */
  details: string;
  /** Request IP (hashed for privacy) */
  ip_hash: string;
}

export interface AnonUploadIpBlockedProperties {
  /** Request IP (hashed for privacy) */
  ip_hash: string;
  /** Number of different emails from this IP */
  email_count: number;
  /** Maximum allowed emails per IP */
  max_allowed: number;
}

// =============================================================================
// REVENUE EVENTS
// Events related to monetization (subscriptions, payments, etc.)
// =============================================================================

export enum RevenueEvents {
  /** User viewed pricing page */
  PRICING_VIEWED = 'pricing_viewed',
  /** User clicked on a plan */
  PLAN_SELECTED = 'plan_selected',
  /** User started checkout flow */
  CHECKOUT_STARTED = 'checkout_started',
  /** Subscription successfully created */
  SUBSCRIPTION_CREATED = 'subscription_created',
  /** Subscription upgraded */
  SUBSCRIPTION_UPGRADED = 'subscription_upgraded',
  /** Subscription downgraded */
  SUBSCRIPTION_DOWNGRADED = 'subscription_downgraded',
  /** Subscription canceled */
  SUBSCRIPTION_CANCELED = 'subscription_canceled',
  /** Payment succeeded */
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  /** Payment failed */
  PAYMENT_FAILED = 'payment_failed',
}

export interface PricingViewedProperties {
  /** Where the user came from */
  source?: string;
}

export interface PlanSelectedProperties {
  /** Plan identifier (free, pro, enterprise, etc.) */
  plan_id: string;
  /** Billing interval */
  interval: 'monthly' | 'yearly';
  /** Price in cents */
  amount_cents: number;
}

export interface CheckoutStartedProperties {
  /** Plan identifier */
  plan_id: string;
  /** Billing interval */
  interval: 'monthly' | 'yearly';
}

export interface SubscriptionCreatedProperties {
  /** Stripe subscription ID */
  subscription_id: string;
  /** Plan identifier */
  plan_id: string;
  /** Billing interval */
  interval: 'monthly' | 'yearly';
  /** Amount in cents */
  amount_cents: number;
}

export interface SubscriptionUpgradedProperties {
  /** Stripe subscription ID */
  subscription_id: string;
  /** Previous plan */
  from_plan: string;
  /** New plan */
  to_plan: string;
}

export interface SubscriptionDowngradedProperties {
  /** Stripe subscription ID */
  subscription_id: string;
  /** Previous plan */
  from_plan: string;
  /** New plan */
  to_plan: string;
}

export interface SubscriptionCanceledProperties {
  /** Stripe subscription ID */
  subscription_id: string;
  /** Plan being canceled */
  plan_id: string;
  /** Cancellation reason if provided */
  reason?: string;
}

export interface PaymentSucceededProperties {
  /** Stripe payment intent ID */
  payment_id: string;
  /** Amount in cents */
  amount_cents: number;
}

export interface PaymentFailedProperties {
  /** Stripe payment intent ID */
  payment_id?: string;
  /** Error message */
  error: string;
}

// =============================================================================
// UNION TYPES FOR TYPE SAFETY
// =============================================================================

/**
 * Note: Product Tour and Email events are handled by Intercom and are not
 * tracked in our analytics system.
 */

/**
 * Union type of all possible analytics events with their typed properties.
 * This enables type-safe event tracking with autocomplete and compile-time validation.
 */
export type AnalyticsEvent =
  // Acquisition
  | {
      name: AcquisitionEvents.SIGNUP_COMPLETED;
      properties: SignupCompletedProperties;
    }
  | {
      name: AcquisitionEvents.SIGNUP_SOURCE;
      properties: SignupSourceProperties;
    }
  | {
      name: AcquisitionEvents.OAUTH_LOGIN_ATTEMPT;
      properties: OAuthLoginAttemptProperties;
    }
  | {
      name: AcquisitionEvents.OAUTH_CALLBACK_ERROR;
      properties: OAuthCallbackErrorProperties;
    }
  | {
      name: AcquisitionEvents.DESKTOP_AUTH;
      properties: DesktopAuthProperties;
    }
  // Activation
  | {
      name: ActivationEvents.CALENDAR_CONNECTED;
      properties: CalendarConnectedProperties;
    }
  | {
      name: ActivationEvents.FIRST_MEETING_RECORDED;
      properties: FirstMeetingRecordedProperties;
    }
  | {
      name: ActivationEvents.WEEKLY_ROUNDUP_VIEWED;
      properties: WeeklyRoundupViewedProperties;
    }
  | {
      name: ActivationEvents.USER_LOGGED_IN;
      properties: UserLoggedInProperties;
    }
  // Engagement
  | {
      name: EngagementEvents.DASHBOARD_VIEWED;
      properties?: DashboardViewedProperties;
    }
  | {
      name: EngagementEvents.ANALYSIS_VIEWED;
      properties: AnalysisViewedProperties;
    }
  | {
      name: EngagementEvents.MEETING_ANALYZED;
      properties: MeetingAnalyzedProperties;
    }
  // Tech Health
  | { name: TechEvents.UPLOAD_FAILED; properties: UploadFailedProperties }
  // Monitoring
  | {
      name: MonitoringEvents.ANON_UPLOAD_SUCCEEDED;
      properties: AnonUploadSucceededProperties;
    }
  | {
      name: MonitoringEvents.ANON_UPLOAD_FAILED;
      properties: AnonUploadFailedProperties;
    }
  | {
      name: MonitoringEvents.ANON_UPLOAD_CAPACITY_WARNING;
      properties: AnonUploadCapacityWarningProperties;
    }
  | {
      name: MonitoringEvents.ANON_UPLOAD_RATE_LIMITED;
      properties: AnonUploadRateLimitedProperties;
    }
  | {
      name: MonitoringEvents.ANON_UPLOAD_FRAUD_DETECTED;
      properties: AnonUploadFraudDetectedProperties;
    }
  | {
      name: MonitoringEvents.ANON_UPLOAD_IP_BLOCKED;
      properties: AnonUploadIpBlockedProperties;
    }
  // Revenue
  | { name: RevenueEvents.PRICING_VIEWED; properties?: PricingViewedProperties }
  | { name: RevenueEvents.PLAN_SELECTED; properties: PlanSelectedProperties }
  | {
      name: RevenueEvents.CHECKOUT_STARTED;
      properties: CheckoutStartedProperties;
    }
  | {
      name: RevenueEvents.SUBSCRIPTION_CREATED;
      properties: SubscriptionCreatedProperties;
    }
  | {
      name: RevenueEvents.SUBSCRIPTION_UPGRADED;
      properties: SubscriptionUpgradedProperties;
    }
  | {
      name: RevenueEvents.SUBSCRIPTION_DOWNGRADED;
      properties: SubscriptionDowngradedProperties;
    }
  | {
      name: RevenueEvents.SUBSCRIPTION_CANCELED;
      properties: SubscriptionCanceledProperties;
    }
  | {
      name: RevenueEvents.PAYMENT_SUCCEEDED;
      properties: PaymentSucceededProperties;
    }
  | { name: RevenueEvents.PAYMENT_FAILED; properties: PaymentFailedProperties };

/**
 * Helper type to extract event names from the AnalyticsEvent union
 */
export type EventName = AnalyticsEvent['name'];

/**
 * All event categories combined
 */
export const AllEventEnums = {
  ...AcquisitionEvents,
  ...ActivationEvents,
  ...EngagementEvents,
  ...RevenueEvents,
  ...TechEvents,
  ...MonitoringEvents,
} as const;
