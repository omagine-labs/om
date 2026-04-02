'use client';

import { useEffect } from 'react';
import { authApi, userApi } from '@/lib/api-client';
import { analytics } from '@/lib/posthog';

/**
 * Hook to identify authenticated users with PostHog on mount
 * This ensures users are identified even if they're already logged in
 */
export function usePostHogIdentify() {
  useEffect(() => {
    const identifyUser = async () => {
      // Get current user from main process
      const user = await authApi.getCurrentUser();

      if (user) {
        // Fetch user's full name via IPC
        const result = await userApi.getUserFullName(user.id);
        const fullName = result.success ? result.data : null;

        // Identify user with PostHog
        analytics.identify(user.id, {
          email: user.email,
          full_name: fullName,
          created_at: user.created_at,
        });
      }
    };

    identifyUser();
  }, []);
}
