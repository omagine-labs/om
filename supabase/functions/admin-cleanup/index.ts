// Edge Function: Admin Cleanup
// Manual cleanup operations for administrators
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('admin-cleanup');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Helper: Verify admin authentication
async function verifyAdmin(req: Request) {
  const apiKey = req.headers.get('X-Admin-API-Key');
  const expectedKey = Deno.env.get('ADMIN_API_KEY');

  if (!expectedKey) {
    throw new Error('Admin API key not configured');
  }

  if (apiKey !== expectedKey) {
    throw new Error('Unauthorized: Invalid admin API key');
  }
}

// Helper: Clean up failed jobs
async function cleanupFailedJobs(
  supabase: SupabaseClient,
  dryRun: boolean
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  console.log(`[admin-cleanup] Finding failed jobs (dry_run: ${dryRun})`);

  // Find all failed jobs
  const { data: failedJobs, error: fetchError } = await supabase
    .from('processing_jobs')
    .select('id, meeting_id, created_at, processing_error')
    .eq('status', 'failed')
    .order('created_at', { ascending: false });

  if (fetchError) {
    throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
  }

  if (!failedJobs || failedJobs.length === 0) {
    return {
      dry_run: dryRun,
      jobs_found: 0,
      jobs_deleted: 0,
      storage_freed_mb: 0,
      errors: [],
    };
  }

  console.log(`[admin-cleanup] Found ${failedJobs.length} failed jobs`);

  if (dryRun) {
    // Get storage paths for size estimation
    const storagePaths = [];
    for (const job of failedJobs) {
      const { data: meeting } = await supabase
        .from('meetings')
        .select('audio_storage_path, recording_size_mb')
        .eq('id', job.meeting_id)
        .single();

      if (meeting?.audio_storage_path) {
        storagePaths.push({
          path: meeting.audio_storage_path,
          size_mb: meeting.recording_size_mb || 0,
        });
      }
    }

    const totalSizeMB = storagePaths.reduce((sum, f) => sum + f.size_mb, 0);

    return {
      dry_run: true,
      jobs_found: failedJobs.length,
      storage_files: storagePaths.map((f) => f.path),
      estimated_storage_freed_mb: Math.round(totalSizeMB * 100) / 100,
    };
  }

  // Actually clean up
  let deletedCount = 0;
  let storageSizeMB = 0;
  const errors: string[] = [];

  for (const job of failedJobs) {
    try {
      // Get meeting details
      const { data: meeting } = await supabase
        .from('meetings')
        .select('audio_storage_path, recording_size_mb')
        .eq('id', job.meeting_id)
        .single();

      if (meeting?.audio_storage_path) {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([meeting.audio_storage_path]);

        if (!storageError) {
          storageSizeMB += meeting.recording_size_mb || 0;
        }
      }

      // Clear meeting metadata
      await supabase
        .from('meetings')
        .update({
          recording_filename: null,
          audio_storage_path: null,
          recording_size_mb: null,
          recording_duration_seconds: null,
          recording_available_until: null,
        })
        .eq('id', job.meeting_id);

      // Delete job
      await supabase.from('processing_jobs').delete().eq('id', job.id);

      deletedCount++;
    } catch (error) {
      errors.push(`Job ${job.id}: ${error.message}`);
    }
  }

  return {
    dry_run: false,
    jobs_deleted: deletedCount,
    storage_freed_mb: Math.round(storageSizeMB * 100) / 100,
    errors,
  };
}

// Helper: Clean up expired jobs
async function cleanupExpiredJobs(
  supabase: SupabaseClient,
  dryRun: boolean
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  console.log(
    `[admin-cleanup] Finding expired recordings (dry_run: ${dryRun})`
  );

  const now = new Date().toISOString();
  const { data: expiredMeetings, error: fetchError } = await supabase
    .from('meetings')
    .select(
      'id, audio_storage_path, recording_size_mb, recording_available_until'
    )
    .not('recording_available_until', 'is', null)
    .lte('recording_available_until', now);

  if (fetchError) {
    throw new Error(`Failed to fetch expired meetings: ${fetchError.message}`);
  }

  if (!expiredMeetings || expiredMeetings.length === 0) {
    return {
      dry_run: dryRun,
      jobs_found: 0,
      jobs_deleted: 0,
      storage_freed_mb: 0,
      errors: [],
    };
  }

  console.log(
    `[admin-cleanup] Found ${expiredMeetings.length} expired recordings`
  );

  if (dryRun) {
    const totalSizeMB = expiredMeetings.reduce(
      (sum, m) => sum + (m.recording_size_mb || 0),
      0
    );

    return {
      dry_run: true,
      jobs_found: expiredMeetings.length,
      storage_files: expiredMeetings
        .filter((m) => m.audio_storage_path)
        .map((m) => m.audio_storage_path),
      estimated_storage_freed_mb: Math.round(totalSizeMB * 100) / 100,
    };
  }

  // Actually clean up
  let deletedCount = 0;
  let storageSizeMB = 0;
  const errors: string[] = [];

  for (const meeting of expiredMeetings) {
    try {
      if (meeting.audio_storage_path) {
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([meeting.audio_storage_path]);

        if (!storageError) {
          storageSizeMB += meeting.recording_size_mb || 0;
        }
      }

      // Clear meeting metadata
      await supabase
        .from('meetings')
        .update({
          recording_filename: null,
          audio_storage_path: null,
          recording_size_mb: null,
          recording_duration_seconds: null,
          recording_available_until: null,
        })
        .eq('id', meeting.id);

      deletedCount++;
    } catch (error) {
      errors.push(`Meeting ${meeting.id}: ${error.message}`);
    }
  }

  return {
    dry_run: false,
    jobs_deleted: deletedCount,
    storage_freed_mb: Math.round(storageSizeMB * 100) / 100,
    errors,
  };
}

