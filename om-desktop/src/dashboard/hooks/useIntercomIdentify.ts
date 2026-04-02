import { useEffect } from 'react';
import { authApi } from '@/lib/api-client';
import { intercom } from '@/lib/intercom';
import { getWebAppUrl } from '@/lib/config';

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
      // Get current user from main process
      const user = await authApi.getCurrentUser();

      if (user) {
        try {
          // Initialize Intercom first (only done once for authenticated users)
          intercom.init();

          // Get the session to obtain access token for API authentication
          const session = await authApi.getSession();
          if (!session?.access_token) {
            console.error('[Intercom] No access token available');
            return;
          }

          // Fetch JWT token from web app API with Bearer token auth
          const webAppUrl = getWebAppUrl();
          const response = await fetch(`${webAppUrl}/api/intercom/jwt`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
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
