import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { subscriptionApi } from '@/lib/api/subscriptions';
import type { PlanChangePreview } from '@/lib/api/subscriptions';
import type { PlanType } from '@/lib/pricing';
import { CurrentPlanCard } from '@/components/subscription/CurrentPlanCard';
import { PlanChangeSection } from '@/components/subscription/PlanChangeSection';
import { PlanChangeModal } from '@/components/subscription/PlanChangeModal';
import { CancelSubscriptionCard } from '@/components/subscription/CancelSubscriptionCard';
import { SubscriptionErrorBoundary } from '@/components/errors/SubscriptionErrorBoundary';
import { SignInPrompt } from '@/components/SignInPrompt';
import { PageBackground } from '@/components/layout/PageBackground';

function SubscriptionPageContent() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  // Use direct Supabase query - discount info will be stored in DB
  const {
    subscription,
    loading,
    error,
    isTrialing,
    isCanceled,
    daysLeftInTrial,
    refresh,
  } = useSubscription();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(loading || isAuthenticated === null);
  const [planChangeConfirm, setPlanChangeConfirm] = useState<{
    plan: 'monthly' | 'annual';
    show: boolean;
    preview: PlanChangePreview | null;
  } | null>(null);

  // Only show plan changes for monthly/annual plans (not internal_free)
  const currentPlan =
    subscription?.planType === 'monthly' || subscription?.planType === 'annual'
      ? subscription.planType
      : undefined;

  // Check if this is a free/internal account (shouldn't show change plan or cancel)
  const isInternalFreeAccount = subscription?.planType === 'internal_free';

  const handleChangePlan = async (newPlan: 'monthly' | 'annual') => {
    if (newPlan === currentPlan) return;

    try {
      setActionLoading(true);
      setActionError(null);

      // Fetch preview of the plan change
      const response = await subscriptionApi.previewPlanChange(
        newPlan as PlanType
      );

      // Only show modal if there's an actual charge (proration > 0)
      // During trial, upgrades have $0 charge, so no modal needed
      if (response.preview.prorationAmount > 0) {
        // Show confirmation dialog for immediate charges
        setPlanChangeConfirm({
          plan: newPlan,
          show: true,
          preview: response.preview,
        });
        setActionLoading(false);
      } else {
        // No immediate charge - apply change immediately (trial or downgrade)
        await subscriptionApi.changePlan(newPlan as PlanType);
        await refresh();
        setActionLoading(false);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to preview plan change'
      );
      setActionLoading(false);
    }
  };

  const confirmChangePlan = async () => {
    if (!planChangeConfirm) return;

    try {
      setActionLoading(true);
      setActionError(null);
      await subscriptionApi.changePlan(planChangeConfirm.plan as PlanType);
      await refresh();
      setPlanChangeConfirm(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to change plan'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      await subscriptionApi.cancel();
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to cancel subscription'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      await subscriptionApi.reactivate();
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to reactivate subscription'
      );
    } finally {
      setActionLoading(false);
    }
  };

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      if (window.electronAPI?.auth?.getUser) {
        const user = await window.electronAPI.auth.getUser();
        setIsAuthenticated(!!user);
      } else {
        setIsAuthenticated(false);
      }
    };

    // Check auth on mount only
    // Auth Health Checker monitors auth state in main process
    checkAuth();
  }, []);

  // Show loading state while checking auth
  if (isAuthenticated === null && showSkeleton) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="text-white/70">Loading...</div>
      </PageBackground>
    );
  }

  // Show blank while loading (before skeleton delay)
  if (isAuthenticated === null) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div />
      </PageBackground>
    );
  }

  // Show sign-in screen if not authenticated
  if (!isAuthenticated) {
    return <SignInPrompt />;
  }

  if (loading && showSkeleton) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
            Subscription
          </h1>
        </div>

        {/* Skeleton cards */}
        <div className="space-y-6 animate-pulse">
          {/* Current Plan skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-40 mb-4" />
            <div className="h-24 bg-slate-100 rounded w-full mb-4" />
            <div className="h-4 bg-slate-100 rounded w-48" />
          </div>

          {/* Change Plan skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-36 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-32 bg-slate-100 rounded-xl" />
              <div className="h-32 bg-slate-100 rounded-xl" />
            </div>
          </div>

          {/* Cancel Subscription skeleton */}
          <div className="bg-white rounded-2xl p-6 xl:p-8 xl:pt-7 shadow-lg">
            <div className="h-9 bg-slate-200 rounded w-48 mb-4" />
            <div className="h-4 bg-slate-100 rounded w-3/4 mb-4" />
            <div className="h-10 bg-slate-100 rounded w-40" />
          </div>
        </div>
      </PageBackground>
    );
  }

  // Show blank while loading (before skeleton delay)
  if (loading) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
            Subscription
          </h1>
        </div>
      </PageBackground>
    );
  }

  if (error || !subscription) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-lg">
          <p className="text-red-800">
            {error || 'No active subscription found.'}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground maxWidth="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
          Subscription
        </h1>
        <p className="mt-2 text-white/70">
          Manage your subscription and billing
        </p>
      </div>

      {/* Error Message */}
      {actionError && (
        <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 shadow-lg">
          <p className="text-sm text-red-800">{actionError}</p>
        </div>
      )}

      {/* Current Plan Card */}
      <CurrentPlanCard
        subscription={subscription}
        isTrialing={isTrialing}
        isCanceled={isCanceled}
        daysLeftInTrial={daysLeftInTrial}
      />

      {/* Change Plan - only for paid plans */}
      {currentPlan && (
        <PlanChangeSection
          subscription={subscription}
          currentPlan={currentPlan}
          isCanceled={isCanceled}
          actionLoading={actionLoading}
          onChangePlan={handleChangePlan}
        />
      )}

      {/* Plan Change Confirmation Modal */}
      {planChangeConfirm?.show && (
        <PlanChangeModal
          plan={planChangeConfirm.plan}
          preview={planChangeConfirm.preview}
          actionLoading={actionLoading}
          onConfirm={confirmChangePlan}
          onCancel={() => setPlanChangeConfirm(null)}
        />
      )}

      {/* Cancel/Reactivate - only for paid plans */}
      {!isInternalFreeAccount && (
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={isCanceled}
          actionLoading={actionLoading}
          onCancel={handleCancelSubscription}
          onReactivate={handleReactivate}
        />
      )}

      {/* Internal Free Account Notice */}
      {isInternalFreeAccount && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 xl:p-8 shadow-lg">
          <h2 className="font-display text-xl font-semibold text-green-900 mb-2">
            Internal Team Account
          </h2>
          <p className="text-green-700">
            You have a complimentary internal team account with full access to
            all features. No billing or subscription management is required.
          </p>
        </div>
      )}
    </PageBackground>
  );
}

export default function Subscription() {
  return (
    <SubscriptionErrorBoundary>
      <SubscriptionPageContent />
    </SubscriptionErrorBoundary>
  );
}
