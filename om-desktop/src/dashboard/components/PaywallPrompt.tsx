import { getWebAppUrl } from '@/lib/config';
import { useState } from 'react';

/**
 * Reusable paywall prompt component for authenticated users without active subscription
 * Opens the web app paywall page in the system browser
 */
export function PaywallPrompt() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleViewPlans = () => {
    const webAppUrl = getWebAppUrl();
    const paywallUrl = `${webAppUrl}/paywall?source=desktop`;
    console.log(
      '[PaywallPrompt] Opening paywall URL in default browser:',
      paywallUrl
    );
    // Open in default browser instead of new Electron window
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(paywallUrl);
    } else {
      // Fallback for web version
      window.open(paywallUrl, '_blank');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // 1. Ensure auth is healthy first
      if (!window.electronAPI?.auth?.getUser) {
        console.error('[PaywallPrompt] Auth API not available');
        setIsRefreshing(false);
        return;
      }

      const user = await window.electronAPI.auth.getUser();

      if (!user) {
        console.error('[PaywallPrompt] No user found after refresh attempt');
        setIsRefreshing(false);
        return;
      }

      // 2. Check subscription status
      if (!window.electronAPI?.checkSubscription) {
        console.error('[PaywallPrompt] Subscription API not available');
        setIsRefreshing(false);
        return;
      }

      const hasSubscription = await window.electronAPI.checkSubscription();

      // 3. Only reload if subscription found
      if (hasSubscription) {
        console.log('[PaywallPrompt] Subscription confirmed, reloading');
        window.location.reload();
      } else {
        console.log('[PaywallPrompt] No subscription found yet');
        alert('No active subscription found. Please subscribe first.');
        setIsRefreshing(false);
      }
    } catch (error) {
      console.error('[PaywallPrompt] Error refreshing:', error);
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Subscription Required
          </h2>
          <p className="text-gray-600 mb-8">
            To access your meeting insights and analytics, please subscribe to
            one of our plans.
          </p>
          <button
            onClick={handleViewPlans}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors mb-3"
          >
            View Plans & Subscribe
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefreshing ? 'Refreshing...' : 'Already Subscribed? Refresh'}
          </button>
          <p className="mt-4 text-sm text-gray-500">
            After subscribing, click refresh to access the dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
