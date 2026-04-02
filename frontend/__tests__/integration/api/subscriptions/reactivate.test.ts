/**
 * Integration tests for POST /api/subscriptions/reactivate
 * Tests authentication, subscription status checks, and reactivation of canceled subscriptions
 */

import { POST } from '@/app/api/subscriptions/reactivate/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Helper to create POST request
function createPostRequest() {
  return new Request('http://localhost:3000/api/subscriptions/reactivate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

// Mock Supabase client
jest.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: jest.fn(),
  createAuthenticatedSupabaseClient: jest.fn(),
}));

// Mock Stripe client
jest.mock('@/lib/stripe', () => ({
  getStripeClient: jest.fn(),
}));

// Mock Stripe helpers
jest.mock('@/lib/stripe-helpers', () => ({
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

describe('POST /api/subscriptions/reactivate', () => {
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
        update: jest.fn(),
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

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(401);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
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

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(404);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
    });

    it('should return 409 when subscription is not scheduled for cancellation', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'active',
                cancel_at_period_end: false,
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000
                ).toISOString(),
              },
              error: null,
            }),
          }),
        }),
      });

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(409);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_CANCELED');
    });

    it('should return 403 when subscription period has already ended', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'canceled',
                cancel_at_period_end: true,
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(
                  Date.now() - 24 * 60 * 60 * 1000
                ).toISOString(), // Yesterday
              },
              error: null,
            }),
          }),
        }),
      });

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(403);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN_OPERATION');
    });
  });

  describe('Subscription reactivation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should successfully reactivate canceled subscription', async () => {
      const periodEnd = Math.floor(
        (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000
      );

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'active',
                plan_type: 'monthly',
                cancel_at_period_end: true,
                canceled_at: new Date().toISOString(),
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(periodEnd * 1000).toISOString(),
              },
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

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              id: 'si_test123',
              current_period_end: periodEnd,
            },
          ],
        },
      });

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription.status).toBe('active');
      expect(body.subscription.cancelAtPeriodEnd).toBe(false);
      expect(body.subscription.currentPeriodEnd).toBeDefined();

      // Verify Stripe was updated
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe123',
        {
          cancel_at_period_end: false,
        },
        expect.objectContaining({
          idempotencyKey: 'test-idempotency-key',
        })
      );

      // Verify database was updated with cancel_at_period_end: false and canceled_at: null
      expect(mockSupabase.from).toHaveBeenCalledWith('subscriptions');
    });

    it('should reactivate subscription that was canceled during trial', async () => {
      const trialEnd = Math.floor(
        (Date.now() + 14 * 24 * 60 * 60 * 1000) / 1000
      );

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'trialing',
                plan_type: 'monthly',
                cancel_at_period_end: true,
                canceled_at: new Date().toISOString(),
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(trialEnd * 1000).toISOString(),
              },
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

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'trialing',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              id: 'si_test123',
              current_period_end: trialEnd,
            },
          ],
        },
      });

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);

      expect(body.success).toBe(true);
      expect(body.subscription.cancelAtPeriodEnd).toBe(false);
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
      const periodEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'active',
                cancel_at_period_end: true,
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(periodEnd).toISOString(),
              },
              error: null,
            }),
          }),
        }),
      });

      mockStripe.subscriptions.update.mockRejectedValue(
        new Error('Stripe API error')
      );

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 500 when database update fails', async () => {
      const periodEnd = Math.floor(
        (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000
      );

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sub_123',
                    user_id: 'test-user-id',
                    status: 'active',
                    cancel_at_period_end: true,
                    stripe_subscription_id: 'sub_stripe123',
                    current_period_end: new Date(
                      periodEnd * 1000
                    ).toISOString(),
                  },
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

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              id: 'si_test123',
              current_period_end: periodEnd,
            },
          ],
        },
      });

      const request = createPostRequest();

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.success).toBe(false);
    });
  });
});
