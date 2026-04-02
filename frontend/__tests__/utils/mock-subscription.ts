import type {
  SubscriptionResponse,
  DiscountInfo,
  UpcomingInvoice,
} from '@/lib/api/subscriptions';
import type { PlanType } from '@/lib/pricing';

/**
 * Create a mock subscription object with sensible defaults
 * Allows overriding any property for specific test cases
 */
export function createMockSubscription(
  overrides?: Partial<NonNullable<SubscriptionResponse['subscription']>>
): NonNullable<SubscriptionResponse['subscription']> {
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 30);

  return {
    id: 'test-subscription-id',
    user_id: 'test-user-id',
    stripe_subscription_id: 'sub_test123',
    stripe_customer_id: 'cus_test123',
    planType: 'monthly' as PlanType,
    status: 'active',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: futureDate.toISOString(),
    cancelAtPeriodEnd: false,
    trialStart: null,
    trialEnd: null,
    canceledAt: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    discount: null,
    upcomingInvoice: {
      amountDue: 2999,
      currency: 'usd',
      periodStart: now.toISOString(),
      periodEnd: futureDate.toISOString(),
      subscriptionAmount: 2999,
    },
    ...overrides,
  };
}

/**
 * Create a mock discount object
 */
export function createMockDiscount(
  overrides?: Partial<DiscountInfo>
): DiscountInfo {
  return {
    couponId: 'test-coupon',
    percentOff: 50,
    amountOff: null,
    currency: null,
    duration: 'forever',
    durationInMonths: null,
    validUntil: null,
    ...overrides,
  };
}

/**
 * Create a mock upcoming invoice
 */
export function createMockUpcomingInvoice(
  overrides?: Partial<UpcomingInvoice>
): UpcomingInvoice {
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 30);

  return {
    amountDue: 2999,
    currency: 'usd',
    periodStart: now.toISOString(),
    periodEnd: futureDate.toISOString(),
    subscriptionAmount: 2999,
    ...overrides,
  };
}

/**
 * Preset subscriptions for common test scenarios
 */
export const mockSubscriptions = {
  /**
   * Regular monthly subscription (active, paying)
   */
  regularMonthly: (): NonNullable<SubscriptionResponse['subscription']> =>
    createMockSubscription({
      planType: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: false,
      discount: null,
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 2999,
        subscriptionAmount: 2999,
      }),
    }),

  /**
   * Regular annual subscription (active, paying)
   */
  regularAnnual: (): NonNullable<SubscriptionResponse['subscription']> =>
    createMockSubscription({
      planType: 'annual',
      status: 'active',
      cancelAtPeriodEnd: false,
      discount: null,
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 34999,
        subscriptionAmount: 34999,
      }),
    }),

  /**
   * True free account (100% forever discount)
   */
  trueFreeAccount: (): NonNullable<SubscriptionResponse['subscription']> =>
    createMockSubscription({
      planType: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: false,
      discount: createMockDiscount({
        percentOff: 100,
        duration: 'forever',
      }),
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 0,
        subscriptionAmount: 0,
      }),
    }),

  /**
   * Downgraded customer (annual → monthly scheduled)
   * CRITICAL: This should NOT be detected as a free account
   */
  downgradedCustomer: (): NonNullable<SubscriptionResponse['subscription']> =>
    createMockSubscription({
      planType: 'annual', // Still on annual in DB
      status: 'active',
      cancelAtPeriodEnd: false,
      discount: null,
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 0, // No immediate charge
        subscriptionAmount: 2999, // BUT will charge $29.99 at renewal
      }),
    }),

  /**
   * Trial subscription (active trial period)
   */
  activeTrial: (): NonNullable<SubscriptionResponse['subscription']> => {
    const now = new Date();
    const trialStart = new Date(now);
    trialStart.setDate(trialStart.getDate() - 7); // Started 7 days ago
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 7); // Ends in 7 days

    return createMockSubscription({
      planType: 'monthly',
      status: 'trialing',
      cancelAtPeriodEnd: false,
      trialStart: trialStart.toISOString(),
      trialEnd: trialEnd.toISOString(),
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 2999,
        subscriptionAmount: 2999,
        periodEnd: trialEnd.toISOString(),
      }),
    });
  },

  /**
   * Canceled subscription (still active until period end)
   */
  canceledButActive: (): NonNullable<SubscriptionResponse['subscription']> => {
    const now = new Date();
    const canceledAt = new Date(now);
    canceledAt.setDate(canceledAt.getDate() - 5); // Canceled 5 days ago
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 25); // Ends in 25 days

    return createMockSubscription({
      planType: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: true,
      canceledAt: canceledAt.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      upcomingInvoice: null, // No upcoming invoice when canceled
    });
  },

  /**
   * Trial subscription that's been canceled
   */
  canceledTrial: (): NonNullable<SubscriptionResponse['subscription']> => {
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 7); // Ends in 7 days

    return createMockSubscription({
      planType: 'monthly',
      status: 'trialing',
      cancelAtPeriodEnd: true,
      canceledAt: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
      upcomingInvoice: null,
    });
  },

  /**
   * Subscription with 50% discount
   */
  withDiscount: (): NonNullable<SubscriptionResponse['subscription']> =>
    createMockSubscription({
      planType: 'monthly',
      status: 'active',
      discount: createMockDiscount({
        percentOff: 50,
        duration: 'forever',
      }),
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 1499, // $14.99 after 50% discount
        subscriptionAmount: 1499,
      }),
    }),

  /**
   * Subscription with temporary 100% discount
   * CRITICAL: Should NOT be detected as a free account (discount will expire)
   */
  temporaryFreeDiscount: (): NonNullable<
    SubscriptionResponse['subscription']
  > => {
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 3); // Expires in 3 months

    return createMockSubscription({
      planType: 'monthly',
      status: 'active',
      discount: createMockDiscount({
        percentOff: 100,
        duration: 'repeating',
        durationInMonths: 3,
        validUntil: validUntil.toISOString(),
      }),
      upcomingInvoice: createMockUpcomingInvoice({
        amountDue: 0,
        subscriptionAmount: 2999, // Will charge $29.99 after discount expires
      }),
    });
  },
};
