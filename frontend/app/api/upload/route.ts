import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_FILE_SIZE,
  MIN_RECORDING_DURATION_SECONDS,
  calculateDurationSeconds,
  isDurationValid,
} from '@/lib/upload-constants';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import { apiLogger } from '@/lib/api-logger';
import { enrichMeetingWithCalendarData } from '@/lib/calendar-lookup';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/upload
 * Creates processing job record after client-side upload to Supabase Storage
 * NOTE: File upload happens directly from client to Supabase Storage
 * to bypass Vercel's 4.5MB body size limit
 * Supports both cookie-based auth (web) and Bearer token auth (desktop)
 */
export async function POST(request: NextRequest) {
  try {
    // Add breadcrumb for API request start
    Sentry.addBreadcrumb({
      category: 'api',
      message: 'Upload API request received',
      level: 'info',
      data: {
        component: 'frontend-api',
      },
    });

    // Check if request has Bearer token (from desktop app)
    const authHeader = request.headers.get('authorization');
    let supabase;

    if (authHeader?.startsWith('Bearer ')) {
      // Desktop app with Bearer token
      const token = authHeader.substring(7);
      supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    } else {
      // Web app with cookies
      supabase = await createServerSupabaseClient();
    }

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    apiLogger.log('Auth check:', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message,
    });

    if (authError || !user) {
      // Capture auth errors
      Sentry.captureException(authError || new Error('User not authenticated'));
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Set user context for this request
    Sentry.setUser({ id: user.id, email: user.email || undefined });
    Sentry.setTag('user_id', user.id);
    Sentry.setTag('component', 'frontend-api');

    // Parse JSON body (sent from client after file upload)
    const body = await request.json();

    apiLogger.log('[API /upload] Request body received:', {
      hasJobId: !!body.jobId,
      hasStoragePath: !!body.storagePath,
      hasOriginalFilename: !!body.originalFilename,
      hasFileSizeMB: !!body.fileSizeMB,
      hasDurationSeconds: body.durationSeconds !== undefined,
      hasMeetingInfo: !!body.meetingInfo,
    });

    const {
      jobId,
      storagePath,
      micAudioPath, // Optional: path to mic-only audio for VAD
      systemAudioPath, // Optional: path to system-only audio
      originalFilename,
      fileSizeMB,
      durationSeconds, // Duration from desktop app (if available)
      meetingInfo, // Structure: { title, startTime, endTime?, description?, meetingLink?, meetingId? }
      offRecordPeriods, // Optional: periods when recording was paused
    } = body;

    // Validate required fields
    if (!storagePath || !originalFilename || !fileSizeMB) {
      apiLogger.log('[API /upload] ERROR: Missing required fields', {
        storagePath,
        originalFilename,
        fileSizeMB,
      });
      Sentry.captureException(new Error('Missing required fields in upload'));
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Add breadcrumb with upload details
    Sentry.addBreadcrumb({
      category: 'api',
      message: 'Upload request validated',
      level: 'info',
      data: {
        storagePath,
        fileSizeMB,
        durationSeconds,
        meetingTitle: meetingInfo?.title,
      },
    });

    apiLogger.log('[API /upload] Upload request validated:', {
      jobId,
      storagePath,
      originalFilename,
      fileSizeMB,
      durationSeconds,
      meetingTitle: meetingInfo?.title,
    });

    let meetingId: string | null = null;

    // If meeting info is provided, use or create the meeting record with recording metadata
    if (meetingInfo) {
      const {
        title,
        startTime,
        endTime,
        description,
        meetingLink,
        meetingId: providedMeetingId, // Database meeting ID from client
      } = meetingInfo;

      // Validate recording duration
      // Check either:
      // 1. Duration calculated from startTime/endTime (if both provided)
      // 2. Duration sent directly from desktop app (durationSeconds field)
      let recordingDuration: number | null = null;

      if (startTime && endTime) {
        recordingDuration = calculateDurationSeconds(startTime, endTime);
      } else if (durationSeconds !== undefined && durationSeconds !== null) {
        recordingDuration = durationSeconds;
      }

      if (recordingDuration !== null) {
        apiLogger.log('[API /upload] Validating duration:', {
          recordingDuration,
          minRequired: MIN_RECORDING_DURATION_SECONDS,
          isValid: isDurationValid(recordingDuration),
        });

        if (!isDurationValid(recordingDuration)) {
          apiLogger.log(
            `[API /upload] Recording too short (${recordingDuration}s), deleting storage file`
          );

          // Delete the storage file since recording is too short
          await supabase.storage.from('recordings').remove([storagePath]);

          // This is expected business logic validation, not an error to report to Sentry
          return NextResponse.json(
            {
              success: false,
              message: `Recording duration (${recordingDuration}s) is below the minimum requirement of ${MIN_RECORDING_DURATION_SECONDS}s`,
              durationSeconds: recordingDuration,
              minDurationSeconds: MIN_RECORDING_DURATION_SECONDS,
            },
            { status: 400 }
          );
        }

        apiLogger.log(
          `[API /upload] Duration validated: ${recordingDuration}s (meets minimum of ${MIN_RECORDING_DURATION_SECONDS}s)`
        );
      } else {
        apiLogger.log(
          '[API /upload] No duration provided, skipping validation'
        );
      }

      // If meeting ID is provided, use it directly (meeting already exists in DB)
      if (providedMeetingId) {
        meetingId = providedMeetingId;
        apiLogger.log('Using provided meeting ID:', meetingId);
      }

      // If no existing meeting found, create new one
      if (!meetingId) {
        apiLogger.log(
          '[API /upload] Creating new meeting with recording data:',
          {
            userId: user.id,
            title,
            startTime,
            endTime,
            storagePath,
            fileSizeMB,
          }
        );

        const { data: newMeeting, error: meetingError } = await supabase
          .from('meetings')
          .insert({
            user_id: user.id,
            title,
            start_time: startTime,
            end_time: endTime || null,
            description: description || null,
            meeting_link: meetingLink || null,
            // Recording metadata - triggers processing_job creation automatically
            recording_filename: originalFilename,
            audio_storage_path: storagePath,
            mic_audio_path: micAudioPath || null,
            recording_size_mb: fileSizeMB,
            recording_duration_seconds: recordingDuration,
            recording_available_until: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            off_record_periods: offRecordPeriods || null,
          })
          .select('id')
          .single();

        if (meetingError) {
          apiLogger.error('[API /upload] ERROR: Failed to create meeting:', {
            error: meetingError,
            code: meetingError.code,
            message: meetingError.message,
            details: meetingError.details,
            hint: meetingError.hint,
          });
          Sentry.captureException(meetingError);
          return NextResponse.json(
            {
              success: false,
              message: `Failed to create meeting: ${meetingError.message}`,
            },
            { status: 500 }
          );
        }

        meetingId = newMeeting.id;
        Sentry.setTag('meeting_id', meetingId);
        Sentry.addBreadcrumb({
          category: 'api',
          message: 'Meeting record created',
          level: 'info',
          data: { meetingId },
        });
        apiLogger.log(
          '[API /upload] Created new meeting with recording:',
          meetingId
        );
      } else {
        apiLogger.log(
          '[API /upload] Updating existing meeting with recording:',
          meetingId
        );

        // Meeting already exists, update it with recording metadata
        // This will trigger processing_job creation via database trigger
        const { error: updateError } = await supabase
          .from('meetings')
          .update({
            recording_filename: originalFilename,
            audio_storage_path: storagePath,
            mic_audio_path: micAudioPath || null,
            recording_size_mb: fileSizeMB,
            recording_duration_seconds: recordingDuration,
            recording_available_until: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            off_record_periods: offRecordPeriods || null,
          })
          .eq('id', meetingId);

        if (updateError) {
          apiLogger.error('[API /upload] ERROR: Failed to update meeting:', {
            error: updateError,
            code: updateError.code,
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
          });
          return NextResponse.json(
            {
              success: false,
              message: `Failed to update meeting: ${updateError.message}`,
            },
            { status: 500 }
          );
        }

        apiLogger.log(
          '[API /upload] Updated meeting with recording:',
          meetingId
        );
      }

      // Enrich meeting with calendar data (async, don't block response)
      // This looks up calendar events around the meeting time and adds attendees, meeting link, etc.
      if (meetingId && startTime) {
        enrichMeetingWithCalendarData(
          supabase,
          meetingId,
          user.id,
          startTime,
          endTime
        ).catch((err) => {
          apiLogger.error(
            '[API /upload] Calendar enrichment error (non-blocking):',
            err
          );
        });
      }
    }

    apiLogger.log(
      '[API /upload] SUCCESS: Meeting record saved, processing_job will be auto-created by trigger',
      {
        jobId,
        meetingId,
        storagePath,
      }
    );

    // Add success breadcrumb
    Sentry.addBreadcrumb({
      category: 'api',
      message: 'Upload completed successfully',
      level: 'info',
      data: {
        meetingId,
        jobId,
        storagePath,
      },
    });

    // Note: We don't send info-level captureMessage to Sentry to avoid noise
    // Breadcrumbs are sufficient for tracking successful operations

    return NextResponse.json(
      {
        success: true,
        jobId,
        meetingId,
        storagePath,
        message: 'Processing job created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    apiLogger.error('[API /upload] UNEXPECTED ERROR:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Capture unexpected errors in Sentry
    Sentry.captureException(error);

    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload
 * Returns upload configuration and limits
 */
export async function GET() {
  return NextResponse.json({
    maxFileSize: MAX_FILE_SIZE,
    supportedFormats: {
      video: ['mp4', 'mov', 'webm', 'avi', 'mkv'],
      audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'],
    },
  });
}
