import { useEffect } from 'react';
import type { PlanChangePreview } from '@/lib/api/subscriptions';
import { formatSubscriptionDate } from '@/lib/subscription-utils';

interface PlanChangeModalProps {
  plan: 'monthly' | 'annual';
  preview: PlanChangePreview | null;
  actionLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlanChangeModal({
  plan,
  preview,
  actionLoading,
  onConfirm,
  onCancel,
}: PlanChangeModalProps) {
  const isUpgrade = plan === 'annual';

  // Handle escape key to close modal (only when not loading)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [actionLoading, onCancel]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={() => !actionLoading && onCancel()}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 z-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {isUpgrade ? '🎉 Upgrade to Annual Plan' : 'Switch to Monthly Plan'}
          </h2>

          {isUpgrade ? (
            <>
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  Lock in your best price with our Annual Plan:
                </p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <svg
                      className="h-5 w-5 text-green-500 mr-2 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-700">
                      Save 25% compared to monthly billing
                    </span>
                  </li>
                  <li className="flex items-start">
                    <svg
                      className="h-5 w-5 text-green-500 mr-2 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-700">
                      One simple payment - no monthly charges
                    </span>
                  </li>
                  <li className="flex items-start">
                    <svg
                      className="h-5 w-5 text-green-500 mr-2 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-700">
                      Full year of uninterrupted service
                    </span>
                  </li>
                </ul>
              </div>

              {/* Pricing breakdown */}
              {preview && (
                <>
                  {preview.prorationAmount > 0 ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-blue-900">
                          Due today (prorated)
                        </span>
                        <span className="text-xl font-bold text-blue-900">
                          ${(preview.prorationAmount / 100).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-blue-700">
                        Immediate charge for plan upgrade
                      </p>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-green-900">
                          Due today
                        </span>
                        <span className="text-xl font-bold text-green-900">
                          $0.00
                        </span>
                      </div>
                      <p className="text-xs text-green-700">
                        You&apos;re already paid up for the year!
                      </p>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-blue-900">Annual Plan</span>
                      <span className="text-2xl font-bold text-blue-900">
                        ${(preview.subscriptionAmount / 100).toFixed(2)}/year
                      </span>
                    </div>
                    <p className="text-xs text-blue-700">
                      Next renewal on{' '}
                      {formatSubscriptionDate(preview.periodEnd)}
                    </p>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  You&apos;re switching to monthly billing:
                </p>

                {/* Pricing breakdown */}
                {preview && (
                  <>
                    {preview.prorationAmount > 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-700">
                            Credit applied
                          </span>
                          <span className="text-xl font-bold text-green-600">
                            -$
                            {Math.abs(preview.prorationAmount / 100).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">
                          Unused time from annual plan
                        </p>
                      </div>
                    )}

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-700">
                          Monthly Plan
                        </span>
                        <span className="text-2xl font-bold text-gray-900">
                          ${(preview.subscriptionAmount / 100).toFixed(2)}
                          /month
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Next renewal on{' '}
                        {formatSubscriptionDate(preview.periodEnd)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={actionLoading}
              className="flex-1 px-4 py-3 bg-teal-600/80 hover:bg-teal-600 active:bg-teal-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading
                ? 'Processing...'
                : isUpgrade
                  ? 'Upgrade Now'
                  : 'Confirm Switch'}
            </button>
            <button
              onClick={onCancel}
              disabled={actionLoading}
              className="px-4 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 disabled:bg-gray-100 cursor-pointer disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
