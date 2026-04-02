import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/**
 * API route to claim an anonymous meeting for an authenticated user.
 * Uses service role to bypass RLS and ensure the claim succeeds.
 */
export async function POST(request: Request) {
  try {
    const { meetingId, anonymousEmail } = await request.json();

    if (!meetingId || !anonymousEmail) {
      return NextResponse.json(
        { error: 'Missing meetingId or anonymousEmail' },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role for the claim (bypasses RLS)
    const serviceSupabase = createServiceRoleClient();

    // Call the claim RPC with service role
    const { data: claimResult, error: claimError } = await serviceSupabase.rpc(
      'claim_anonymous_meetings',
      {
        p_user_id: user.id,
        p_email: anonymousEmail,
        p_selected_speaker: undefined, // Speaker already assigned via /api/assign-speaker
      }
    );

    if (claimError) {
      console.error('Claim RPC failed:', claimError);
      return NextResponse.json(
        { error: 'Failed to claim meeting', details: claimError.message },
        { status: 500 }
      );
    }

    // Check if any meetings were actually claimed
    if (!claimResult || claimResult.length === 0) {
      console.warn('Claim RPC returned no results:', {
        meetingId,
        anonymousEmail,
        userId: user.id,
      });

      // Check if the meeting was already claimed by this user
      const { data: existingClaim } = await serviceSupabase
        .from('anonymous_uploads')
        .select('claimed_by_user_id')
        .eq('meeting_id', meetingId)
        .single();

      if (existingClaim?.claimed_by_user_id === user.id) {
        // Already claimed by this user - that's fine
        return NextResponse.json({
          success: true,
          alreadyClaimed: true,
          claimedMeetings: [],
        });
      }

      return NextResponse.json(
        { error: 'No matching unclaimed meeting found' },
        { status: 404 }
      );
    }

    console.log('Meeting claimed successfully:', claimResult);
    return NextResponse.json({
      success: true,
      claimedMeetings: claimResult,
    });
  } catch (err) {
    console.error('Error in claim-meeting API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
