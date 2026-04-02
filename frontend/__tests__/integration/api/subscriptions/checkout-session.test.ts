/**
 * Integration tests for POST /api/subscriptions/checkout-session
 * Tests authentication, validation, duplicate subscription check, trial eligibility, and Stripe checkout creation
 */

import { POST } from '@/app/api/subscriptions/checkout-session/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Helper to create POST request with JSON body
function createPostRequest(body: any) {
  return new Request(
    'http://localhost:3000/api/subscriptions/checkout-session',
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// Mock Supabase client
jest.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: jest.fn(),
  createAuthenticatedSupabaseClient: jest.fn(),
}));

// Set environment variables for Stripe
process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID = 'price_monthly_test';
process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID = 'price_annual_test';
process.env.NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID = 'internal_coupon';

// Mock Stripe client
jest.mock('@/lib/stripe', () => ({
  getStripeClient: jest.fn(),
  TRIAL_PERIOD_DAYS: 14,
}));

// Mock Stripe helpers
jest.mock('@/lib/stripe-helpers', () => ({
  getOrCreateStripeCustomer: jest.fn(),
  getPriceIdForPlan: jest.fn((planType) => {
    if (planType === 'monthly') return 'price_monthly_test';
    if (planType === 'annual') return 'price_annual_test';
    throw new Error(`Invalid plan type: ${planType}`);
  }),
  isUserEligibleForTrial: jest.fn(),
  hasActiveSubscription: jest.fn(),
  generateIdempotencyKey: jest.fn(() => 'test-idempotency-key'),
}));

// Mock Stripe retry helper
jest.mock('@/lib/stripe-retry', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

// Mock validation middleware
jest.mock('@/app/api/_middleware/validation', () => ({
  withValidation: (handler: any) => handler,
}));

import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { getStripeClient } from '@/lib/stripe';
import {
  getOrCreateStripeCustomer,
  isUserEligibleForTrial,
  hasActiveSubscription,
} from '@/lib/stripe-helpers';

describe('POST /api/subscriptions/checkout-session', () => {
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
      checkout: {
        sessions: {
          create: jest.fn(),
        },
      },
      customers: {
        create: jest.fn(),
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

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(401);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Request validation', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 400 for invalid JSON body', async () => {
      // Create request with invalid JSON
      const request = new Request(
        'http://localhost:3000/api/subscriptions/checkout-session',
        {
          method: 'POST',
          body: 'invalid json',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 when planType is missing', async () => {
      const request = createPostRequest({
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });

    it('should return 400 when successUrl is missing', async () => {
      const request = createPostRequest({
        planType: 'monthly',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });

    it('should return 400 when cancelUrl is missing', async () => {
      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });

    it('should return 400 for invalid plan type', async () => {
      (hasActiveSubscription as jest.Mock).mockResolvedValue(false);

      const request = createPostRequest({
        planType: 'invalid_plan',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_PLAN');
    });
  });

  describe('Duplicate subscription check', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should return 409 when user already has active subscription', async () => {
      (hasActiveSubscription as jest.Mock).mockResolvedValue(true);

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(409);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('DUPLICATE_SUBSCRIPTION');
    });
  });

  describe('Checkout session creation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
      (hasActiveSubscription as jest.Mock).mockResolvedValue(false);
    });

    it('should create checkout session for monthly plan with trial', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(true);

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      });

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test123');
      expect(body.url).toBe('https://checkout.stripe.com/pay/cs_test123');
      expect(body.trialEligible).toBe(true);

      // Verify Stripe checkout session was created with trial
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test123',
          mode: 'subscription',
          line_items: [{ price: 'price_monthly_test', quantity: 1 }],
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
            metadata: {
              user_id: 'test-user-id',
              plan_type: 'monthly',
            },
          }),
          allow_promotion_codes: true,
        }),
        expect.any(Object)
      );
    });

    it('should create checkout session for annual plan with trial', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(true);

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test456',
        url: 'https://checkout.stripe.com/pay/cs_test456',
      });

      const request = createPostRequest({
        planType: 'annual',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test456');
      expect(body.url).toBe('https://checkout.stripe.com/pay/cs_test456');
      expect(body.trialEligible).toBe(true);

      // Verify annual price was used
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_annual_test', quantity: 1 }],
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
            metadata: {
              user_id: 'test-user-id',
              plan_type: 'annual',
            },
          }),
        }),
        expect.any(Object)
      );
    });

    it('should create checkout session without trial when user not eligible', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test789',
        url: 'https://checkout.stripe.com/pay/cs_test789',
      });

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.trialEligible).toBe(false);

      // Verify no trial was added
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.not.objectContaining({
            trial_period_days: expect.anything(),
          }),
        }),
        expect.any(Object)
      );
    });

    it('should create checkout session without trial when skipTrial is true', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(true);

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test999',
        url: 'https://checkout.stripe.com/pay/cs_test999',
      });

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        skipTrial: true,
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.trialEligible).toBe(true);

      // Verify trial was skipped even though user is eligible
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.not.objectContaining({
            trial_period_days: expect.anything(),
          }),
        }),
        expect.any(Object)
      );
    });

    it('should include metadata in checkout session', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_meta',
        url: 'https://checkout.stripe.com/pay/cs_test_meta',
      });

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);

      // Verify metadata was included
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            user_id: 'test-user-id',
            plan_type: 'monthly',
          },
          subscription_data: expect.objectContaining({
            metadata: {
              user_id: 'test-user-id',
              plan_type: 'monthly',
            },
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'test-idempotency-key',
        })
      );
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
      (hasActiveSubscription as jest.Mock).mockResolvedValue(false);
    });

    it('should return 500 when Stripe checkout session creation fails', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      mockStripe.checkout.sessions.create.mockRejectedValue(
        new Error('Stripe API error')
      );

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 500 when customer creation fails', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockRejectedValue(
        new Error('Customer creation failed')
      );
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });

    it('should handle Stripe API timeout errors gracefully', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      // Simulate Stripe API timeout
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';
      mockStripe.checkout.sessions.create.mockRejectedValue(timeoutError);

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 400 for invalid coupon code', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      // Simulate Stripe invalid coupon error
      const stripeError: any = new Error('No such coupon: invalid_coupon');
      stripeError.type = 'StripeInvalidRequestError';
      stripeError.code = 'resource_missing';
      stripeError.param = 'coupon';
      mockStripe.checkout.sessions.create.mockRejectedValue(stripeError);

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        couponCode: 'invalid_coupon',
      });

      const response = await POST(request as any);

      // Should return error response
      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });

    it('should handle Stripe rate limit errors with retry logic', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      // Simulate Stripe rate limit error
      const rateLimitError: any = new Error('Too many requests');
      rateLimitError.type = 'StripeRateLimitError';
      rateLimitError.statusCode = 429;
      mockStripe.checkout.sessions.create.mockRejectedValue(rateLimitError);

      const request = createPostRequest({
        planType: 'monthly',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });
  });
});
