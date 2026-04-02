import {
  isFreeAccount,
  formatSubscriptionDate,
  getDaysRemaining,
  getTrialDaysRemaining,
  isInTrialPeriod,
  isCanceledButActive,
  isSubscriptionActive,
} from '@/lib/subscription-utils';
import {
  mockSubscriptions,
  createMockSubscription,
  createMockDiscount,
  createMockUpcomingInvoice,
} from '../../utils/mock-subscription';

describe('subscription-utils', () => {
  describe('isFreeAccount()', () => {
    /**
     * CRITICAL TEST: True Free Account Detection
     * Users with 100% forever discount should be detected as free
     */
    it('should return TRUE for account with 100% forever discount', () => {
      const subscription = mockSubscriptions.trueFreeAccount();
      expect(isFreeAccount(subscription)).toBe(true);
    });

    /**
     * CRITICAL REGRESSION TEST: Downgraded Customer Detection
     * The bug: Downgraded customers (annual → monthly scheduled) have $0 amountDue
     * but subscriptionAmount > 0, meaning they WILL be charged at renewal.
     * They should NOT be detected as free accounts.
     */
    it('should return FALSE for downgraded customer with scheduled plan change', () => {
      const subscription = mockSubscriptions.downgradedCustomer();
      expect(isFreeAccount(subscription)).toBe(false);
    });

    /**
     * CRITICAL REGRESSION TEST: Temporary Free Discount
     * Users with temporary 100% discount will be charged when discount expires.
     * They should NOT be detected as free accounts.
     */
    it('should return FALSE for customer with temporary 100% discount', () => {
      const subscription = mockSubscriptions.temporaryFreeDiscount();
      expect(isFreeAccount(subscription)).toBe(false);
    });

    /**
     * Regular paying customer should never be detected as free
     */
    it('should return FALSE for regular paying customer (monthly)', () => {
      const subscription = mockSubscriptions.regularMonthly();
      expect(isFreeAccount(subscription)).toBe(false);
    });

    it('should return FALSE for regular paying customer (annual)', () => {
      const subscription = mockSubscriptions.regularAnnual();
      expect(isFreeAccount(subscription)).toBe(false);
    });

    /**
     * Customers with partial discounts should NOT be detected as free
     */
    it('should return FALSE for customer with 50% discount', () => {
      const subscription = mockSubscriptions.withDiscount();
      expect(isFreeAccount(subscription)).toBe(false);
    });

    /**
     * Edge case: No upcoming invoice
     * If invoice data is missing, assume NOT free to be safe
     */
    it('should return FALSE when upcomingInvoice is null', () => {
      const subscription = createMockSubscription({
        upcomingInvoice: null,
      });
      expect(isFreeAccount(subscription)).toBe(false);
    });

    /**
     * Edge case: subscriptionAmount is undefined
     * If subscriptionAmount is missing but amountDue is 0, check discount
     */
    it('should return TRUE when both amounts are 0 and no subscriptionAmount defined', () => {
      const subscription = createMockSubscription({
        discount: null,
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 0,
          subscriptionAmount: undefined,
        }),
      });
      expect(isFreeAccount(subscription)).toBe(true);
    });

    /**
     * Edge case: Free account without explicit discount object
     * Some free accounts might not have discount object but have $0 everywhere
     */
    it('should return TRUE for account with $0 amounts and no discount object', () => {
      const subscription = createMockSubscription({
        discount: null,
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 0,
          subscriptionAmount: 0,
        }),
      });
      expect(isFreeAccount(subscription)).toBe(true);
    });

    /**
     * Edge case: Discount exists but not 100%
     */
    it('should return FALSE for account with 99% forever discount', () => {
      const subscription = createMockSubscription({
        discount: createMockDiscount({
          percentOff: 99,
          duration: 'forever',
        }),
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 29, // $0.29
          subscriptionAmount: 29,
        }),
      });
      expect(isFreeAccount(subscription)).toBe(false);
    });

    /**
     * Edge case: 100% discount but duration is 'once'
     */
    it('should return FALSE for account with 100% once discount', () => {
      const subscription = createMockSubscription({
        discount: createMockDiscount({
          percentOff: 100,
          duration: 'once',
        }),
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 0,
          subscriptionAmount: 2999, // Will charge next time
        }),
      });
      expect(isFreeAccount(subscription)).toBe(false);
    });
  });

  describe('formatSubscriptionDate()', () => {
    it('should format ISO date string to localized format', () => {
      // Use midday time to avoid timezone issues
      const date = '2025-01-15T12:00:00Z';
      const formatted = formatSubscriptionDate(date);
      expect(formatted).toMatch(/January/);
      expect(formatted).toMatch(/2025/);
    });

    it('should handle different months correctly', () => {
      // Use midday time to avoid timezone issues
      const date = '2025-12-25T12:00:00Z';
      const formatted = formatSubscriptionDate(date);
      expect(formatted).toMatch(/December/);
      expect(formatted).toMatch(/2025/);
    });
  });

  describe('getDaysRemaining()', () => {
    it('should calculate days remaining correctly for future date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const days = getDaysRemaining(futureDate.toISOString());
      // Allow for rounding differences (6-8 days is acceptable for 7 days in future)
      expect(days).toBeGreaterThanOrEqual(6);
      expect(days).toBeLessThanOrEqual(8);
    });

    it('should return null for past date', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const days = getDaysRemaining(pastDate.toISOString());
      expect(days).toBeNull();
    });

    it('should handle dates far in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const days = getDaysRemaining(futureDate.toISOString());
      expect(days).toBeGreaterThan(360);
    });
  });

  describe('getTrialDaysRemaining()', () => {
    it('should return days remaining for active trial', () => {
      const subscription = mockSubscriptions.activeTrial();
      const days = getTrialDaysRemaining(subscription);
      expect(days).toBeGreaterThan(0);
      // Allow for rounding differences
      expect(days).toBeLessThanOrEqual(8);
    });

    it('should return null for non-trial subscription', () => {
      const subscription = mockSubscriptions.regularMonthly();
      const days = getTrialDaysRemaining(subscription);
      expect(days).toBeNull();
    });

    it('should return null when trial has expired', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const subscription = createMockSubscription({
        status: 'trialing',
        trialEnd: pastDate.toISOString(),
      });
      const days = getTrialDaysRemaining(subscription);
      expect(days).toBeNull();
    });
  });

  describe('isInTrialPeriod()', () => {
    it('should return true for trialing subscription', () => {
      const subscription = mockSubscriptions.activeTrial();
      expect(isInTrialPeriod(subscription)).toBe(true);
    });

    it('should return false for active subscription', () => {
      const subscription = mockSubscriptions.regularMonthly();
      expect(isInTrialPeriod(subscription)).toBe(false);
    });

    it('should return false for canceled subscription', () => {
      const subscription = mockSubscriptions.canceledButActive();
      expect(isInTrialPeriod(subscription)).toBe(false);
    });
  });

  describe('isCanceledButActive()', () => {
    it('should return true for canceled subscription still in period', () => {
      const subscription = mockSubscriptions.canceledButActive();
      expect(isCanceledButActive(subscription)).toBe(true);
    });

    it('should return false for active subscription', () => {
      const subscription = mockSubscriptions.regularMonthly();
      expect(isCanceledButActive(subscription)).toBe(false);
    });

    it('should return true for canceled trial', () => {
      const subscription = mockSubscriptions.canceledTrial();
      expect(isCanceledButActive(subscription)).toBe(true);
    });
  });

  describe('isSubscriptionActive()', () => {
    it('should return true for active subscription', () => {
      const subscription = mockSubscriptions.regularMonthly();
      expect(isSubscriptionActive(subscription)).toBe(true);
    });

    it('should return true for trialing subscription', () => {
      const subscription = mockSubscriptions.activeTrial();
      expect(isSubscriptionActive(subscription)).toBe(true);
    });

    it('should return true for canceled but still active subscription', () => {
      const subscription = mockSubscriptions.canceledButActive();
      expect(isSubscriptionActive(subscription)).toBe(true);
    });

    it('should return false for past_due subscription', () => {
      const subscription = createMockSubscription({
        status: 'past_due',
      });
      expect(isSubscriptionActive(subscription)).toBe(false);
    });

    it('should return false for canceled subscription', () => {
      const subscription = createMockSubscription({
        status: 'canceled',
      });
      expect(isSubscriptionActive(subscription)).toBe(false);
    });
  });
});
