/**
 * MSW (Mock Service Worker) handlers for integration tests
 * Mocks external API calls to Supabase and Stripe
 */

import { http, HttpResponse } from 'msw';

// Mock Supabase URL (from environment or default)
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';

/**
 * Default MSW handlers
 * Can be overridden in individual tests using server.use()
 */
export const handlers = [
  // ============================================
  // Supabase Auth Handlers
  // ============================================

  // GET /auth/v1/user - Get authenticated user
  http.get(`${SUPABASE_URL}/auth/v1/user`, () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    });
  }),

  // ============================================
  // Supabase Database Handlers
  // ============================================

  // GET /rest/v1/subscriptions - Fetch subscription
  http.get(`${SUPABASE_URL}/rest/v1/subscriptions`, ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');

    // Default: return active subscription
    return HttpResponse.json([
      {
        id: 'sub_123',
        user_id: userId || 'test-user-id',
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
      },
    ]);
  }),

  // PATCH /rest/v1/subscriptions - Update subscription
  http.patch(`${SUPABASE_URL}/rest/v1/subscriptions`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json([
      {
        ...body,
        updated_at: new Date().toISOString(),
      },
    ]);
  }),

  // POST /rest/v1/subscriptions - Insert subscription
  http.post(`${SUPABASE_URL}/rest/v1/subscriptions`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json([
      {
        id: 'sub_new_123',
        ...body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }),

  // GET /rest/v1/users - Fetch user data
  http.get(`${SUPABASE_URL}/rest/v1/users`, ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('id');

    return HttpResponse.json([
      {
        id: userId || 'test-user-id',
        email: 'test@example.com',
        has_active_subscription: true,
        subscription_status: 'active',
        trial_used: false,
      },
    ]);
  }),

  // ============================================
  // Stripe API Handlers
  // ============================================

  // GET /v1/subscriptions/:id - Retrieve subscription
  http.get('https://api.stripe.com/v1/subscriptions/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      object: 'subscription',
      status: 'active',
      customer: 'cus_test123',
      items: {
        data: [
          {
            id: 'si_test123',
            price: {
              id: 'price_monthly',
              unit_amount: 2000,
              currency: 'usd',
            },
          },
        ],
      },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      discounts: [],
      metadata: {
        user_id: 'test-user-id',
        plan_type: 'monthly',
      },
    });
  }),

  // POST /v1/subscriptions/:id - Update subscription
  http.post(
    'https://api.stripe.com/v1/subscriptions/:id',
    async ({ params, request }) => {
      const formData = await request.formData();
      const cancelAtPeriodEnd = formData.get('cancel_at_period_end');

      return HttpResponse.json({
        id: params.id,
        object: 'subscription',
        status: 'active',
        customer: 'cus_test123',
        items: {
          data: [
            {
              id: 'si_test123',
              price: {
                id: 'price_monthly',
                unit_amount: 2000,
                currency: 'usd',
              },
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: cancelAtPeriodEnd === 'true',
        canceled_at:
          cancelAtPeriodEnd === 'true' ? Math.floor(Date.now() / 1000) : null,
        metadata: {
          user_id: 'test-user-id',
          plan_type: 'monthly',
        },
      });
    }
  ),

  // GET /v1/coupons/:id - Retrieve coupon
  http.get('https://api.stripe.com/v1/coupons/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      object: 'coupon',
      percent_off: 100,
      duration: 'forever',
      duration_in_months: null,
      currency: null,
      amount_off: null,
    });
  }),

  // POST /v1/invoices/create_preview - Create preview invoice
  http.post('https://api.stripe.com/v1/invoices/create_preview', () => {
    return HttpResponse.json({
      id: 'in_test_preview',
      object: 'invoice',
      amount_due: 2000,
      currency: 'usd',
      period_start: Math.floor(Date.now() / 1000),
      period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      lines: {
        data: [
          {
            id: 'il_test123',
            amount: 2000,
            description: 'Monthly subscription',
            proration: false,
          },
        ],
      },
    });
  }),

  // POST /v1/checkout/sessions - Create checkout session
  http.post(
    'https://api.stripe.com/v1/checkout/sessions',
    async ({ request }) => {
      return HttpResponse.json({
        id: 'cs_test_123',
        object: 'checkout.session',
        url: 'https://checkout.stripe.com/test-session',
        customer: 'cus_test123',
        subscription: 'sub_test123',
      });
    }
  ),
];
