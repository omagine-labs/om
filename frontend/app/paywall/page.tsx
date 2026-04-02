'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PricingCard from '@/components/pricing/PricingCard';
import { PRICING_PLANS, PRICING_COPY } from '@/lib/pricing';
import type { PlanType } from '@/lib/pricing';
import { SubscriptionErrorBoundary } from '@/components/errors/SubscriptionErrorBoundary';
import { redirectToDesktop } from '@/hooks/useDesktopAuth';
import { getCurrentUser, signOut } from '@/lib/auth';

function PaywallPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipTrial, setSkipTrial] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  // Check if user came from desktop app
  const isFromDesktop = searchParams.get('source') === 'desktop';

  // Fetch current user on mount
  useEffect(() => {
    async function fetchUser() {
      try {
        const user = await getCurrentUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
        // Gracefully handle error - just don't show footer
      } finally {
        setUserLoading(false);
      }
    }

    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      const { error: signOutError } = await signOut();

      if (signOutError) {
        setError(`Logout failed: ${signOutError.message}`);
        return;
      }

      // Preserve desktop app source parameter in redirect
      const loginUrl = isFromDesktop ? '/login?source=desktop' : '/login';
      router.push(loginUrl);
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to log out';
      setError(errorMessage);
    }
  };

  const handleSelectPlan = async (planId: 'monthly' | 'annual') => {
    try {
      setLoading(true);
      setError(null);

      // Build success URL - redirect to processing page first
      // Processing page will poll for subscription, then redirect to dashboard/desktop-success
      const successUrl = isFromDesktop
        ? `${window.location.origin}/processing-payment?session_id={CHECKOUT_SESSION_ID}&source=desktop`
        : `${window.location.origin}/processing-payment?session_id={CHECKOUT_SESSION_ID}`;

      const cancelUrl = isFromDesktop
        ? `${window.location.origin}/paywall?source=desktop`
        : `${window.location.origin}/paywall`;

      // Call the checkout session API
      const response = await fetch('/api/subscriptions/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planType: planId as PlanType,
          skipTrial,
          successUrl,
          cancelUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Handle various error response formats
        const errorMessage =
          errorData.error ||
          errorData.message ||
          errorData.details ||
          JSON.stringify(errorData);
        console.error('API Error Response:', errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to start checkout';
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-teal-700 relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Noise texture background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none z-[1]"
        style={{
          backgroundImage: 'url(/noise.svg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
        }}
      />

      {/* Blurred emerald circle background */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] bg-emerald-400 pointer-events-none opacity-70"
        style={{ top: '-440px', filter: 'blur(150px)', borderRadius: '50%' }}
      />

      {/* Blurred lime ellipse overlay */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] bg-lime-300 pointer-events-none opacity-70"
        style={{ top: '-300px', filter: 'blur(200px)', borderRadius: '50%' }}
      />

      {/* Blinds lighting effect */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/blinds.svg"
        alt=""
        className="fixed -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px] z-[2]"
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-display font-medium tracking-tighter text-white sm:text-6xl drop-shadow-lg">
            {PRICING_COPY.heading}
          </h1>
          <p className="mt-4 text-xl text-slate-700/75 font-medium">
            {PRICING_COPY.subheading}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-auto mt-8 max-w-2xl rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex">
              <svg
                className="h-5 w-5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 lg:grid-cols-2">
          <div className="animate-fadeInUp" style={{ animationDelay: '100ms' }}>
            <PricingCard
              plan={PRICING_PLANS.monthly}
              planId="monthly"
              onSelect={handleSelectPlan}
              loading={loading}
              ctaText={
                skipTrial ? PRICING_COPY.ctaSkipTrial : PRICING_COPY.ctaPrimary
              }
            />
          </div>
          <div className="animate-fadeInUp" style={{ animationDelay: '200ms' }}>
            <PricingCard
              plan={PRICING_PLANS.annual}
              planId="annual"
              onSelect={handleSelectPlan}
              loading={loading}
              ctaText={
                skipTrial ? PRICING_COPY.ctaSkipTrial : PRICING_COPY.ctaPrimary
              }
            />
          </div>
        </div>

        {/* Professional Development Notice */}
        <div
          className="animate-fadeInUp mx-auto mt-20 max-w-3xl rounded-lg bg-white/95 border border-teal-200 p-6 shadow-lg hover:translate-y-[-2px] transition-all duration-300"
          style={{ animationDelay: '300ms' }}
        >
          <div className="flex">
            <svg
              className="h-9 w-9 text-teal-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="ml-3 flex-1">
              <h3 className="text-xl font-medium text-teal-950">
                Professional Development Budget
              </h3>
              <p className="mt-2 text-base text-teal-900/80">
                {PRICING_COPY.professionalDevelopment}
              </p>

              {/* Skip Trial Option */}
              <div className="mt-4 pt-4 border-t border-teal-500/30">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipTrial}
                    onChange={(e) => setSkipTrial(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    disabled={loading}
                  />
                  <span className="text-base font-medium text-slate-800/90">
                    {PRICING_COPY.skipTrialLabel} (e.g., to use budget before
                    year-end)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Trial Notice */}
        {!skipTrial && (
          <p className="mx-auto mt-8 max-w-3xl text-center text-balance text-base text-white/80">
            {PRICING_COPY.trialNotice}
          </p>
        )}

        {/* User Account Footer */}
        {!userLoading && userEmail && (
          <footer className="mx-auto mt-12 max-w-2xl text-center">
            <div className="border-t border-white/20 pt-6">
              <p className="text-sm text-white/80">
                Logged in as{' '}
                <span className="font-medium text-white">{userEmail}</span>
              </p>
              <button
                onClick={handleLogout}
                className="mt-2 text-sm text-white/60 hover:text-white transition-colors"
                disabled={loading}
              >
                Not you? Log out
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

export default function PaywallPage() {
  return (
    <SubscriptionErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-teal-700 flex items-center justify-center">
            <div className="text-white/80">Loading...</div>
          </div>
        }
      >
        <PaywallPageContent />
      </Suspense>
    </SubscriptionErrorBoundary>
  );
}
