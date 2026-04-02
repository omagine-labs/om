'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/ui/Toast';

/**
 * ClaimHandler Component
 *
 * Handles claiming of anonymous meetings after OAuth signup.
 * Checks localStorage for pending_claim data and processes it when user is authenticated.
 */
export function ClaimHandler() {
  const router = useRouter();
  const [toast, setToast] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);

  useEffect(() => {
    const handlePendingClaim = async () => {
      if (typeof window === 'undefined') return;

      const pendingClaimStr = localStorage.getItem('pending_claim');
      if (!pendingClaimStr) return;

      try {
        const pendingClaim = JSON.parse(pendingClaimStr);
        const { email, speaker } = pendingClaim;

        if (!email) {
          localStorage.removeItem('pending_claim');
          return;
        }

        const supabase = createClient();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          return;
        }

        console.log('[ClaimHandler] Processing pending claim for:', email);

        localStorage.removeItem('pending_claim');

        const { data: claimedMeetings, error: claimError } = await supabase.rpc(
          'claim_anonymous_meetings',
          {
            p_user_id: user.id,
            p_email: email,
            p_selected_speaker: speaker || undefined,
          }
        );

        if (claimError) {
          console.error('[ClaimHandler] Error claiming meetings:', claimError);
          return;
        }

        if (claimedMeetings && claimedMeetings.length > 0) {
          console.log(
            '[ClaimHandler] Successfully claimed meetings:',
            claimedMeetings.length
          );

          const meetingWord = claimedMeetings.length !== 1 ? 's' : '';
          setToast({
            message:
              'Welcome! ' +
              claimedMeetings.length +
              ' meeting' +
              meetingWord +
              ' added to your account.',
            type: 'success',
          });

          setTimeout(() => {
            router.push('/meetings?highlight=' + claimedMeetings[0].meeting_id);
          }, 1500);
        }
      } catch (err) {
        console.error('[ClaimHandler] Unexpected error:', err);
        localStorage.removeItem('pending_claim');
      }
    };

    handlePendingClaim();
  }, [router]);

  if (toast) {
    return (
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(null)}
      />
    );
  }

  return null;
}
