import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanChangeSection } from '@/components/subscription/PlanChangeSection';
import {
  mockSubscriptions,
  createMockSubscription,
} from '../../../utils/mock-subscription';

// Mock the pricing module
jest.mock('@/lib/pricing', () => ({
  PRICING_PLANS: {
    monthly: {
      id: 'monthly',
      name: 'Monthly',
      description: 'Flexible month-to-month billing',
      price: 29.99,
      interval: 'month',
      intervalLabel: 'per month',
      priceId: 'price_monthly',
      savings: null,
      features: [],
      trialDays: 14,
    },
    annual: {
      id: 'annual',
      name: 'Annual',
      description: 'Best value - save 25%',
      price: 349.99,
      annualPrice: 349.99,
      interval: 'year',
      intervalLabel: 'per year',
      priceId: 'price_annual',
      popular: true,
      savings: 'Save 25%',
      features: [],
      trialDays: 14,
    },
  },
  formatPriceWithInterval: (plan: any) => {
    if (plan.interval === 'month') {
      return '$29.99/month';
    }
    return '$349.99/year';
  },
}));

describe('PlanChangeSection', () => {
  const mockOnChangePlan = jest.fn();

  beforeEach(() => {
    mockOnChangePlan.mockClear();
  });

  describe('Visibility Matrix', () => {
    /**
     * Test 1: Show for Active Monthly Subscription
     * Regular monthly customers should see plan change options
     */
    it('should display plan change options for active monthly subscription', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Upgrade to Annual/ })
      ).toBeInTheDocument();
    });

    /**
     * Test 2: Show for Active Annual Subscription
     * Regular annual customers should see plan change options
     */
    it('should display plan change options for active annual subscription', () => {
      const subscription = mockSubscriptions.regularAnnual();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="annual"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Downgrade to Monthly/ })
      ).toBeInTheDocument();
    });

    /**
     * Test 3: Hide for Free Account (CRITICAL REGRESSION TEST)
     * Users with 100% forever discount should NOT see plan change options
     */
    it('should hide plan change section for true free accounts', () => {
      const subscription = mockSubscriptions.trueFreeAccount();

      const { container } = render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(container).toBeEmptyDOMElement();
    });

    /**
     * Test 4: Show for Downgraded Customer (CRITICAL REGRESSION TEST)
     * Downgraded customers with scheduled changes should STILL see plan change options
     * They are not free accounts - they will be charged at renewal
     */
    it('should show plan change section for downgraded customer with scheduled change', () => {
      const subscription = mockSubscriptions.downgradedCustomer();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="annual"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
    });

    /**
     * Test 5: Hide for Canceled Subscription
     * When subscription is canceled, hide plan change options
     */
    it('should hide plan change section when subscription is canceled', () => {
      const subscription = mockSubscriptions.canceledButActive();

      const { container } = render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={true}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(container).toBeEmptyDOMElement();
    });

    /**
     * Test 6: Show for Temporary Free Discount (REGRESSION TEST)
     * Customers with temporary 100% discount SHOULD see plan changes
     * They are not truly free - they will be charged when discount expires
     */
    it('should show plan change section for temporary 100% discount', () => {
      const subscription = mockSubscriptions.temporaryFreeDiscount();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      // Temporary free users should see plan change options
      // They are not truly free - discount expires
      expect(screen.getByText('Change Plan')).toBeInTheDocument();
    });
  });

  describe('Current Plan Highlighting', () => {
    /**
     * Test: Current monthly plan highlighted
     */
    it('should highlight current monthly plan with border and badge', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      // Find the card by the plan name and check its parent container
      const monthlyTitle = screen.getByText('Monthly');
      const monthlyCard = monthlyTitle.closest('.border-blue-500');
      expect(monthlyCard).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    /**
     * Test: Current annual plan highlighted
     */
    it('should highlight current annual plan with border and badge', () => {
      const subscription = mockSubscriptions.regularAnnual();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="annual"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      // Find the card by the plan name and check its parent container
      const annualTitle = screen.getByText('Annual');
      const annualCard = annualTitle.closest('.border-blue-500');
      expect(annualCard).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  describe('Plan Change Interaction', () => {
    /**
     * Test: Click upgrade to annual
     */
    it('should call onChangePlan when upgrade to annual clicked', async () => {
      const subscription = mockSubscriptions.regularMonthly();
      const user = userEvent.setup();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      await user.click(
        screen.getByRole('button', { name: /Upgrade to Annual/ })
      );

      expect(mockOnChangePlan).toHaveBeenCalledWith('annual');
      expect(mockOnChangePlan).toHaveBeenCalledTimes(1);
    });

    /**
     * Test: Click downgrade to monthly
     */
    it('should call onChangePlan when downgrade to monthly clicked', async () => {
      const subscription = mockSubscriptions.regularAnnual();
      const user = userEvent.setup();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="annual"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      await user.click(
        screen.getByRole('button', { name: /Downgrade to Monthly/ })
      );

      expect(mockOnChangePlan).toHaveBeenCalledWith('monthly');
      expect(mockOnChangePlan).toHaveBeenCalledTimes(1);
    });

    /**
     * Test: Button disabled when action loading
     */
    it('should disable buttons when actionLoading is true', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={true}
          onChangePlan={mockOnChangePlan}
        />
      );

      const button = screen.getByRole('button', { name: /Processing/ });
      expect(button).toBeDisabled();
    });

    /**
     * Test: No button for current plan
     */
    it('should not show change button for current plan', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      // Monthly is current, so no "Change to Monthly" button
      expect(
        screen.queryByRole('button', { name: /Monthly/ })
      ).not.toBeInTheDocument();

      // But annual upgrade button should exist
      expect(
        screen.getByRole('button', { name: /Upgrade to Annual/ })
      ).toBeInTheDocument();
    });
  });

  describe('Plan Information Display', () => {
    /**
     * Test: Display pricing for both plans
     */
    it('should display pricing for both monthly and annual plans', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('$29.99/month')).toBeInTheDocument();
      expect(screen.getByText('$349.99/year')).toBeInTheDocument();
    });

    /**
     * Test: Display savings for annual plan
     */
    it('should display savings message for annual plan', () => {
      const subscription = mockSubscriptions.regularMonthly();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('Save 25%')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test: Trial subscription can change plans
     */
    it('should show plan change options for trial subscription', () => {
      const subscription = mockSubscriptions.activeTrial();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
    });

    /**
     * Test: Customer with regular discount can change plans
     */
    it('should show plan change options for customer with discount', () => {
      const subscription = mockSubscriptions.withDiscount();

      render(
        <PlanChangeSection
          subscription={subscription}
          currentPlan="monthly"
          isCanceled={false}
          actionLoading={false}
          onChangePlan={mockOnChangePlan}
        />
      );

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
    });
  });
});
