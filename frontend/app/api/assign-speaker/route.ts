import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Assign speaker for authenticated users on anonymous meetings
 * Uses service role to bypass RLS (meeting still belongs to GUEST)
 */
export async function POST(request: Request) {
  try {
    const { meetingId, speakerLabel } = await request.json();

    if (!meetingId || !speakerLabel) {
      return NextResponse.json(
        { error: 'Missing meetingId or speakerLabel' },
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

    // Use service role to assign speaker (bypasses RLS)
    const serviceSupabase = createServiceRoleClient();

    // Update meeting_analysis.assigned_user_id (for multi-user scenarios)
    const { error: analysisError } = await serviceSupabase
      .from('meeting_analysis')
      .update({
        assigned_user_id: user.id,
        custom_speaker_name: null,
      })
      .eq('meeting_id', meetingId)
      .eq('speaker_label', speakerLabel);

    if (analysisError) {
      console.error('Failed to assign speaker:', analysisError);
      return NextResponse.json(
        { error: 'Failed to assign speaker' },
        { status: 500 }
      );
    }

    // Also update meetings.user_speaker_label (source of truth for meeting owner)
    const { error: meetingError } = await serviceSupabase
      .from('meetings')
      .update({ user_speaker_label: speakerLabel })
      .eq('id', meetingId);

    if (meetingError) {
      console.error('Failed to update user_speaker_label:', meetingError);
      // Note: We don't fail the request since the main assignment succeeded
      // This is a secondary update for consistency
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in assign-speaker API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
