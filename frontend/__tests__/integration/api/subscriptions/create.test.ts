/**
 * Integration tests for POST /api/subscriptions/create
 * Tests direct subscription creation without Checkout Session
 */

import { POST } from '@/app/api/subscriptions/create/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Helper to create POST request with JSON body
function createPostRequest(body: any) {
  return new Request('http://localhost:3000/api/subscriptions/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
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
  mapStripeStatusToDbStatus: jest.fn((status) => status),
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

describe('POST /api/subscriptions/create', () => {
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

      const request = createPostRequest({ planType: 'monthly' });

      const response = await POST(request as any);

      expect(response.status).toBe(401);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
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
        'http://localhost:3000/api/subscriptions/create',
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
      const request = createPostRequest({});

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });

    it('should return 400 for invalid plan type', async () => {
      (hasActiveSubscription as jest.Mock).mockResolvedValue(false);

      const request = createPostRequest({ planType: 'invalid_plan' });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_PLAN');
    });

    it('should return 409 when user already has active subscription', async () => {
      (hasActiveSubscription as jest.Mock).mockResolvedValue(true);

      const request = createPostRequest({ planType: 'monthly' });

      const response = await POST(request as any);

      expect(response.status).toBe(409);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('DUPLICATE_SUBSCRIPTION');
    });
  });

  describe('Subscription creation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
      (hasActiveSubscription as jest.Mock).mockResolvedValue(false);

      // Mock successful database operations
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          };
        }
        if (table === 'users') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                error: null,
              }),
            }),
          };
        }
      });
    });

    it('should create subscription with trial when eligible', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(true);

      const currentTime = Math.floor(Date.now() / 1000);
      const trialEnd = currentTime + 14 * 24 * 60 * 60;

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'trialing',
        customer: 'cus_test123',
        trial_start: currentTime,
        trial_end: trialEnd,
        current_period_start: currentTime,
        current_period_end: trialEnd,
        latest_invoice: null,
      });

      const request = createPostRequest({ planType: 'monthly' });

      const response = await POST(request as any);

      expect(response.status).toBe(201);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription).toBeDefined();

      // Verify trial was added
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test123',
          items: [{ price: 'price_monthly_test' }],
          trial_period_days: 14,
          metadata: {
            user_id: 'test-user-id',
            plan_type: 'monthly',
          },
        }),
        expect.any(Object)
      );
    });

    it('should create subscription without trial when not eligible', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      const currentTime = Math.floor(Date.now() / 1000);

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'incomplete',
        customer: 'cus_test123',
        current_period_start: currentTime,
        current_period_end: currentTime + 30 * 24 * 60 * 60,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_test',
          },
        },
      });

      const request = createPostRequest({ planType: 'monthly' });

      const response = await POST(request as any);

      expect(response.status).toBe(201);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);

      // Verify no trial was added
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          trial_period_days: expect.anything(),
        }),
        expect.any(Object)
      );
    });

    it('should create subscription without trial when applyTrial is false', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(true);

      const currentTime = Math.floor(Date.now() / 1000);

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'incomplete',
        customer: 'cus_test123',
        current_period_start: currentTime,
        current_period_end: currentTime + 30 * 24 * 60 * 60,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_test',
          },
        },
      });

      const request = createPostRequest({
        planType: 'monthly',
        applyTrial: false,
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);

      // Verify no trial was added
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          trial_period_days: expect.anything(),
        }),
        expect.any(Object)
      );
    });

    it('should create subscription with coupon code', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      const currentTime = Math.floor(Date.now() / 1000);

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        customer: 'cus_test123',
        current_period_start: currentTime,
        current_period_end: currentTime + 30 * 24 * 60 * 60,
        latest_invoice: null,
      });

      const request = createPostRequest({
        planType: 'monthly',
        couponCode: 'PROMO50',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);

      // Verify coupon was applied
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          coupon: 'PROMO50',
        }),
        expect.any(Object)
      );
    });

    it('should create subscription with internal coupon (100% off)', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      const currentTime = Math.floor(Date.now() / 1000);

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        customer: 'cus_test123',
        current_period_start: currentTime,
        current_period_end: currentTime + 30 * 24 * 60 * 60,
        latest_invoice: null,
      });

      const request = createPostRequest({
        planType: 'monthly',
        couponCode: 'internal_coupon',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(201);

      // Verify internal coupon was applied and payment fields removed
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          coupon: 'internal_coupon',
        }),
        expect.any(Object)
      );
    });

    it('should create annual subscription', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      const currentTime = Math.floor(Date.now() / 1000);

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'incomplete',
        customer: 'cus_test123',
        current_period_start: currentTime,
        current_period_end: currentTime + 365 * 24 * 60 * 60,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_test',
          },
        },
      });

      const request = createPostRequest({ planType: 'annual' });

      const response = await POST(request as any);

      expect(response.status).toBe(201);

      // Verify annual price was used
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ price: 'price_annual_test' }],
          metadata: {
            user_id: 'test-user-id',
            plan_type: 'annual',
          },
        }),
        expect.any(Object)
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

    it('should return 500 when Stripe subscription creation fails', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      mockStripe.subscriptions.create.mockRejectedValue(
        new Error('Stripe API error')
      );

      const request = createPostRequest({ planType: 'monthly' });

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

      const request = createPostRequest({ planType: 'monthly' });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });

    it('should return 500 when database insert fails', async () => {
      (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue('cus_test123');
      (isUserEligibleForTrial as jest.Mock).mockResolvedValue(false);

      const currentTime = Math.floor(Date.now() / 1000);

      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'incomplete',
        customer: 'cus_test123',
        current_period_start: currentTime,
        current_period_end: currentTime + 30 * 24 * 60 * 60,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_test',
          },
        },
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: { message: 'Database insert failed' },
            }),
          };
        }
      });

      const request = createPostRequest({ planType: 'monthly' });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });
  });
});