// Helper: Find orphaned files
async function findOrphans(
  supabase: SupabaseClient,
  dryRun: boolean
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  console.log(`[admin-cleanup] Finding orphaned files (dry_run: ${dryRun})`);

  // Get all storage files
  const { data: storageFiles, error: storageError } = await supabase.storage
    .from('recordings')
    .list('', { limit: 1000 });

  if (storageError) {
    throw new Error(`Failed to list storage files: ${storageError.message}`);
  }

  // Get all meetings with recordings
  const { data: meetings, error: meetingsError } = await supabase
    .from('meetings')
    .select('audio_storage_path')
    .not('audio_storage_path', 'is', null);

  if (meetingsError) {
    throw new Error(`Failed to fetch meetings: ${meetingsError.message}`);
  }

  const meetingPaths = new Set(
    meetings.map((m: { audio_storage_path: string }) => m.audio_storage_path)
  );

  // Find orphaned files (in storage but not in database)
  const orphanedFiles: string[] = [];
  for (const file of storageFiles || []) {
    if (!meetingPaths.has(file.name)) {
      orphanedFiles.push(file.name);
    }
  }

  console.log(`[admin-cleanup] Found ${orphanedFiles.length} orphaned files`);

  if (dryRun || orphanedFiles.length === 0) {
    return {
      dry_run: dryRun,
      orphaned_files: orphanedFiles,
      storage_freed_mb: 0, // Would need to fetch file sizes
    };
  }

  // Delete orphaned files
  const { error: deleteError } = await supabase.storage
    .from('recordings')
    .remove(orphanedFiles);

  if (deleteError) {
    throw new Error(`Failed to delete orphaned files: ${deleteError.message}`);
  }

  return {
    dry_run: false,
    orphaned_files_deleted: orphanedFiles.length,
    storage_freed_mb: 0, // Would need to calculate
  };
}

// Helper: Get statistics
async function getStats(
  supabase: SupabaseClient
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  console.log(`[admin-cleanup] Fetching statistics`);

  const now = new Date().toISOString();

  // Get job counts by status
  const { data: jobs, error: jobsError } = await supabase
    .from('processing_jobs')
    .select('status');

  if (jobsError) {
    throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
  }

  const jobStats = {
    total: jobs?.length || 0,
    completed:
      jobs?.filter((j: { status: string }) => j.status === 'completed')
        .length || 0,
    failed:
      jobs?.filter((j: { status: string }) => j.status === 'failed').length ||
      0,
    pending:
      jobs?.filter((j: { status: string }) => j.status === 'pending').length ||
      0,
    processing:
      jobs?.filter((j: { status: string }) => j.status === 'processing')
        .length || 0,
  };

  // Get expired recordings count
  const { data: expiredMeetings, error: expiredError } = await supabase
    .from('meetings')
    .select('id, recording_size_mb')
    .not('recording_available_until', 'is', null)
    .lte('recording_available_until', now);

  if (expiredError) {
    throw new Error(
      `Failed to fetch expired meetings: ${expiredError.message}`
    );
  }

  // Get total storage used
  const { data: allMeetings, error: meetingsError } = await supabase
    .from('meetings')
    .select('recording_size_mb')
    .not('recording_size_mb', 'is', null);

  if (meetingsError) {
    throw new Error(`Failed to fetch meetings: ${meetingsError.message}`);
  }

  const totalStorageMB =
    allMeetings?.reduce(
      (sum: number, m: { recording_size_mb: number | null }) =>
        sum + (m.recording_size_mb || 0),
      0
    ) || 0;

  const expiredStorageMB =
    expiredMeetings?.reduce(
      (sum: number, m: { recording_size_mb: number | null }) =>
        sum + (m.recording_size_mb || 0),
      0
    ) || 0;

  return {
    jobs: jobStats,
    expired_recordings: expiredMeetings?.length || 0,
    storage_used_mb: Math.round(totalStorageMB * 100) / 100,
    expired_storage_mb: Math.round(expiredStorageMB * 100) / 100,
    timestamp: new Date().toISOString(),
  };
}

// Main handler
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    await verifyAdmin(req);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let result;

    switch (path) {
      case 'failed': {
        const body = await req.json();
        const dryRun = body.dry_run ?? true;
        result = await cleanupFailedJobs(supabase, dryRun);
        break;
      }

      case 'expired': {
        const body = await req.json();
        const dryRun = body.dry_run ?? true;
        result = await cleanupExpiredJobs(supabase, dryRun);
        break;
      }

      case 'orphans': {
        const body = await req.json();
        const dryRun = body.dry_run ?? true;
        result = await findOrphans(supabase, dryRun);
        break;
      }

      case 'stats': {
        result = await getStats(supabase);
        break;
      }

      default: {
        await flush();
        return new Response(
          JSON.stringify({
            error: 'Invalid endpoint',
            available_endpoints: ['/failed', '/expired', '/orphans', '/stats'],
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    await flush();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[admin-cleanup] Error:', error);

    const status = error.message.includes('Unauthorized') ? 401 : 500;

    await flush();
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
