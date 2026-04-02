import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { trackEvent, AcquisitionEvents } from '@/lib/analytics';

/**
 * Hook to track signup_source event for new users (OAuth and email).
 * Should be called on authenticated pages after signup/OAuth callback.
 *
 * This handles the case where OAuth users are redirected through server-side
 * callback and can't access localStorage there. We track on the client-side
 * after redirect completes.
 */
export function useSignupSourceTracking() {
  useEffect(() => {
    const trackSignupSource = async () => {
      try {
        // Check if UTM data exists in localStorage
        const utmDataStr = localStorage.getItem('signup_utm');
        if (!utmDataStr) {
          return; // No UTM data to track
        }

        // Check if this is a new user (created within last 60 seconds)
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return; // Not authenticated
        }

        const createdAt = new Date(user.created_at);
        const now = new Date();
        const secondsSinceCreation =
          (now.getTime() - createdAt.getTime()) / 1000;

        // Only track if user was created in the last minute (new signup)
        if (secondsSinceCreation < 60) {
          const utmData = JSON.parse(utmDataStr);
          if (utmData.source) {
            trackEvent(AcquisitionEvents.SIGNUP_SOURCE, {
              source: utmData.source,
              campaign: utmData.campaign,
              medium: utmData.medium,
            });
          }
        }

        // Clean up UTM data after tracking (or if user is not new)
        localStorage.removeItem('signup_utm');
      } catch (error) {
        console.error('[Analytics] Failed to track signup source:', error);
        // Don't throw - analytics failures shouldn't break the app
      }
    };

    trackSignupSource();
  }, []); // Run once on mount
}
