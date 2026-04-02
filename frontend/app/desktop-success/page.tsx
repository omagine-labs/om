'use client';

import { useEffect } from 'react';
import { redirectToDesktop } from '@/hooks/useDesktopAuth';
import { DesktopAuthSuccess } from '@/components/DesktopAuthSuccess';

/**
 * Desktop Authentication Success Page
 *
 * Displayed after successful desktop app authentication (login or payment).
 * Shows success message and triggers automatic redirect to desktop app.
 * Reused across OAuth, email/password login, and post-payment flows.
 */
export default function DesktopAuthSuccessPage() {
  // Trigger desktop redirect on page load
  useEffect(() => {
    const handleRedirect = async () => {
      console.log('[DesktopSuccess] Redirecting to desktop app');
      await redirectToDesktop();
    };

    handleRedirect();
  }, []);

  return <DesktopAuthSuccess />;
}
