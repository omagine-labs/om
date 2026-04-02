/**
 * Mock factories for integration tests
 *
 * Provides reusable factory functions to create consistent mock data and reduce repetitive setup code.
 *
 * Why factories?
 * - Reduces duplication across test files
 * - Ensures consistent mock data structure
 * - Makes tests more maintainable when data models change
 * - Improves test readability by abstracting complex mock setup
 */

/**
 * Creates a mock subscription object for database tests
 */
export function createMockSubscription(overrides = {}) {
  return {
    id: 'sub_db123',
    user_id: 'test-user-id',
    stripe_customer_id: 'cus_test123',
    stripe_subscription_id: 'sub_test123',
    status: 'active',
    plan_type: 'monthly',
    current_period_start: new Date('2024-01-01').toISOString(),
    current_period_end: new Date('2024-02-01').toISOString(),
    cancel_at_period_end: false,
    trial_start: null,
    trial_end: null,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Creates a mock Stripe subscription object
 */
export function createMockStripeSubscription(overrides = {}) {
  return {
    id: 'sub_test123',
    object: 'subscription',
    status: 'active',
    customer: 'cus_test123',
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    cancel_at_period_end: false,
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
    discounts: [],
    ...overrides,
  };
}

/**
 * Creates a mock Stripe checkout session object
 */
export function createMockCheckoutSession(overrides = {}) {
  return {
    id: 'cs_test123',
    object: 'checkout.session',
    mode: 'subscription',
    url: 'https://checkout.stripe.com/test',
    subscription: 'sub_test123',
    customer: 'cus_test123',
    metadata: {
      user_id: 'test-user-id',
      plan_type: 'monthly',
    },
    ...overrides,
  };
}

/**
 * Creates a mock payment history record
 */
export function createMockPaymentHistory(overrides = {}) {
  return {
    id: 'payment_123',
    user_id: 'test-user-id',
    subscription_id: 'sub_db123',
    stripe_invoice_id: 'in_test123',
    stripe_payment_intent_id: 'pi_test123',
    amount: 999,
    currency: 'usd',
    status: 'succeeded',
    created_at: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Creates a mock user object
 */
export function createMockUser(overrides = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    full_name: 'Test User',
    avatar_url: null,
    username: null,
    first_login_completed: true,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

/**
 * Creates a mock Supabase client with common query chains
 *
 * Example usage:
 * const mockSupabase = createMockSupabaseClient({
 *   subscriptions: { data: createMockSubscription(), error: null },
 *   users: { data: createMockUser(), error: null }
 * });
 */
export function createMockSupabaseClient(
  config: {
    subscriptions?: { data: any; error: any };
    users?: { data: any; error: any };
    paymentHistory?: { data: any; error: any };
  } = {}
) {
  const mockClient: any = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: config.users?.data || createMockUser() },
        error: config.users?.error || null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === 'subscriptions') {
        return createMockTableQuery(
          config.subscriptions?.data,
          config.subscriptions?.error
        );
      }
      if (table === 'users') {
        return createMockTableQuery(config.users?.data, config.users?.error);
      }
      if (table === 'payment_history') {
        return createMockTableQuery(
          config.paymentHistory?.data,
          config.paymentHistory?.error
        );
      }
      return createMockTableQuery(null, null);
    }),
  };

  return mockClient;
}

/**
 * Creates a mock table query chain (.from().select().eq().single())
 */
function createMockTableQuery(data: any, error: any) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data, error }),
        maybeSingle: jest.fn().mockResolvedValue({ data, error }),
      }),
    }),
    insert: jest.fn().mockResolvedValue({ error }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error }),
    }),
    upsert: jest.fn().mockResolvedValue({ error }),
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error }),
    }),
  };
}

/**
 * Creates a mock Stripe client with common methods
 */
export function createMockStripeClient(overrides = {}) {
  return {
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue(createMockCheckoutSession()),
      },
    },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      update: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      cancel: jest
        .fn()
        .mockResolvedValue(
          createMockStripeSubscription({ status: 'canceled' })
        ),
    },
    customers: {
      retrieve: jest
        .fn()
        .mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' }),
      update: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
    },
    coupons: {
      retrieve: jest
        .fn()
        .mockResolvedValue({ id: 'coupon_test', percent_off: 20 }),
    },
    invoices: {
      createPreview: jest.fn().mockResolvedValue({
        total: 999,
        subtotal: 999,
        amount_due: 999,
      }),
    },
    prices: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'price_monthly',
        unit_amount: 999,
        currency: 'usd',
      }),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    ...overrides,
  };
}
