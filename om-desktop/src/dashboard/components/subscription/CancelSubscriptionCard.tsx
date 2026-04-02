import { useState } from 'react';
import type { SubscriptionResponse } from '@/lib/api/subscriptions';
import { formatSubscriptionDate } from '@/lib/subscription-utils';

interface CancelSubscriptionCardProps {
  subscription: NonNullable<SubscriptionResponse['subscription']>;
  isCanceled: boolean;
  actionLoading: boolean;
  onCancel: () => void;
  onReactivate: () => void;
}

export function CancelSubscriptionCard({
  subscription,
  isCanceled,
  actionLoading,
  onCancel,
  onReactivate,
}: CancelSubscriptionCardProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancelClick = () => {
    onCancel();
    setShowCancelConfirm(false);
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-lg p-6 xl:p-8 xl:pt-7 animate-fadeInUp"
      style={{ animationDelay: '200ms' }}
    >
      {isCanceled ? (
        <div>
          <h2 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
            Subscription Canceled
          </h2>
          <p className="text-slate-600 mb-4">
            Your subscription will end on{' '}
            {formatSubscriptionDate(subscription.currentPeriodEnd)}. You can
            still use the service until then.
          </p>
          <button
            onClick={onReactivate}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? 'Processing...' : 'Reactivate Subscription'}
          </button>
        </div>
      ) : (
        <div>
          <h2 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
            Cancel Subscription
          </h2>
          <p className="text-slate-600 mb-4">
            You&apos;ll continue to have access until the end of your billing
            period.
          </p>
          {!showCancelConfirm ? (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel Subscription
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800 mb-4">
                Are you sure you want to cancel? You&apos;ll lose access at the
                end of your billing period.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancelClick}
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Processing...' : 'Yes, Cancel'}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Keep Subscription
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
