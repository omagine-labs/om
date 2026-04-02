'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Payment Processing Page
 *
 * Displays after successful Stripe Checkout and polls for subscription creation.
 * Once webhook creates subscription, redirects to dashboard to continue normal flow.
 *
 * This page exists solely to handle the race condition between:
 * - Stripe redirecting user back after payment
 * - Stripe webhook creating the subscription in our database
 *
 * Query params:
 * - session_id: Stripe checkout session ID (required)
 * - source: 'desktop' for desktop app flow (optional)
 */
function ProcessingPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const source = searchParams.get('source');

    if (!sessionId) {
      console.error('[ProcessingPayment] No session_id provided');
      setError('Invalid payment session. Please try again.');
      return;
    }

    const pollForSubscription = async () => {
      const maxAttempts = 10;
      const initialDelay = 500; // Start with 500ms

      console.log('[ProcessingPayment] Starting subscription polling...');

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        setAttempts(attempt + 1);

        try {
          const response = await fetch('/api/subscriptions/current');

          if (response.ok) {
            const data = await response.json();

            // Check if subscription is active or trialing
            if (
              data.subscription &&
              (data.subscription.status === 'active' ||
                data.subscription.status === 'trialing')
            ) {
              console.log(
                '[ProcessingPayment] Subscription verified:',
                data.subscription.status
              );

              // Redirect to appropriate destination
              if (source === 'desktop') {
                // Desktop flow: redirect to desktop-success
                console.log(
                  '[ProcessingPayment] Redirecting to desktop-success'
                );
                router.replace(`/desktop-success?session_id=${sessionId}`);
              } else {
                // Web flow: redirect to dashboard
                console.log('[ProcessingPayment] Redirecting to dashboard');
                router.replace('/dashboard');
              }
              return;
            }
          } else if (response.status !== 404) {
            // Log unexpected errors (404 is expected during webhook processing)
            console.warn(
              `[ProcessingPayment] Unexpected response: ${response.status}`
            );
          }

          // Wait before next attempt (exponential backoff)
          const delay = initialDelay * Math.pow(1.5, attempt);
          console.log(
            `[ProcessingPayment] Subscription not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } catch (err) {
          console.error(
            '[ProcessingPayment] Error checking subscription:',
            err
          );
        }
      }

      // If we get here, polling timed out
      console.error(
        '[ProcessingPayment] Subscription verification timed out after',
        maxAttempts,
        'attempts'
      );
      setError(
        'Payment processing is taking longer than expected. Please refresh the page or contact support if the issue persists.'
      );
    };

    pollForSubscription();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-teal-700 relative overflow-hidden flex items-center justify-center px-4">
        {/* Background effects */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'url(/noise.svg)',
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] bg-emerald-400 pointer-events-none opacity-70"
          style={{ top: '-440px', filter: 'blur(150px)', borderRadius: '50%' }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] bg-lime-300 pointer-events-none opacity-70"
          style={{ top: '-300px', filter: 'blur(200px)', borderRadius: '50%' }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blinds.svg"
          alt=""
          className="absolute -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px]"
        />

        <div className="relative z-10 max-w-md w-full">
          <div
            className="bg-white rounded-2xl p-8 sm:p-10"
            style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}
          >
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <svg
                  className="h-8 w-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                Processing Error
              </h1>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-teal-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-teal-700 active:bg-teal-800 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-teal-700 relative overflow-hidden flex items-center justify-center px-4">
      {/* Background effects */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'url(/noise.svg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
        }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] bg-emerald-400 pointer-events-none opacity-70"
        style={{ top: '-440px', filter: 'blur(150px)', borderRadius: '50%' }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] bg-lime-300 pointer-events-none opacity-70"
        style={{ top: '-300px', filter: 'blur(200px)', borderRadius: '50%' }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/blinds.svg"
        alt=""
        className="absolute -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px]"
      />

      <div className="relative z-10 max-w-md w-full">
        <div
          className="bg-white rounded-2xl p-8 sm:p-10"
          style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}
        >
          <div className="text-center">
            {/* Animated spinner */}
            <div className="mx-auto flex items-center justify-center h-16 w-16 mb-4">
              <svg
                className="animate-spin h-12 w-12 text-teal-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>

            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Processing Your Payment
            </h1>
            <p className="text-gray-600 mb-6">
              Please wait while we confirm your subscription. This usually takes
              just a few seconds.
            </p>

            {/* Progress indicator */}
            <div className="flex items-center justify-center space-x-2 text-sm text-slate-500">
              <div className="flex space-x-1">
                <div
                  className="h-2 w-2 bg-teal-600 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                ></div>
                <div
                  className="h-2 w-2 bg-teal-600 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                ></div>
                <div
                  className="h-2 w-2 bg-teal-600 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProcessingPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-teal-700 flex items-center justify-center">
          <div className="text-white/80">Loading...</div>
        </div>
      }
    >
      <ProcessingPaymentContent />
    </Suspense>
  );
}
