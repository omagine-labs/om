'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { analytics } from '@/lib/posthog';

/**
 * Hook to identify authenticated users with PostHog on mount
 * This ensures users are identified even if they're already logged in
 */
export function usePostHogIdentify() {
  useEffect(() => {
    const identifyUser = async () => {
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Fetch user profile for full identification
        const { data: userProfile } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .single();

        // Identify user with PostHog
        analytics.identify(user.id, {
          email: user.email,
          full_name: userProfile?.full_name,
          created_at: user.created_at,
        });
      }
    };

    identifyUser();
  }, []);
}
