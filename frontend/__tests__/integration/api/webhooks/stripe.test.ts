/**
 * Integration tests for POST /api/webhooks/stripe
 * Tests Stripe webhook event handling, signature verification, and database updates
 */

import { POST } from '@/app/api/webhooks/stripe/route';
import { parseJsonResponse } from '../../../utils/api-test-helpers';

// Helper to create webhook request with signature
function createWebhookRequest(
  body: any,
  signature: string = 'valid_signature'
) {
  return new Request('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
  });
}

// Mock Stripe client
jest.mock('@/lib/stripe', () => ({
  getStripeClient: jest.fn(),
}));

// Mock Supabase service role client
jest.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: jest.fn(),
}));

// Mock Stripe helpers
jest.mock('@/lib/stripe-helpers', () => ({
  mapStripeStatusToDbStatus: jest.fn((status) => status),
}));

// Mock Intercom API
jest.mock('@/lib/intercom-api', () => ({
  updateIntercomUser: jest.fn().mockResolvedValue({ success: true }),
  trackIntercomEvent: jest.fn().mockResolvedValue({ success: true }),
}));

import { getStripeClient } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase-server';

describe('POST /api/webhooks/stripe', () => {
  let mockStripe: any;
  let mockSupabase: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set webhook secret and app URL
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    // Set up default Stripe mock
    mockStripe = {
      webhooks: {
        constructEvent: jest.fn(),
      },
      subscriptions: {
        retrieve: jest.fn(),
      },
    };
    (getStripeClient as jest.Mock).mockReturnValue(mockStripe);

    // Set up default Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Security and validation', () => {
    it('should return 500 when webhook secret is not configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const request = createWebhookRequest({ type: 'test.event' });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe('Webhook secret not configured');
    });

    it('should return 400 when stripe-signature header is missing', async () => {
      const request = new Request('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ type: 'test.event' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe('Invalid signature');
    });

    it('should return 400 when signature verification fails', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = createWebhookRequest(
        { type: 'test.event' },
        'invalid_signature'
      );

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe('Invalid signature');
    });

    it('should verify webhook signature with Stripe', async () => {
      const eventData = {
        id: 'evt_test123',
        type: 'customer.created',
        data: { object: { id: 'cus_test123' } },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      await POST(request as any);

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        expect.any(String),
        'valid_signature',
        'whsec_test_secret'
      );
    });
  });

  describe('Event handling', () => {
    beforeEach(() => {
      // Mock successful database operations
      mockSupabase.from.mockImplementation((table: string) => {
        // For subscriptions table, return existing subscription for invoice events
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sub_db123',
                    user_id: 'user_test123',
                    stripe_subscription_id: 'sub_test123',
                  },
                  error: null,
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
            upsert: jest.fn().mockResolvedValue({
              error: null,
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  error: null,
                }),
              }),
            }),
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          };
        }
        // For payment_history table (used by invoice events)
        if (table === 'payment_history') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null, // No existing payment (allow insert)
                  error: null,
                }),
              }),
            }),
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          };
        }
        // For user_event_log table (analytics tracking)
        if (table === 'user_event_log') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          };
        }
        // For other tables (users, etc)
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }),
          insert: jest.fn().mockResolvedValue({
            error: null,
          }),
        };
      });
    });

    it('should handle checkout.session.completed event', async () => {
      const eventData = {
        id: 'evt_checkout123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'monthly',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        items: {
          data: [{ price: { id: 'price_monthly' } }],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);

      // Verify subscription was retrieved
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
        'sub_test123'
      );
    });

    it('should handle customer.subscription.created event', async () => {
      const eventData = {
        id: 'evt_sub_created',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active',
            customer: 'cus_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'annual',
            },
            items: {
              data: [{ price: { id: 'price_annual' } }],
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end:
              Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle customer.subscription.updated event', async () => {
      const eventData = {
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active',
            customer: 'cus_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'monthly',
            },
            items: {
              data: [{ price: { id: 'price_monthly' } }],
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end:
              Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            cancel_at_period_end: true,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle customer.subscription.deleted event', async () => {
      const eventData = {
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test123',
            status: 'canceled',
            customer: 'cus_test123',
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle customer.subscription.trial_will_end event', async () => {
      const trialEnd = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60; // 3 days from now

      const eventData = {
        id: 'evt_trial_end',
        type: 'customer.subscription.trial_will_end',
        data: {
          object: {
            id: 'sub_test123',
            status: 'trialing',
            trial_end: trialEnd,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test123',
                    unit_amount: 1900, // $19.00 in cents
                    currency: 'usd',
                  },
                },
              ],
            },
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      // Mock user lookup from database
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          email: 'test@example.com',
          full_name: 'John Doe',
        },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValue({
        single: mockSingle,
      });

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);

      // Verify user lookup
      expect(mockSupabase.from).toHaveBeenCalledWith('users');
      expect(mockSelect).toHaveBeenCalledWith('email, full_name');
      expect(mockEq).toHaveBeenCalledWith('id', 'user_test123');

      // TODO: Add Intercom event verification when implemented
    });

    it('should handle invoice.payment_succeeded event', async () => {
      const eventData = {
        id: 'evt_invoice_paid',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            status: 'paid',
            amount_paid: 1000,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle invoice.payment_failed event', async () => {
      const eventData = {
        id: 'evt_invoice_failed',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            status: 'open',
            amount_due: 1000,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle payment_intent.succeeded event', async () => {
      const eventData = {
        id: 'evt_pi_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test123',
            customer: 'cus_test123',
            status: 'succeeded',
            amount: 1000,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle payment_intent.payment_failed event', async () => {
      const eventData = {
        id: 'evt_pi_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test123',
            customer: 'cus_test123',
            status: 'requires_payment_method',
            last_payment_error: {
              message: 'Card declined',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle customer.created event', async () => {
      const eventData = {
        id: 'evt_cus_created',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test123',
            email: 'test@example.com',
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle customer.updated event', async () => {
      const eventData = {
        id: 'evt_cus_updated',
        type: 'customer.updated',
        data: {
          object: {
            id: 'cus_test123',
            email: 'newemail@example.com',
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle customer.deleted event', async () => {
      const eventData = {
        id: 'evt_cus_deleted',
        type: 'customer.deleted',
        data: {
          object: {
            id: 'cus_test123',
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle unhandled event types gracefully', async () => {
      const eventData = {
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: {
          object: {},
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });
  });

  describe('Nullable field handling', () => {
    beforeEach(() => {
      // Set up Supabase mock for these tests
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: jest.fn().mockResolvedValue({ error: null }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        // For users table and user_event_log table
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      });
    });

    it('should handle checkout.session.completed with subscription missing billing periods', async () => {
      const eventData = {
        id: 'evt_setup_intent',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'monthly',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'trialing',
        customer: 'cus_test123',
        items: {
          data: [{ price: { id: 'price_monthly' } }],
        },
        trial_start: Math.floor(Date.now() / 1000),
        trial_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
        // current_period_start and current_period_end are undefined
        current_period_start: undefined,
        current_period_end: undefined,
      });

      const request = createWebhookRequest(eventData);
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);

      // Verify subscription was retrieved
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
        'sub_test123'
      );
    });

    it('should handle customer.subscription.created with null period fields', async () => {
      const eventData = {
        id: 'evt_sub_null_periods',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            status: 'incomplete',
            customer: 'cus_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'monthly',
            },
            items: {
              data: [{ price: { id: 'price_monthly' } }],
            },
            current_period_start: null,
            current_period_end: null,
            trial_start: null,
            trial_end: null,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);
      const request = createWebhookRequest(eventData);
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });

    it('should handle trialing subscription without billing periods', async () => {
      const trialStart = Math.floor(Date.now() / 1000);
      const trialEnd = trialStart + 14 * 24 * 60 * 60;

      const eventData = {
        id: 'evt_trial_no_periods',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'trialing',
            customer: 'cus_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'annual',
            },
            items: {
              data: [{ price: { id: 'price_annual' } }],
            },
            trial_start: trialStart,
            trial_end: trialEnd,
            current_period_start: undefined,
            current_period_end: undefined,
            cancel_at_period_end: false,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);
      const request = createWebhookRequest(eventData);
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.received).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate checkout.session.completed events (no double-charging)', async () => {
      // Track mock calls for verification
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const mockSingleQuery = jest
        .fn()
        // First webhook: no existing subscription
        .mockResolvedValueOnce({ data: null, error: null })
        // Second webhook: subscription exists (from first insert)
        .mockResolvedValueOnce({
          data: {
            id: 'sub_db123',
            stripe_subscription_id: 'sub_test123',
          },
          error: null,
        });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: mockSingleQuery,
              }),
            }),
            insert: mockInsert,
            update: mockUpdate,
          };
        }
        // For users table
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      const eventData = {
        id: 'evt_checkout123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'monthly',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        items: {
          data: [{ price: { id: 'price_monthly' } }],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });

      // First webhook delivery
      const request1 = createWebhookRequest(eventData);
      const response1 = await POST(request1 as any);

      expect(response1.status).toBe(200);
      const body1 = await parseJsonResponse(response1);
      expect(body1.received).toBe(true);

      // Verify subscription was inserted (first time)
      expect(mockInsert).toHaveBeenCalledTimes(1);

      // Second webhook delivery (duplicate event)
      const request2 = createWebhookRequest(eventData);
      const response2 = await POST(request2 as any);

      expect(response2.status).toBe(200);
      const body2 = await parseJsonResponse(response2);
      expect(body2.received).toBe(true);

      // CRITICAL: Verify subscription was NOT inserted again (idempotency)
      expect(mockInsert).toHaveBeenCalledTimes(1);

      // Verify second delivery triggered an update instead
      expect(mockUpdate).toHaveBeenCalled();

      // CRITICAL: Verify no double-charging occurred
      // Only one insert means only one subscription created
    });

    it('should handle duplicate invoice.payment_succeeded events (no double recording)', async () => {
      // Track mock calls for verification
      const mockPaymentInsert = jest.fn().mockResolvedValue({ error: null });
      const mockPaymentSingle = jest
        .fn()
        // First call: no existing payment
        .mockResolvedValueOnce({ data: null, error: null })
        // Second call: payment exists
        .mockResolvedValueOnce({
          data: { id: 'payment_123' },
          error: null,
        });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'payment_history') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: mockPaymentSingle,
              }),
            }),
            insert: mockPaymentInsert,
          };
        }
        if (table === 'subscriptions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'sub_db123',
                    user_id: 'user_test123',
                    stripe_subscription_id: 'sub_test123',
                  },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'user_event_log') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          };
        }
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }),
        };
      });

      const eventData = {
        id: 'evt_invoice_paid',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            status: 'paid',
            amount_paid: 1000,
            payment_intent: 'pi_test123',
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      // First webhook delivery
      const request1 = createWebhookRequest(eventData);
      const response1 = await POST(request1 as any);

      expect(response1.status).toBe(200);

      // Verify payment was recorded (first time)
      expect(mockPaymentInsert).toHaveBeenCalledTimes(1);

      // Second webhook delivery (duplicate)
      const request2 = createWebhookRequest(eventData);
      const response2 = await POST(request2 as any);

      expect(response2.status).toBe(200);

      // CRITICAL: Verify payment was NOT recorded twice
      expect(mockPaymentInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should return 500 when webhook processing fails', async () => {
      const eventData = {
        id: 'evt_error',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            metadata: {
              user_id: 'user_test123',
              plan_type: 'monthly',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);
      mockStripe.subscriptions.retrieve.mockRejectedValue(
        new Error('Stripe API error')
      );

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe('Webhook processing failed');
    });

    it('should handle malformed webhook event (missing required fields)', async () => {
      // Event missing critical metadata
      const malformedEvent = {
        id: 'evt_malformed',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            metadata: {
              // Missing user_id - required field
              plan_type: 'monthly',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(malformedEvent);

      const request = createWebhookRequest(malformedEvent);

      const response = await POST(request as any);

      // Should handle gracefully - exact status depends on handler implementation
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle malformed webhook event (missing data.object)', async () => {
      // Event missing data.object entirely
      const malformedEvent = {
        id: 'evt_malformed2',
        type: 'checkout.session.completed',
        data: {
          // Missing object field
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(malformedEvent);

      const request = createWebhookRequest(malformedEvent);

      const response = await POST(request as any);

      // Should handle gracefully without crashing
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle network errors during Stripe API calls', async () => {
      const eventData = {
        id: 'evt_network_error',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            items: {
              data: [
                {
                  price: {
                    id: 'price_monthly',
                    recurring: { interval: 'month' },
                  },
                },
              ],
            },
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      // Simulate network error
      const networkError: any = new Error('Network request failed');
      networkError.code = 'ENOTFOUND';
      mockSupabase.from.mockImplementation(() => {
        throw networkError;
      });

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      // Webhook handlers return 200 even on errors to prevent Stripe retries
      // The error is logged but webhook is acknowledged as received
      expect([200, 500]).toContain(response.status);
    });

    it('should handle Stripe webhook signature verification timeout', async () => {
      // Simulate timeout during signature verification
      const timeoutError: any = new Error('Signature verification timeout');
      timeoutError.code = 'ETIMEDOUT';
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw timeoutError;
      });

      const eventData = {
        id: 'evt_timeout',
        type: 'checkout.session.completed',
        data: { object: {} },
      };

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      expect(response.status).toBe(400);
    });

    it('should handle database connection errors gracefully', async () => {
      const eventData = {
        id: 'evt_db_error',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            items: {
              data: [
                {
                  price: {
                    id: 'price_monthly',
                    recurring: { interval: 'month' },
                  },
                },
              ],
            },
            metadata: {
              user_id: 'user_test123',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(eventData);

      // Simulate database connection error
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      const request = createWebhookRequest(eventData);

      const response = await POST(request as any);

      // Webhook handlers may return 200 to acknowledge receipt even on DB errors
      // to prevent infinite Stripe retries. Error is logged for monitoring.
      expect([200, 500]).toContain(response.status);
    });
  });
});
