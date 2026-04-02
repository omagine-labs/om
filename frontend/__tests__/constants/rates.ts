/**
 * Rate limit constants for testing
 *
 * Centralizes rate limit configurations to ensure consistency across tests.
 * When rate limits change in production code, update these values to keep tests in sync.
 */

/**
 * Rate limit configuration for API endpoints
 */
export const RATE_LIMITS = {
  /** GET /api/subscriptions/current - Fetch current subscription */
  currentSubscription: {
    requests: 30,
    windowMs: 300000, // 5 minutes
  },

  /** POST /api/subscriptions/change-plan - Change subscription plan */
  changePlan: {
    requests: 10,
    windowMs: 300000, // 5 minutes
  },

  /** POST /api/subscriptions/cancel - Cancel subscription */
  cancelSubscription: {
    requests: 5,
    windowMs: 300000, // 5 minutes
  },

  /** POST /api/subscriptions/reactivate - Reactivate subscription */
  reactivateSubscription: {
    requests: 5,
    windowMs: 300000, // 5 minutes
  },

  /** POST /api/subscriptions/checkout-session - Create checkout session */
  checkoutSession: {
    requests: 10,
    windowMs: 300000, // 5 minutes
  },

  /** POST /api/subscriptions/create - Create subscription */
  createSubscription: {
    requests: 10,
    windowMs: 300000, // 5 minutes
  },

  /** Default rate limit for endpoints without specific limits */
  default: {
    requests: 10,
    windowMs: 300000, // 5 minutes
  },
};

/**
 * Helper to get expected rate limit headers for tests
 */
export function getExpectedRateLimitHeaders(
  endpoint: keyof typeof RATE_LIMITS,
  remaining?: number
) {
  const limit = RATE_LIMITS[endpoint];
  return {
    'X-RateLimit-Limit': limit.requests.toString(),
    'X-RateLimit-Remaining': (remaining ?? limit.requests - 1).toString(),
  };
}
