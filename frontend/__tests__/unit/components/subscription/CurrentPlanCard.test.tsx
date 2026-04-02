import React from 'react';
import { render, screen } from '@testing-library/react';
import { CurrentPlanCard } from '@/components/subscription/CurrentPlanCard';
import {
  mockSubscriptions,
  createMockSubscription,
  createMockDiscount,
  createMockUpcomingInvoice,
} from '../../../utils/mock-subscription';

// Mock the pricing module
jest.mock('@/lib/pricing', () => ({
  PRICING_PLANS: {
    monthly: {
      id: 'monthly',
      name: 'Monthly',
      description: 'Flexible month-to-month billing',
      price: 20,
      interval: 'month',
      intervalLabel: 'per month',
      priceId: 'price_monthly',
      features: [],
      trialDays: 14,
    },
    annual: {
      id: 'annual',
      name: 'Annual',
      description: 'Best value - save $60/year',
      price: 15,
      annualPrice: 180,
      interval: 'year',
      intervalLabel: 'per year',
      priceId: 'price_annual',
      popular: true,
      savings: 'Save $60/year',
      features: [],
      trialDays: 14,
    },
  },
  formatPriceWithInterval: (plan: any) => {
    if (plan.interval === 'month') {
      return '$20/mo';
    }
    return '$15/mo';
  },
}));

