/**
 * Integration tests for PATCH /api/subscriptions/change-plan
 * Tests authentication, validation, subscription status checks, and plan change scenarios
 */

import { PATCH } from '@/app/api/subscriptions/change-plan/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Helper to create PATCH request with JSON body
function createPatchRequest(body: any) {
  return new Request('http://localhost:3000/api/subscriptions/change-plan', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Mock Supabase client
jest.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: jest.fn(),
  createAuthenticatedSupabaseClient: jest.fn(),
}));

// Set environment variables for Stripe price IDs
process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID = 'price_monthly_test';
process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID = 'price_annual_test';

// Mock Stripe client
jest.mock('@/lib/stripe', () => ({
  getStripeClient: jest.fn(),
}));

// Mock Stripe helpers
jest.mock('@/lib/stripe-helpers', () => ({
  getPriceIdForPlan: jest.fn((planType) => {
    if (planType === 'monthly') return 'price_monthly_test';
    if (planType === 'annual') return 'price_annual_test';
    throw new Error(`Invalid plan type: ${planType}`);
  }),
  generateIdempotencyKey: jest.fn(() => 'test-idempotency-key'),
}));

// Mock Stripe retry helper
jest.mock('@/lib/stripe-retry', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

// Mock rate limiting
jest.mock('@/app/api/_middleware/rate-limit', () => ({
  checkRateLimit: jest.fn(() => null),
  getRateLimitHeaders: jest.fn(() => ({
    'X-RateLimit-Limit': '5',
    'X-RateLimit-Remaining': '4',
    'X-RateLimit-Reset': String(Date.now() + 600000),
  })),
}));

import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { getStripeClient } from '@/lib/stripe';
import { checkRateLimit } from '@/app/api/_middleware/rate-limit';

describe('PATCH /api/subscriptions/change-plan', () => {
  let mockSupabase: any;
  let mockStripe: any;

  beforeEach(() => {
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
        update: jest.fn(),
      },
      subscriptionSchedules: {
        create: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
        release: jest.fn(),
      },
    };
    (getStripeClient as jest.Mock).mockReturnValue(mockStripe);
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(401);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
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
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + 600000),
          },
        }
      );

      (checkRateLimit as jest.Mock).mockReturnValueOnce(rateLimitResponse);

      const request = createPatchRequest({ newPlanType: 'annual' });
      const response = await PATCH(request as any);

      expect(response.status).toBe(429);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  });

  describe('Request validation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = new Request(
        'http://localhost:3000/api/subscriptions/change-plan',
        {
          method: 'PATCH',
          body: 'invalid json',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const response = await PATCH(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 when newPlanType is missing', async () => {
      const request = createPatchRequest({});

      const response = await PATCH(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });

    it('should return 400 for invalid plan type', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'active',
                plan_type: 'monthly',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = createPatchRequest({ newPlanType: 'invalid_plan' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_PLAN');
    });
  });

  describe('Subscription checks', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 404 when user has no subscription', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            }),
          }),
        }),
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(404);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
    });

    it('should return 400 when subscription is not active', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'canceled',
                plan_type: 'monthly',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SUBSCRIPTION_NOT_ACTIVE');
    });

    it('should return 400 when new plan is same as current', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'active',
                plan_type: 'monthly',
                stripe_subscription_id: 'sub_stripe123',
                stripe_price_id: 'price_monthly_test',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = createPatchRequest({ newPlanType: 'monthly' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SAME_PLAN');
    });
  });

  describe('Plan change scenarios', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should upgrade from monthly to annual with immediate proration', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        status: 'active',
        plan_type: 'monthly',
        stripe_subscription_id: 'sub_stripe123',
        stripe_price_id: 'price_monthly_test',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSubscription,
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        items: {
          data: [{ id: 'si_test123', price: { id: 'price_monthly_test' } }],
        },
        schedule: null,
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription.planType).toBe('annual');

      // Verify immediate proration was used
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe123',
        expect.objectContaining({
          items: [{ id: 'si_test123', price: 'price_annual_test' }],
          proration_behavior: 'create_prorations',
          metadata: {
            user_id: 'test-user-id',
            plan_type: 'annual',
          },
        }),
        expect.any(Object)
      );
    });

    it('should downgrade from annual to monthly at period end', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        status: 'active',
        plan_type: 'annual',
        stripe_subscription_id: 'sub_stripe123',
        stripe_price_id: 'price_annual_test',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSubscription,
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      const currentTime = Math.floor(Date.now() / 1000);
      const periodEnd = currentTime + 30 * 24 * 60 * 60;

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        items: {
          data: [{ id: 'si_test123', price: { id: 'price_annual_test' } }],
        },
        schedule: null,
      });

      mockStripe.subscriptionSchedules.create.mockResolvedValue({
        id: 'sub_sched_123',
      });

      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_123',
        phases: [
          {
            start_date: currentTime,
            end_date: periodEnd,
            items: [{ price: 'price_annual_test', quantity: 1 }],
          },
        ],
      });

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: 'sub_sched_123',
        phases: [
          {
            start_date: currentTime,
            end_date: periodEnd,
            items: [{ price: 'price_annual_test', quantity: 1 }],
          },
          {
            items: [{ price: 'price_monthly_test', quantity: 1 }],
          },
        ],
      });

      const request = createPatchRequest({ newPlanType: 'monthly' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription.planType).toBe('monthly');

      // Verify subscription schedule was created
      expect(mockStripe.subscriptionSchedules.create).toHaveBeenCalled();
      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledWith(
        'sub_sched_123',
        expect.objectContaining({
          phases: expect.arrayContaining([
            expect.objectContaining({
              items: [{ price: 'price_annual_test', quantity: 1 }],
            }),
            expect.objectContaining({
              items: [{ price: 'price_monthly_test', quantity: 1 }],
            }),
          ]),
          end_behavior: 'release',
        })
      );
    });

    it('should change plan immediately during trial with no proration', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        status: 'trialing',
        plan_type: 'monthly',
        stripe_subscription_id: 'sub_stripe123',
        stripe_price_id: 'price_monthly_test',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSubscription,
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      const trialEnd = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'trialing',
        trial_end: trialEnd,
        items: {
          data: [{ id: 'si_test123', price: { id: 'price_monthly_test' } }],
        },
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'trialing',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: trialEnd,
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription.planType).toBe('annual');

      // Verify no proration during trial
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe123',
        expect.objectContaining({
          items: [{ id: 'si_test123', price: 'price_annual_test' }],
          proration_behavior: 'none',
          trial_end: trialEnd,
        }),
        expect.any(Object)
      );
    });

    it('should include rate limit headers in successful response', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        status: 'active',
        plan_type: 'monthly',
        stripe_subscription_id: 'sub_stripe123',
        stripe_price_id: 'price_monthly_test',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSubscription,
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        items: {
          data: [{ id: 'si_test123' }],
        },
        schedule: null,
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('4');
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 500 when Stripe subscription update fails', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        status: 'active',
        plan_type: 'monthly',
        stripe_subscription_id: 'sub_stripe123',
        stripe_price_id: 'price_monthly_test',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSubscription,
              error: null,
            }),
          }),
        }),
      });

      mockStripe.subscriptions.retrieve.mockRejectedValue(
        new Error('Stripe API error')
      );

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 500 when database update fails', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'test-user-id',
        status: 'active',
        plan_type: 'monthly',
        stripe_subscription_id: 'sub_stripe123',
        stripe_price_id: 'price_monthly_test',
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockSubscription,
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                error: { message: 'Database update failed' },
              }),
            }),
          };
        }
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        items: {
          data: [{ id: 'si_test123' }],
        },
        schedule: null,
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      });

      const request = createPatchRequest({ newPlanType: 'annual' });

      const response = await PATCH(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });
  });
});
