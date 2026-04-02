/**
 * Unit tests for pricing utility functions
 * Tests plan selection, price formatting, and pricing calculations
 */

import {
  PRICING_PLANS,
  PRICING_COPY,
  getPlanById,
  formatPrice,
  formatPriceWithInterval,
  formatAnnualTotal,
  type PricingPlan,
} from '@/lib/pricing';

describe('pricing utilities', () => {
  describe('PRICING_PLANS constant', () => {
    it('should have monthly plan configuration', () => {
      expect(PRICING_PLANS.monthly).toBeDefined();
      expect(PRICING_PLANS.monthly.id).toBe('monthly');
      expect(PRICING_PLANS.monthly.price).toBe(20);
      expect(PRICING_PLANS.monthly.interval).toBe('month');
      expect(PRICING_PLANS.monthly.features).toBeInstanceOf(Array);
      expect(PRICING_PLANS.monthly.features.length).toBeGreaterThan(0);
    });

    it('should have annual plan configuration', () => {
      expect(PRICING_PLANS.annual).toBeDefined();
      expect(PRICING_PLANS.annual.id).toBe('annual');
      expect(PRICING_PLANS.annual.price).toBe(15);
      expect(PRICING_PLANS.annual.annualPrice).toBe(180);
      expect(PRICING_PLANS.annual.interval).toBe('year');
      expect(PRICING_PLANS.annual.popular).toBe(true);
      expect(PRICING_PLANS.annual.savings).toBe('Save $60/year');
    });

    it('should have correct trial period for both plans', () => {
      expect(PRICING_PLANS.monthly.trialDays).toBe(14);
      expect(PRICING_PLANS.annual.trialDays).toBe(14);
    });
  });

  describe('getPlanById()', () => {
    it('should return monthly plan when given "monthly"', () => {
      const plan = getPlanById('monthly');
      expect(plan).toBe(PRICING_PLANS.monthly);
      expect(plan.id).toBe('monthly');
      expect(plan.price).toBe(20);
    });

    it('should return annual plan when given "annual"', () => {
      const plan = getPlanById('annual');
      expect(plan).toBe(PRICING_PLANS.annual);
      expect(plan.id).toBe('annual');
      expect(plan.price).toBe(15);
      expect(plan.annualPrice).toBe(180);
    });
  });

  describe('formatPrice()', () => {
    it('should format monthly plan price correctly', () => {
      const plan = getPlanById('monthly');
      const formatted = formatPrice(plan);
      expect(formatted).toBe('$20');
    });

    it('should format annual plan price correctly', () => {
      const plan = getPlanById('annual');
      const formatted = formatPrice(plan);
      expect(formatted).toBe('$15');
    });

    it('should handle plan with decimal price', () => {
      const customPlan: PricingPlan = {
        ...PRICING_PLANS.monthly,
        price: 19.99,
      };
      const formatted = formatPrice(customPlan);
      expect(formatted).toBe('$19.99');
    });

    it('should handle plan with zero price', () => {
      const customPlan: PricingPlan = {
        ...PRICING_PLANS.monthly,
        price: 0,
      };
      const formatted = formatPrice(customPlan);
      expect(formatted).toBe('$0');
    });
  });

  describe('formatPriceWithInterval()', () => {
    it('should format monthly plan with /mo suffix', () => {
      const plan = getPlanById('monthly');
      const formatted = formatPriceWithInterval(plan);
      expect(formatted).toBe('$20/mo');
    });

    it('should format annual plan with /mo suffix (monthly equivalent)', () => {
      const plan = getPlanById('annual');
      const formatted = formatPriceWithInterval(plan);
      expect(formatted).toBe('$15/mo');
    });
  });

  describe('formatAnnualTotal()', () => {
    it('should format annual plan total correctly', () => {
      const plan = getPlanById('annual');
      const formatted = formatAnnualTotal(plan);
      expect(formatted).toBe('$180/year');
    });

    it('should calculate annual total for monthly plan', () => {
      const plan = getPlanById('monthly');
      const formatted = formatAnnualTotal(plan);
      expect(formatted).toBe('$240/year'); // $20 × 12
    });

    it('should calculate correctly for custom price', () => {
      const customPlan: PricingPlan = {
        ...PRICING_PLANS.monthly,
        price: 25,
      };
      const formatted = formatAnnualTotal(customPlan);
      expect(formatted).toBe('$300/year'); // $25 × 12
    });

    it('should use annualPrice if available for yearly plan', () => {
      const customAnnualPlan: PricingPlan = {
        ...PRICING_PLANS.annual,
        price: 15,
        annualPrice: 150, // Different from 15 × 12
        interval: 'year',
      };
      const formatted = formatAnnualTotal(customAnnualPlan);
      expect(formatted).toBe('$150/year');
    });
  });

  describe('PRICING_COPY constant', () => {
    it('should have all required copy fields', () => {
      expect(PRICING_COPY.heading).toBeDefined();
      expect(PRICING_COPY.subheading).toBeDefined();
      expect(PRICING_COPY.trialBadge).toBeDefined();
      expect(PRICING_COPY.professionalDevelopment).toBeDefined();
      expect(PRICING_COPY.skipTrialLabel).toBeDefined();
      expect(PRICING_COPY.couponLabel).toBeDefined();
      expect(PRICING_COPY.couponPlaceholder).toBeDefined();
      expect(PRICING_COPY.ctaPrimary).toBeDefined();
      expect(PRICING_COPY.ctaSkipTrial).toBeDefined();
      expect(PRICING_COPY.trialNotice).toBeDefined();
    });

    it('should have correct trial period in copy', () => {
      expect(PRICING_COPY.trialBadge).toContain('14-day');
      expect(PRICING_COPY.subheading).toContain('14-day');
      expect(PRICING_COPY.trialNotice).toContain('14-day');
    });
  });

  describe('annual savings calculation', () => {
    it('should correctly calculate savings between monthly and annual plans', () => {
      const monthlyTotal = PRICING_PLANS.monthly.price * 12; // $240
      const annualTotal = PRICING_PLANS.annual.annualPrice!; // $180
      const savings = monthlyTotal - annualTotal; // $60

      expect(savings).toBe(60);
      expect(PRICING_PLANS.annual.savings).toBe('Save $60/year');
    });
  });
});