describe('CurrentPlanCard', () => {
  describe('Display State Matrix', () => {
    /**
     * Test 1: Regular Monthly Subscription
     * Should display plan name and monthly pricing
     */
    it('should display plan name and monthly pricing for regular subscription', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('$20/mo')).toBeInTheDocument();
      expect(screen.queryByText(/Free/)).not.toBeInTheDocument();
    });

    /**
     * Test 2: True Free Account (100% Forever Discount)
     * CRITICAL: Should display plan name with "(100% off)" for permanent free accounts
     */
    it('should display plan name with "(100% off)" for accounts with permanent 100% discount', () => {
      const subscription = mockSubscriptions.trueFreeAccount();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      // Should show actual plan name with 100% off (not "Free Plan")
      expect(screen.getByText('Monthly (100% off)')).toBeInTheDocument();
      expect(screen.getByText(/never be charged/)).toBeInTheDocument();
      expect(screen.queryByText('$20')).not.toBeInTheDocument();
    });

    /**
     * Test 3: Downgraded Customer (REGRESSION TEST)
     * CRITICAL: Should NOT show "(100% off)" for downgraded customer
     */
    it('should NOT show "(100% off)" for downgraded customer with scheduled change', () => {
      const subscription = mockSubscriptions.downgradedCustomer();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      // Should show plan name, NOT "(100% off)"
      expect(screen.getByText('Annual')).toBeInTheDocument();
      expect(screen.queryByText(/\(100% off\)/)).not.toBeInTheDocument();
      // Downgraded customer shows annual pricing (still on annual plan)
      expect(screen.getByText('$15/mo')).toBeInTheDocument();
    });

    /**
     * Test 4: Trial Active
     * Should display trial badge with days remaining
     */
    it('should display trial badge with days remaining', () => {
      const subscription = mockSubscriptions.activeTrial();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={true}
          isCanceled={false}
          daysLeftInTrial={7}
        />
      );

      // Badge shows "Trial: X days left"
      expect(screen.getByText(/Trial:/)).toBeInTheDocument();
      expect(screen.getByText(/7 days left/)).toBeInTheDocument();
    });

    /**
     * Test 5: Canceled Subscription
     * Should display canceled badge and end date
     */
    it('should display canceled badge and end date', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const expectedYear = futureDate.getFullYear().toString();

      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: futureDate.toISOString(),
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={true}
          daysLeftInTrial={null}
        />
      );

      // Badge shows "Canceling at period end"
      expect(screen.getByText(/Canceling at period end/)).toBeInTheDocument();
      // Date will be formatted, check it shows the expected year dynamically
      expect(screen.getByText(new RegExp(expectedYear))).toBeInTheDocument();
    });

    /**
     * Test 6: Upcoming Invoice Display
     * Should display next charge amount and date
     */
    it('should display next charge amount and date', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      const subscription = createMockSubscription({
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 2999,
          subscriptionAmount: 2999,
          periodEnd: futureDate.toISOString(),
        }),
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText(/Next renewal:/)).toBeInTheDocument();
      // Check for the renewal text that includes amount and date
      expect(screen.getByText(/\$29\.99 on/i)).toBeInTheDocument();
    });

    /**
     * Test 7: Discount Badge Display
     * Should display discount badge for active discounts
     */
    it('should display discount badge for active discounts', () => {
      const subscription = createMockSubscription({
        discount: createMockDiscount({
          percentOff: 50,
          duration: 'forever',
        }),
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 1499,
          subscriptionAmount: 1499,
        }),
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText('50% off')).toBeInTheDocument();
      expect(screen.getByText(/Discount applies forever/)).toBeInTheDocument();
    });

    /**
     * Test 8: Trial with Upcoming Charge
     * Should display "After trial ends:" instead of "Next renewal:"
     */
    it('should display "After trial ends:" for trial subscriptions', () => {
      const subscription = mockSubscriptions.activeTrial();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={true}
          isCanceled={false}
          daysLeftInTrial={7}
        />
      );

      expect(screen.getByText(/After trial ends:/)).toBeInTheDocument();
      expect(screen.queryByText(/Next renewal:/)).not.toBeInTheDocument();
    });

    /**
     * Test 9: Annual Plan Display
     * Should display annual pricing correctly
     */
    it('should display annual plan pricing', () => {
      const subscription = mockSubscriptions.regularAnnual();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText('Annual')).toBeInTheDocument();
      expect(screen.getByText('$15/mo')).toBeInTheDocument();
    });

    /**
     * Test 10: Canceled Subscription Hides Next Charge
     * When canceled, no upcoming charge should be shown
     */
    it('should hide next charge information when subscription is canceled', () => {
      const subscription = mockSubscriptions.canceledButActive();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={true}
          daysLeftInTrial={null}
        />
      );

      expect(screen.queryByText(/Next renewal:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/After trial ends:/)).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test: No upcoming invoice
     * Component should not crash when upcomingInvoice is null
     */
    it('should handle missing upcoming invoice gracefully', () => {
      const subscription = createMockSubscription({
        upcomingInvoice: null,
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.queryByText(/Next renewal:/)).not.toBeInTheDocument();
    });

    /**
     * Test: Zero amount due (but not free)
     * When amountDue is 0 but subscriptionAmount > 0, should not show charge info
     */
    it('should hide charge info when amountDue is 0', () => {
      const subscription = createMockSubscription({
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 0,
          subscriptionAmount: 2999,
        }),
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      // Should not show "Next renewal" section when amountDue is 0
      expect(screen.queryByText(/Next renewal:/)).not.toBeInTheDocument();
    });

    /**
     * Test: Discount with valid until date
     * Should display when discount expires
     */
    it('should display discount expiry date when validUntil is set', () => {
      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + 3);

      const subscription = createMockSubscription({
        discount: createMockDiscount({
          percentOff: 50,
          duration: 'repeating',
          validUntil: validUntil.toISOString(),
        }),
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 1499,
          subscriptionAmount: 1499,
        }),
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText(/Discount expires:/)).toBeInTheDocument();
    });

    /**
     * Test: Amount discount (not percent)
     * Should display dollar amount off
     */
    it('should display amount-based discount correctly', () => {
      const subscription = createMockSubscription({
        discount: createMockDiscount({
          percentOff: null,
          amountOff: 500, // $5.00 off
          duration: 'forever',
        }),
        upcomingInvoice: createMockUpcomingInvoice({
          amountDue: 2499,
          subscriptionAmount: 2499,
        }),
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText('$5.00 off')).toBeInTheDocument();
    });
  });

  describe('Billing Period Display', () => {
    /**
     * Test: Free accounts should not show billing period
     */
    it('should hide billing period for free accounts', () => {
      const subscription = mockSubscriptions.trueFreeAccount();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.queryByText('Current period')).not.toBeInTheDocument();
    });

    /**
     * Test: Paying customers should see billing period
     */
    it('should show billing period for paying customers', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={false}
          isCanceled={false}
          daysLeftInTrial={null}
        />
      );

      expect(screen.getByText('Current period')).toBeInTheDocument();
    });

    /**
     * Test: Trial subscriptions should show trial end date
     */
    it('should display trial end date for trial subscriptions', () => {
      const subscription = mockSubscriptions.activeTrial();

      render(
        <CurrentPlanCard
          subscription={subscription}
          isTrialing={true}
          isCanceled={false}
          daysLeftInTrial={7}
        />
      );

      expect(screen.getByText('Trial ends')).toBeInTheDocument();
    });
  });
});
