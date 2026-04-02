import type { PlanType } from '@/lib/pricing';

/**
 * Subscription API response types
 */
export interface DiscountInfo {
  couponId: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths: number | null;
  validUntil: string | null;
}

export interface UpcomingInvoice {
  amountDue: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  // Separate proration charges from regular subscription charges
  prorationAmount?: number; // Immediate charge for plan upgrade/downgrade
  subscriptionAmount?: number; // Next renewal charge
}

export interface SubscriptionResponse {
  subscription: {
    id: string;
    user_id: string;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    planType: PlanType; // API returns camelCase, not snake_case
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    trialStart: string | null;
    trialEnd: string | null;
    canceledAt: string | null;
    created_at: string;
    updated_at: string;
    discount: DiscountInfo | null;
    upcomingInvoice: UpcomingInvoice | null;
  } | null;
}

export interface CheckoutSessionRequest {
  plan: PlanType;
  skipTrial?: boolean;
  couponCode?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

export interface PlanChangePreview {
  newPlanType: PlanType;
  prorationAmount: number;
  subscriptionAmount: number;
  totalDueNow: number;
  currency: string;
  periodEnd: string;
}

export interface PlanChangePreviewResponse {
  success: boolean;
  preview: PlanChangePreview;
}

/**
 * Subscription API client
 */
export const subscriptionApi = {
  /**
   * Get current user's subscription
   */
  async getCurrent(): Promise<SubscriptionResponse> {
    const response = await fetch('/api/subscriptions/current', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.error.message || 'Failed to fetch subscription');
    }

    return response.json();
  },

  /**
   * Create Stripe Checkout session
   */
  async createCheckoutSession(
    data: CheckoutSessionRequest
  ): Promise<CheckoutSessionResponse> {
    const response = await fetch('/api/subscriptions/checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(
        error.error.message || 'Failed to create checkout session'
      );
    }

    return response.json();
  },

  /**
   * Preview plan change (shows proration without actually changing)
   */
  async previewPlanChange(
    newPlan: PlanType
  ): Promise<PlanChangePreviewResponse> {
    const response = await fetch('/api/subscriptions/preview-change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newPlanType: newPlan }),
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.error.message || 'Failed to preview plan change');
    }

    return response.json();
  },

  /**
   * Change subscription plan
   */
  async changePlan(newPlan: PlanType): Promise<SubscriptionResponse> {
    const response = await fetch('/api/subscriptions/change-plan', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newPlanType: newPlan }),
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.error.message || 'Failed to change plan');
    }

    return response.json();
  },

  /**
   * Cancel subscription at end of period
   */
  async cancel(): Promise<SubscriptionResponse> {
    const response = await fetch('/api/subscriptions/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.error.message || 'Failed to cancel subscription');
    }

    return response.json();
  },

  /**
   * Reactivate a canceled subscription
   */
  async reactivate(): Promise<SubscriptionResponse> {
    const response = await fetch('/api/subscriptions/reactivate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(
        error.error.message || 'Failed to reactivate subscription'
      );
    }

    return response.json();
  },
};
