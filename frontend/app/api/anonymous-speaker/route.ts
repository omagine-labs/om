import { createServiceRoleClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { GUEST_USER_ID } from '@/lib/constants';

/**
 * API route for anonymous speaker assignment with token validation.
 * Validates the access_token before allowing any operations.
 */

async function validateToken(
  meetingId: string,
  token: string
): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from('anonymous_uploads')
    .select('access_token, claimed_by_user_id')
    .eq('meeting_id', meetingId)
    .single();

  // Token must match and meeting must be unclaimed
  return data?.access_token === token && !data?.claimed_by_user_id;
}

/**
 * GET: Check for existing guest speaker assignment
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const token = searchParams.get('token');

    if (!meetingId || !token) {
      return NextResponse.json(
        { error: 'Missing meetingId or token' },
        { status: 400 }
      );
    }

    // Validate token
    const isValid = await validateToken(meetingId, token);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Fetch guest assignment using service role
    const supabase = createServiceRoleClient();
    const { data: guestAssignment } = await supabase
      .from('meeting_analysis')
      .select('speaker_label')
      .eq('meeting_id', meetingId)
      .eq('assigned_user_id', GUEST_USER_ID)
      .limit(1)
      .single();

    return NextResponse.json({
      speakerLabel: guestAssignment?.speaker_label || null,
    });
  } catch (err) {
    console.error('Error in anonymous-speaker GET:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST: Assign speaker to GUEST_USER_ID
 */
export async function POST(request: Request) {
  try {
    const { meetingId, speakerLabel, token } = await request.json();

    if (!meetingId || !speakerLabel || !token) {
      return NextResponse.json(
        { error: 'Missing meetingId, speakerLabel, or token' },
        { status: 400 }
      );
    }

    // Validate token
    const isValid = await validateToken(meetingId, token);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Assign speaker using service role
    const supabase = createServiceRoleClient();

    // Update meeting_analysis records
    const { error } = await supabase
      .from('meeting_analysis')
      .update({
        assigned_user_id: GUEST_USER_ID,
        custom_speaker_name: null,
      })
      .eq('meeting_id', meetingId)
      .eq('speaker_label', speakerLabel);

    if (error) {
      console.error('Failed to assign speaker:', error);
      return NextResponse.json(
        { error: 'Failed to assign speaker' },
        { status: 500 }
      );
    }

    // Also update meetings.user_speaker_label to track which speaker the user identified as
    const { error: meetingError } = await supabase
      .from('meetings')
      .update({ user_speaker_label: speakerLabel })
      .eq('id', meetingId);

    if (meetingError) {
      console.error('Failed to update meeting speaker label:', meetingError);
      // Non-fatal - continue anyway
    }

    // Fetch updated records
    const { data: updated } = await supabase
      .from('meeting_analysis')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('speaker_label');

    return NextResponse.json({ success: true, records: updated || [] });
  } catch (err) {
    console.error('Error in anonymous-speaker POST:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Unassign speaker (remove GUEST_USER_ID assignment)
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const token = searchParams.get('token');

    if (!meetingId || !token) {
      return NextResponse.json(
        { error: 'Missing meetingId or token' },
        { status: 400 }
      );
    }

    // Validate token
    const isValid = await validateToken(meetingId, token);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Unassign speaker using service role
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('meeting_analysis')
      .update({
        assigned_user_id: null,
        custom_speaker_name: null,
      })
      .eq('meeting_id', meetingId)
      .eq('assigned_user_id', GUEST_USER_ID);

    if (error) {
      console.error('Failed to unassign speaker:', error);
      return NextResponse.json(
        { error: 'Failed to unassign speaker' },
        { status: 500 }
      );
    }

    // Also clear meetings.user_speaker_label
    const { error: meetingError } = await supabase
      .from('meetings')
      .update({ user_speaker_label: null })
      .eq('id', meetingId);

    if (meetingError) {
      console.error('Failed to clear meeting speaker label:', meetingError);
      // Non-fatal - continue anyway
    }

    // Fetch updated records
    const { data: updated } = await supabase
      .from('meeting_analysis')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('speaker_label');

    return NextResponse.json({ success: true, records: updated || [] });
  } catch (err) {
    console.error('Error in anonymous-speaker DELETE:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
