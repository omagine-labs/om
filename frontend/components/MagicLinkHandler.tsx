'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

/**
 * Handles magic link tokens passed in URL hash from desktop app
 * This creates an independent web session using verifyOtp()
 *
 * Desktop opens: https://app.om.local/#magic_link_token=xxx&email=yyy
 * This component reads the hash, verifies the token, and redirects to dashboard
 */
export function MagicLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const handleMagicLink = async () => {
      // Only run on client-side
      if (typeof window === 'undefined') return;

      // Read magic link token from hash fragment
      const hash = window.location.hash.substring(1);
      if (!hash) return;

      const params = new URLSearchParams(hash);
      const token = params.get('magic_link_token');
      const email = params.get('email');

      if (!token || !email) return;

      console.log('[MagicLinkHandler] Processing magic link for:', email);

      try {
        const supabase = createClient();

        // Verify the magic link token and create independent session
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'magiclink',
        });

        if (error) {
          console.error(
            '[MagicLinkHandler] Error verifying magic link:',
            error
          );
          // Clear the hash and show error
          window.location.hash = '';
          return;
        }

        if (!data.session) {
          console.error('[MagicLinkHandler] No session created');
          window.location.hash = '';
          return;
        }

        console.log('[MagicLinkHandler] Magic link verified, session created');

        // Clear the hash from URL
        window.location.hash = '';

        // Redirect to dashboard with the new session
        // Note: Don't call router.refresh() after push - it causes a race condition
        // where in-flight requests get aborted during the remount
        router.push('/dashboard');
      } catch (err) {
        console.error('[MagicLinkHandler] Unexpected error:', err);
        window.location.hash = '';
      }
    };

    handleMagicLink();
  }, [router]); // Run once on mount

  // This component doesn't render anything
  return null;
}
