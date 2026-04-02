/**
 * Public Analysis Preview Page
 *
 * Shows full meeting analysis for unclaimed anonymous uploads.
 * Allows anonymous users to assign themselves to speakers before signing up.
 *
 * SECURITY: Access requires a valid access_token query parameter that matches
 * the token stored in anonymous_uploads. This prevents unauthorized access
 * to meeting data even if someone guesses or enumerates meeting IDs.
 */

import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import { AnalysisPreview } from './components/AnalysisPreview';

interface PageProps {
  params: Promise<{
    meetingId: string;
  }>;
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function AnalysisPreviewPage({
  params,
  searchParams,
}: PageProps) {
  const { meetingId } = await params;
  const { token } = await searchParams;

  // Use regular client for auth check
  const supabase = await createServerSupabaseClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Use service role to fetch anonymous meeting data
  const serviceSupabase = createServiceRoleClient();

  // SECURITY: First validate the access token before returning any data
  // This prevents unauthorized access even with a valid meeting ID
  const { data: anonUpload, error: anonUploadError } = await serviceSupabase
    .from('anonymous_uploads')
    .select(
      'email, claimed_by_user_id, claimed_at, normalized_email, access_token'
    )
    .eq('meeting_id', meetingId)
    .single();

  // If not an anonymous upload, redirect to regular meetings page
  if (!anonUpload) {
    console.error('[AnalysisPreview] No anonymous_uploads record found:', {
      meetingId,
      error: anonUploadError,
      errorCode: anonUploadError?.code,
      errorMessage: anonUploadError?.message,
    });
    redirect('/meetings');
  }

  // SECURITY: Validate access token for unclaimed meetings
  // Claimed meetings are only accessible by the owner (checked below)
  if (!anonUpload.claimed_by_user_id) {
    // For unclaimed meetings, require valid access token
    if (!token || token !== anonUpload.access_token) {
      console.warn('[AnalysisPreview] Invalid or missing access token:', {
        meetingId,
        hasToken: !!token,
        tokenMatch: token === anonUpload.access_token,
      });
      // Return 404 instead of 403 to avoid leaking that the meeting exists
      notFound();
    }
  }

  // Fetch meeting data
  const { data: meeting, error: meetingError } = await serviceSupabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    console.error('[AnalysisPreview] Failed to fetch meeting:', {
      meetingId,
      error: meetingError,
      errorCode: meetingError?.code,
      errorMessage: meetingError?.message,
      errorDetails: meetingError?.details,
      meetingData: meeting,
    });
    notFound();
  }

  // If claimed, check if current user is the owner
  if (anonUpload.claimed_by_user_id) {
    // If claimed by current user, redirect to dashboard
    if (user && user.id === anonUpload.claimed_by_user_id) {
      redirect('/meetings');
    }

    // Otherwise show "claimed" message
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Meeting Already Claimed
          </h1>
          <p className="text-gray-600 mb-6">
            This meeting analysis has been claimed by another user. If this is
            your meeting, please sign in to access it.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  // Fetch analysis records using service role
  // Note: transcript_segments column still exists but is deprecated (data now in transcripts table)
  const { data: analysisRecords } = await serviceSupabase
    .from('meeting_analysis')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('speaker_label');

  // Fetch transcript from dedicated transcripts table
  const { data: transcriptRecord } = await serviceSupabase
    .from('transcripts')
    .select('segments')
    .eq('meeting_id', meetingId)
    .single();

  // Parse full segments array from transcript record
  const fullSegments =
    (transcriptRecord?.segments as Array<{
      start: number;
      end: number;
      text: string;
      speaker: string;
    }>) || [];

  // Extract transcript excerpts grouped by speaker (first 3 segments per speaker for preview display)
  const speakerExcerpts: Record<string, string[]> = {};

  if (fullSegments.length > 0) {
    const SEGMENTS_PER_SPEAKER = 3;

    // Track unique speakers to know when we're done
    const uniqueSpeakers = new Set<string>();

    for (const segment of fullSegments) {
      if (!speakerExcerpts[segment.speaker]) {
        speakerExcerpts[segment.speaker] = [];
        uniqueSpeakers.add(segment.speaker);
      }

      // Collect first 3 segments per speaker for preview
      if (speakerExcerpts[segment.speaker].length < SEGMENTS_PER_SPEAKER) {
        speakerExcerpts[segment.speaker].push(segment.text);
      }

      // Early exit: if all speakers have 3 segments, we're done
      const allSpeakersHaveEnough = Array.from(uniqueSpeakers).every(
        (speaker) => speakerExcerpts[speaker].length >= SEGMENTS_PER_SPEAKER
      );
      if (allSpeakersHaveEnough) {
        break;
      }
    }
  }

  // Render the public preview
  return (
    <AnalysisPreview
      meeting={meeting}
      analysisRecords={analysisRecords || []}
      anonymousEmail={anonUpload.email}
      speakerExcerpts={speakerExcerpts}
      transcriptSegments={fullSegments}
      user={user}
      accessToken={token}
    />
  );
}
