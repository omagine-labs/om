/**
 * Integration tests for GET /api/subscriptions/current
 * Tests authentication, rate limiting, and subscription fetching
 *
 * Note: Uses Jest mocks instead of MSW to avoid ESM compatibility issues with MSW v2
 */

import { GET } from '@/app/api/subscriptions/current/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Mock Supabase client
jest.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: jest.fn(),
  createAuthenticatedSupabaseClient: jest.fn(),
}));

// Mock Stripe client
jest.mock('@/lib/stripe', () => ({
  getStripeClient: jest.fn(),
}));

// Mock Stripe retry helper
jest.mock('@/lib/stripe-retry', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

// Mock rate limiting
jest.mock('@/app/api/_middleware/rate-limit', () => ({
  checkRateLimit: jest.fn(() => null),
  getRateLimitHeaders: jest.fn(() => ({
    'X-RateLimit-Limit': '30',
    'X-RateLimit-Remaining': '29',
    'X-RateLimit-Reset': String(Date.now() + 300000),
  })),
}));

import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { getStripeClient } from '@/lib/stripe';
import { checkRateLimit } from '@/app/api/_middleware/rate-limit';

describe('GET /api/subscriptions/current', () => {
  let mockSupabase: any;
  let mockStripe: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Set up default Supabase mock
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn(),
    };
    (createAuthenticatedSupabaseClient as jest.Mock).mockResolvedValue(
      mockSupabase
    );

    // Set up default Stripe mock
    mockStripe = {
      subscriptions: {
        retrieve: jest.fn(),
      },
      coupons: {
        retrieve: jest.fn(),
      },
      invoices: {
        createPreview: jest.fn(),
      },
      prices: {
        retrieve: jest.fn(),
      },
    };
    (getStripeClient as jest.Mock).mockReturnValue(mockStripe);
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock Supabase auth to return no user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const response = await GET();

      expect(response.status).toBe(401);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when auth token is invalid', async () => {
      // Mock Supabase auth to return error
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const response = await GET();

      expect(response.status).toBe(401);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });

      // Mock rate limit exceeded
      const rateLimitResponse = new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '30',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + 300000),
          },
        }
      );

      (checkRateLimit as jest.Mock).mockReturnValueOnce(rateLimitResponse);

      const response = await GET();

      expect(response.status).toBe(429);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  });

  describe('Subscription fetching', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 404 when user has no subscription', async () => {
      // Mock Supabase to return no subscriptions (empty array)
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const response = await GET();

      expect(response.status).toBe(404);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
    });

    it('should return active subscription with basic details', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        stripe_price_id: 'price_monthly',
        status: 'active',
        plan_type: 'monthly',
        trial_start: null,
        trial_end: null,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock Supabase to return subscription
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [mockSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock Stripe subscription retrieve
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        items: {
          data: [
            {
              price: {
                id: 'price_monthly',
              },
            },
          ],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        discounts: [],
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription).toBeDefined();
      expect(body.subscription.id).toBe('sub_123');
      expect(body.subscription.status).toBe('active');
      expect(body.subscription.planType).toBe('monthly');
      expect(body.subscription.stripeCustomerId).toBe('cus_test123');
      expect(body.subscription.stripeSubscriptionId).toBe('sub_test123');
      expect(body.subscription.cancelAtPeriodEnd).toBe(false);
    });

    it('should return subscription with trial information', async () => {
      const trialStart = new Date();
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const mockSubscription = {
        id: 'sub_trial',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        stripe_price_id: 'price_monthly',
        status: 'trialing',
        plan_type: 'monthly',
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString(),
        current_period_start: trialStart.toISOString(),
        current_period_end: trialEnd.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [mockSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'trialing',
        trial_start: Math.floor(trialStart.getTime() / 1000),
        trial_end: Math.floor(trialEnd.getTime() / 1000),
        current_period_start: Math.floor(trialStart.getTime() / 1000),
        current_period_end: Math.floor(trialEnd.getTime() / 1000),
        customer: 'cus_test123',
        items: {
          data: [{ price: { id: 'price_monthly' } }],
        },
        discounts: [],
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.subscription.status).toBe('trialing');
      expect(body.subscription.trialStart).toBeDefined();
      expect(body.subscription.trialEnd).toBeDefined();
    });

    it('should return subscription with canceled status', async () => {
      const canceledAt = new Date();

      const mockSubscription = {
        id: 'sub_canceled',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        stripe_price_id: 'price_monthly',
        status: 'active',
        plan_type: 'monthly',
        trial_start: null,
        trial_end: null,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        cancel_at_period_end: true,
        canceled_at: canceledAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [mockSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        cancel_at_period_end: true,
        discounts: [],
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.subscription.cancelAtPeriodEnd).toBe(true);
      expect(body.subscription.canceledAt).toBeDefined();
    });
  });

  describe('Stripe integration', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });

      // Mock basic subscription
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        stripe_price_id: 'price_monthly',
        status: 'active',
        plan_type: 'monthly',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        cancel_at_period_end: false,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [mockSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });
    });

    it('should fetch and include discount information', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        items: {
          data: [{ price: { id: 'price_monthly' } }],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        discounts: [
          {
            source: {
              coupon: 'coupon_test123',
            },
            end: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60,
          },
        ],
      });

      mockStripe.coupons.retrieve.mockResolvedValue({
        id: 'coupon_test123',
        percent_off: 50,
        duration: 'repeating',
        duration_in_months: 3,
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.subscription.discount).toBeDefined();
      expect(body.subscription.discount.couponId).toBe('coupon_test123');
      expect(body.subscription.discount.percentOff).toBe(50);
      expect(body.subscription.discount.duration).toBe('repeating');
      expect(body.subscription.discount.durationInMonths).toBe(3);
    });

    it('should handle Stripe API errors gracefully', async () => {
      mockStripe.subscriptions.retrieve.mockRejectedValue(
        new Error('Stripe API error')
      );

      const response = await GET();

      // Should still return subscription from database, just without Stripe details
      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.subscription).toBeDefined();
      expect(body.subscription.discount).toBeNull();
      expect(body.subscription.upcomingInvoice).toBeNull();
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });

      // Mock subscription
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        status: 'active',
        plan_type: 'monthly',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [mockSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        discounts: [],
      });
    });

    it('should include rate limit headers in successful response', async () => {
      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('29');
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 500 for database errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: 'PGRST301',
                    message: 'Database connection failed',
                  },
                }),
              }),
            }),
          }),
        }),
      });

      const response = await GET();

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return most recently updated subscription when multiple exist', async () => {
      const olderSubscription = {
        id: 'sub_old',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_old123',
        stripe_subscription_id: 'sub_old123',
        stripe_price_id: 'price_monthly',
        status: 'trialing',
        plan_type: 'monthly',
        trial_start: new Date(
          Date.now() - 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_start: new Date(
          Date.now() - 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
        current_period_end: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date(
          Date.now() - 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
      };

      const newerSubscription = {
        id: 'sub_new',
        user_id: 'test-user-id',
        stripe_customer_id: 'cus_new123',
        stripe_subscription_id: 'sub_new123',
        stripe_price_id: 'price_annual',
        status: 'active',
        plan_type: 'annual',
        trial_start: null,
        trial_end: null,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock returns only the most recent subscription (limit(1))
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [newerSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_new123',
        status: 'active',
        customer: 'cus_new123',
        items: {
          data: [{ price: { id: 'price_annual' } }],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        discounts: [],
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      // Should return the most recently updated subscription
      expect(body.subscription.id).toBe('sub_new');
      expect(body.subscription.status).toBe('active');
      expect(body.subscription.planType).toBe('annual');
      expect(body.subscription.stripeSubscriptionId).toBe('sub_new123');
    });

    it('should handle missing subscription IDs gracefully', async () => {
      const incompleteSubscription = {
        id: 'sub_incomplete',
        user_id: 'test-user-id',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        status: 'incomplete',
        plan_type: 'monthly',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [incompleteSubscription],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const response = await GET();

      // Should return subscription without trying to fetch from Stripe
      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.subscription).toBeDefined();
      expect(body.subscription.discount).toBeNull();
      expect(body.subscription.upcomingInvoice).toBeNull();
    });
  });
});
