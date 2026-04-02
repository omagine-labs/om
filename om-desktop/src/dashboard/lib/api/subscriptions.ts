import type { PlanType } from '@/lib/pricing';
import { authApi, userApi } from '@/lib/api-client';
import { getWebAppUrl } from '@/lib/config';

/**
 * Subscription API for Desktop App
 *
 * Read operations use direct Supabase queries.
 * Write operations (cancel, reactivate, change plan) use the web app API
 * with Bearer auth tokens since they require server-side Stripe access.
 */

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
  prorationAmount?: number;
  subscriptionAmount?: number;
}

export interface SubscriptionResponse {
  subscription: {
    id: string;
    user_id: string;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    planType: PlanType;
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
 * Helper to make authenticated requests to the web app API
 */
async function fetchWebAppApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Get session from main process
  const session = await authApi.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const webAppUrl = getWebAppUrl();

  const response = await fetch(`${webAppUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    console.error('[Subscription API] Request failed:', {
      status: response.status,
      statusText: response.statusText,
      url: `${webAppUrl}${path}`,
    });

    let errorMessage = `API request failed: ${response.status}`;
    try {
      const error: ApiError = await response.json();
      console.error('[Subscription API] Error response body:', error);
      errorMessage = error.error.message || errorMessage;
    } catch (parseError) {
      console.error(
        '[Subscription API] Could not parse error response as JSON'
      );
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Subscription API client
 */
export const subscriptionApi = {
  /**
   * Get current user's subscription
   * Uses IPC to main process for database query
   */
  async getCurrent(): Promise<SubscriptionResponse> {
    // Get current user from main process
    const user = await authApi.getCurrentUser();

    if (!user) {
      // No user available - return null subscription
      return { subscription: null };
    }

    // Fetch subscription via IPC
    const result = await userApi.getCurrentSubscription(user.id);

    if (!result.success) {
      console.error('Error fetching subscription:', result.error);
      throw new Error('Failed to fetch subscription');
    }

    // If no subscription found
    if (!result.data) {
      return { subscription: null };
    }

    // Return subscription data (already in correct format from API proxy)
    return {
      subscription: {
        ...result.data,
        planType: result.data.planType as PlanType,
        discount: result.data.discount as DiscountInfo | null,
      },
    };
  },

  /**
   * Get subscription with full details from web app API
   * Includes Stripe discount and upcoming invoice info
   */
  async getCurrentWithDetails(): Promise<SubscriptionResponse> {
    return fetchWebAppApi<SubscriptionResponse>('/api/subscriptions/current', {
      method: 'GET',
    });
  },

  /**
   * Create Stripe Checkout session
   * Requires web app API for Stripe access
   */
  async createCheckoutSession(
    data: CheckoutSessionRequest
  ): Promise<CheckoutSessionResponse> {
    return fetchWebAppApi<CheckoutSessionResponse>(
      '/api/subscriptions/checkout-session',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  /**
   * Preview plan change (shows proration without actually changing)
   * Requires web app API for Stripe access
   */
  async previewPlanChange(
    newPlan: PlanType
  ): Promise<PlanChangePreviewResponse> {
    return fetchWebAppApi<PlanChangePreviewResponse>(
      '/api/subscriptions/preview-change',
      {
        method: 'POST',
        body: JSON.stringify({ newPlanType: newPlan }),
      }
    );
  },

  /**
   * Change subscription plan
   * Requires web app API for Stripe access
   */
  async changePlan(newPlan: PlanType): Promise<SubscriptionResponse> {
    return fetchWebAppApi<SubscriptionResponse>(
      '/api/subscriptions/change-plan',
      {
        method: 'PATCH',
        body: JSON.stringify({ newPlanType: newPlan }),
      }
    );
  },

  /**
   * Cancel subscription at end of period
   * Requires web app API for Stripe access
   */
  async cancel(): Promise<SubscriptionResponse> {
    return fetchWebAppApi<SubscriptionResponse>('/api/subscriptions/cancel', {
      method: 'POST',
    });
  },

  /**
   * Reactivate a canceled subscription
   * Requires web app API for Stripe access
   */
  async reactivate(): Promise<SubscriptionResponse> {
    return fetchWebAppApi<SubscriptionResponse>(
      '/api/subscriptions/reactivate',
      {
        method: 'POST',
      }
    );
  },
};
