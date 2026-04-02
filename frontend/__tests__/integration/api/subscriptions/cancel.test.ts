/**
 * Integration tests for POST /api/subscriptions/cancel
 * Tests authentication, subscription status checks, and cancellation at period end
 */

import { POST } from '@/app/api/subscriptions/cancel/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Helper to create POST request
function createPostRequest() {
  return new Request('http://localhost:3000/api/subscriptions/cancel', {
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

describe('POST /api/subscriptions/cancel', () => {
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
        retrieve: jest.fn(),
        cancel: jest.fn(),
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

    it('should return 403 when subscription is not active', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'canceled',
                cancel_at_period_end: false,
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

    it('should return 409 when subscription is already scheduled for cancellation', async () => {
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
      expect(body.error.code).toBe('ALREADY_CANCELED');
    });
  });

  describe('Subscription cancellation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });
    });

    it('should successfully cancel active subscription at period end', async () => {
      const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'active',
                plan_type: 'monthly',
                cancel_at_period_end: false,
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(periodEnd * 1000).toISOString(),
              },
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{ id: 'sub_123' }],
              error: null,
            }),
          }),
        }),
      });

      // Mock subscription retrieve (no schedule)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        schedule: null, // No schedule attached
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        cancel_at_period_end: true,
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
      expect(body.subscription.cancelAtPeriodEnd).toBe(true);
      expect(body.subscription.canceledAt).toBeDefined();
      expect(body.subscription.accessUntil).toBeDefined();

      // Verify Stripe was updated with cancel_at_period_end
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe123',
        {
          cancel_at_period_end: true,
        },
        expect.objectContaining({
          idempotencyKey: 'test-idempotency-key',
        })
      );

      // Verify database was updated
      expect(mockSupabase.from).toHaveBeenCalledWith('subscriptions');
    });

    it('should successfully cancel trialing subscription', async () => {
      const trialEnd = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'sub_123',
                user_id: 'test-user-id',
                status: 'trialing',
                plan_type: 'monthly',
                cancel_at_period_end: false,
                stripe_subscription_id: 'sub_stripe123',
                current_period_end: new Date(trialEnd * 1000).toISOString(),
              },
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{ id: 'sub_123' }],
              error: null,
            }),
          }),
        }),
      });

      // Mock subscription retrieve (no schedule)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        schedule: null,
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        cancel_at_period_end: true,
        status: 'trialing',
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
      expect(body.subscription.cancelAtPeriodEnd).toBe(true);
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
              },
              error: null,
            }),
          }),
        }),
      });

      // Mock subscription retrieve (no schedule)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        schedule: null,
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
                    cancel_at_period_end: false,
                    stripe_subscription_id: 'sub_stripe123',
                  },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
      });

      // Mock subscription retrieve (no schedule)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        schedule: null,
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        cancel_at_period_end: true,
        items: {
          data: [
            {
              id: 'si_test123',
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
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
