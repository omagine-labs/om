'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { intercom } from '@/lib/intercom';

/**
 * Hook to identify authenticated users with Intercom on mount using JWT
 * This ensures users are identified securely with identity verification
 *
 * IMPORTANT: Intercom is ONLY initialized for authenticated users to prevent
 * creating duplicate anonymous contacts. This is the recommended approach
 * when using Intercom's identity verification feature.
 */
export function useIntercomIdentify() {
  useEffect(() => {
    const identifyUser = async () => {
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          // Initialize Intercom first (only done once for authenticated users)
          intercom.init();

          // Fetch JWT token from API route
          const response = await fetch('/api/intercom/jwt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            console.error(
              '[Intercom] Failed to fetch JWT token:',
              response.statusText
            );
            return;
          }

          const data = await response.json();

          if (!data.success || !data.token) {
            console.error('[Intercom] Invalid JWT response:', data);
            return;
          }

          // Boot Intercom with JWT token for authenticated user
          intercom.bootWithJWT(data.token);
        } catch (error) {
          console.error('[Intercom] Error fetching JWT token:', error);
        }
      }
    };

    identifyUser();
  }, []);
}
