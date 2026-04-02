// Edge Function: Create Anonymous Meeting
// Handles anonymous meeting uploads from marketing website with rate limiting and validation
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeEmail, isValidEmail } from '../_shared/email-utils.ts';
import {
  trackEvent,
  hashIpAddress,
  MonitoringEvents,
} from '../_shared/analytics.ts';
import {
  getCorsHeaders,
  MONTHLY_UPLOAD_CAP,
  GUEST_USER_ID,
  RATE_LIMIT_WINDOW_HOURS,
  RATE_LIMIT_MAX_UPLOADS_PER_IP,
  RATE_LIMIT_ABUSE_THRESHOLD,
  FILE_HASH_SAMPLE_SIZE,
} from '../_shared/constants.ts';
import { initSentry, captureException, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('create-anonymous-meeting');

const isSuspiciousUserAgent = (userAgent: string | null): boolean => {
  if (!userAgent || userAgent.trim() === '') {
    return true; // Empty user agent is suspicious
  }

  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /axios/i,
    /postman/i,
    /insomnia/i,
    /httpie/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(userAgent));
};

/**
 * Send alert to team (fire-and-forget)
 * Does not throw errors to avoid breaking the upload flow
 */
async function sendTeamAlert(
  alertType: string,
  alertDetails: Record<string, unknown>
) {
  try {
    const alertUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-team-alert`;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Fire-and-forget HTTP request
    fetch(alertUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        alert_type: alertType,
        alert_details: alertDetails,
      }),
    }).catch((error) => {
      console.error('[create-anonymous-meeting] Failed to send alert:', error);
    });
  } catch (error) {
    console.error('[create-anonymous-meeting] Error in sendTeamAlert:', error);
    // Don't throw - alerts should never break the upload flow
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate Content-Type
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request
    const { email, storagePath, filename, fileSizeMB, ipAddress, userAgent } =
      await req.json();

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!storagePath || typeof storagePath !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Storage path is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!filename || typeof filename !== 'string') {
      return new Response(JSON.stringify({ error: 'Filename is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof fileSizeMB !== 'number' || fileSizeMB <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid file size is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate and normalize email SERVER-SIDE (never trust client)
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = normalizeEmail(email);

    console.log(
      `[create-anonymous-meeting] Processing upload for email: ${email}`
    );

    // Validate User-Agent to block bots and automated scripts
    if (isSuspiciousUserAgent(userAgent)) {
      console.log(
        `[create-anonymous-meeting] Suspicious User-Agent detected: ${userAgent}`
      );

      // Track fraud detection event
      const ipHash = ipAddress ? await hashIpAddress(ipAddress) : 'unknown';
      await trackEvent(supabase, MonitoringEvents.ANON_UPLOAD_FRAUD_DETECTED, {
        email: normalizedEmail,
        reason: 'invalid_user_agent',
        details: `User-Agent: ${userAgent}`,
        ip_hash: ipHash,
      });

      return new Response(
        JSON.stringify({
          error: 'Invalid request. Please use a standard web browser.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1. Check if beta user FIRST (to skip cap checks if applicable)
    const { data: betaUser, error: betaError } = await supabase
      .from('beta_users')
      .select('*')
      .eq('normalized_email', normalizedEmail)
      .maybeSingle();

    // PGRST116 = "no rows returned" from PostgREST, which is expected when user is not a beta user
    if (betaError && betaError.code !== 'PGRST116') {
      console.error(
        '[create-anonymous-meeting] Beta user check error:',
        betaError
      );
      throw betaError;
    }

    if (betaUser) {
      console.log(
        `[create-anonymous-meeting] Beta user detected: ${betaUser.email}`
      );
    }

    // 2. Check monthly cap (only for non-beta users)
    if (!betaUser) {
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      const { count: uploadsThisMonth, error: countError } = await supabase
        .from('anonymous_uploads')
        .select('id', { count: 'exact', head: true })
        .gte('uploaded_at', firstDayOfMonth.toISOString());

      if (countError) {
        console.error(
          '[create-anonymous-meeting] Error counting uploads:',
          countError
        );
        throw countError;
      }

      console.log(
        `[create-anonymous-meeting] Uploads this month: ${uploadsThisMonth}/${MONTHLY_UPLOAD_CAP}`
      );

      // Track capacity warning if approaching limit (90%+)
      const percentageUsed =
        ((uploadsThisMonth ?? 0) / MONTHLY_UPLOAD_CAP) * 100;
      if (percentageUsed >= 90) {
        const capacityDetails = {
          current_count: uploadsThisMonth ?? 0,
          max_capacity: MONTHLY_UPLOAD_CAP,
          percentage_used: Math.round(percentageUsed),
        };

        await trackEvent(
          supabase,
          MonitoringEvents.ANON_UPLOAD_CAPACITY_WARNING,
          capacityDetails
        );

        // Send alert to team (fire-and-forget)
        sendTeamAlert('capacity_warning', capacityDetails);
      }

      if ((uploadsThisMonth ?? 0) >= MONTHLY_UPLOAD_CAP) {
        console.log('[create-anonymous-meeting] Monthly cap reached');
        return new Response(
          JSON.stringify({
            error:
              'Monthly upload capacity reached. Please try again next month or sign up for a free trial!',
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 2.5. IP-based rate limiting (only for non-beta users)
    if (!betaUser && ipAddress) {
      const rateLimitKey = await hashRateLimitKey(email, ipAddress);
      const rateLimitWindowStart = new Date(
        Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
      );

      // Check uploads from this IP within the time window
      const { data: recentUploads, error: rateLimitError } = await supabase
        .from('anonymous_uploads')
        .select('id, normalized_email')
        .eq('rate_limit_key', rateLimitKey)
        .gte('uploaded_at', rateLimitWindowStart.toISOString());

      if (rateLimitError) {
        console.error(
          '[create-anonymous-meeting] Error checking rate limit:',
          rateLimitError
        );
        throw rateLimitError;
      }

      const uploadCount = recentUploads?.length ?? 0;

      console.log(
        `[create-anonymous-meeting] IP rate limit check: ${uploadCount}/${RATE_LIMIT_MAX_UPLOADS_PER_IP} uploads in last ${RATE_LIMIT_WINDOW_HOURS}h`
      );

      if (uploadCount >= RATE_LIMIT_MAX_UPLOADS_PER_IP) {
        console.log(
          `[create-anonymous-meeting] IP rate limit exceeded: ${uploadCount} uploads from IP in last ${RATE_LIMIT_WINDOW_HOURS}h`
        );

        // Track rate limit event
        const ipHash = await hashIpAddress(ipAddress);
        await trackEvent(supabase, MonitoringEvents.ANON_UPLOAD_RATE_LIMITED, {
          email: normalizedEmail,
          limit_type: 'per_ip',
          current_count: uploadCount,
          max_allowed: RATE_LIMIT_MAX_UPLOADS_PER_IP,
          ip_hash: ipHash,
        });

        return new Response(
          JSON.stringify({
            error:
              'Too many upload attempts. Please wait before trying again or sign up for a free trial!',
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Check for distributed abuse (multiple emails from same IP)
      const uniqueEmails = new Set(
        recentUploads?.map((u) => u.normalized_email) || []
      );
      if (uniqueEmails.size >= RATE_LIMIT_ABUSE_THRESHOLD) {
        console.log(
          `[create-anonymous-meeting] Distributed abuse detected: ${uniqueEmails.size} different emails from same IP in last ${RATE_LIMIT_WINDOW_HOURS}h`
        );

        // Track IP blocked event
        const ipHash = await hashIpAddress(ipAddress);
        const abuseDetails = {
          ip_hash: ipHash,
          email_count: uniqueEmails.size,
          max_allowed: RATE_LIMIT_ABUSE_THRESHOLD,
        };

        await trackEvent(
          supabase,
          MonitoringEvents.ANON_UPLOAD_IP_BLOCKED,
          abuseDetails
        );

        // Send fraud alert to team (fire-and-forget)
        sendTeamAlert('fraud_spike', {
          count: uniqueEmails.size,
          primary_reason: 'multiple_emails_from_ip',
          ip_hash: ipHash,
        });

        return new Response(
          JSON.stringify({
            error:
              'Suspicious activity detected. Please contact support if you believe this is an error.',
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 3. Check per-email limit (unless beta user)
    if (!betaUser) {
      const { data: existingUpload, error: existingError } = await supabase
        .from('anonymous_uploads')
        .select('id')
        .eq('normalized_email', normalizedEmail)
        .maybeSingle();

      // PGRST116 = "no rows returned" from PostgREST, which is expected when email hasn't been used
      if (existingError && existingError.code !== 'PGRST116') {
        console.error(
          '[create-anonymous-meeting] Error checking existing upload:',
          existingError
        );
        throw existingError;
      }

      if (existingUpload) {
        console.log(
          `[create-anonymous-meeting] Email already used: ${normalizedEmail}`
        );

        // Track rate limit event
        const ipHash = ipAddress ? await hashIpAddress(ipAddress) : 'unknown';
        await trackEvent(supabase, MonitoringEvents.ANON_UPLOAD_RATE_LIMITED, {
          email: normalizedEmail,
          limit_type: 'per_email',
          current_count: 1,
          max_allowed: 1,
          ip_hash: ipHash,
        });

        return new Response(
          JSON.stringify({
            error:
              'This email has already been used for a free analysis. Please sign up for a free trial to analyze more meetings!',
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 3.5. File content fingerprinting (detect duplicate uploads)
    let fileHash: string | null = null;
    if (!betaUser) {
      try {
        // Download first chunk of file to compute hash
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('anonymous-recordings')
          .download(storagePath, {
            transform: {
              width: undefined, // No transformation
              height: undefined,
            },
          });

        if (downloadError) {
          console.error(
            '[create-anonymous-meeting] Error downloading file for hash:',
            downloadError
          );
          // Continue without hash check if download fails (don't block legitimate uploads)
        } else if (fileData) {
          // Read first 1MB (or entire file if smaller)
          const arrayBuffer = await fileData.arrayBuffer();
          const sampleSize = Math.min(
            arrayBuffer.byteLength,
            FILE_HASH_SAMPLE_SIZE
          );
          const sampleData = new Uint8Array(arrayBuffer, 0, sampleSize);

          // Compute hash
          fileHash = await computeFileHash(sampleData, fileSizeMB);
          console.log(
            `[create-anonymous-meeting] File hash computed: ${fileHash.substring(0, 16)}...`
          );

          // Check for duplicate uploads
          const { data: duplicateUpload, error: duplicateError } =
            await supabase
              .from('anonymous_uploads')
              .select('id, email, uploaded_at')
              .eq('file_hash', fileHash)
              .maybeSingle();

          if (duplicateError && duplicateError.code !== 'PGRST116') {
            console.error(
              '[create-anonymous-meeting] Error checking duplicate hash:',
              duplicateError
            );
            // Continue without duplicate check if query fails
          } else if (duplicateUpload) {
            console.log(
              `[create-anonymous-meeting] Duplicate file detected (hash: ${fileHash.substring(0, 16)}...)`
            );

            // Track fraud detection event
            const ipHash = ipAddress
              ? await hashIpAddress(ipAddress)
              : 'unknown';
            await trackEvent(
              supabase,
              MonitoringEvents.ANON_UPLOAD_FRAUD_DETECTED,
              {
                email: normalizedEmail,
                reason: 'duplicate_content',
                details: `File hash: ${fileHash.substring(0, 16)}..., previously uploaded by ${duplicateUpload.email}`,
                ip_hash: ipHash,
              }
            );

            // Delete the duplicate file from storage
            await supabase.storage
              .from('anonymous-recordings')
              .remove([storagePath]);

            return new Response(
              JSON.stringify({
                error:
                  'This file has already been uploaded. Please upload a different meeting recording or sign up for a free trial!',
              }),
              {
                status: 409,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
        }
      } catch (error) {
        console.error(
          '[create-anonymous-meeting] Error during file hash check:',
          error
        );
        // Continue without hash check if error occurs
      }
    }

    // 4. Create meeting record
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert({
        user_id: GUEST_USER_ID,
        title: filename.replace(/\.[^/.]+$/, ''), // Remove extension
        recording_filename: filename,
        audio_storage_path: storagePath,
        recording_size_mb: fileSizeMB,
        start_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (meetingError) {
      console.error(
        '[create-anonymous-meeting] Error creating meeting:',
        meetingError
      );
      throw meetingError;
    }

    console.log(`[create-anonymous-meeting] Created meeting: ${meeting.id}`);

    // 5. Create anonymous_uploads record
    const rateLimitKey = await hashRateLimitKey(email, ipAddress || 'unknown');

    const { data: anonUpload, error: uploadError } = await supabase
      .from('anonymous_uploads')
      .insert({
        email,
        normalized_email: normalizedEmail,
        meeting_id: meeting.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        rate_limit_key: rateLimitKey,
        file_hash: fileHash, // Store file hash for duplicate detection
      })
      .select('access_token')
      .single();

    if (uploadError) {
      console.error(
        '[create-anonymous-meeting] Error creating anonymous upload:',
        uploadError
      );
      // Rollback: delete the meeting
      await supabase.from('meetings').delete().eq('id', meeting.id);
      throw uploadError;
    }

    // 6. Update beta user upload count if applicable
    if (betaUser && betaUser.allowed_uploads !== -1) {
      await supabase
        .from('beta_users')
        .update({ uploads_used: (betaUser.uploads_used || 0) + 1 })
        .eq('id', betaUser.id);
      console.log(`[create-anonymous-meeting] Updated beta user upload count`);
    }

    // 7. Wait for database trigger to create processing job, then update priority to high
    // The on_meeting_recording_added trigger automatically creates a job when audio_storage_path is set
    // We wait a moment for it to be created, then update its priority
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms for trigger

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .update({
        processing_priority: 'high',
      })
      .eq('meeting_id', meeting.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (jobError || !job) {
      console.error(
        '[create-anonymous-meeting] Error updating processing job priority:',
        jobError
      );
      // Don't throw - job will still be processed, just with normal priority
      console.log(
        '[create-anonymous-meeting] Continuing without high priority flag'
      );
    } else {
      console.log(
        `[create-anonymous-meeting] Updated processing job ${job.id} to high priority`
      );
    }

    // Track successful upload
    const ipHash = ipAddress ? await hashIpAddress(ipAddress) : 'unknown';
    await trackEvent(supabase, MonitoringEvents.ANON_UPLOAD_SUCCEEDED, {
      email: normalizedEmail,
      file_size: fileSizeMB * 1024 * 1024, // Convert MB to bytes
      file_type: filename.split('.').pop() || 'unknown',
      ip_hash: ipHash,
    });

    // Database trigger will invoke process-meeting Edge Function

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meeting.id,
        job_id: job?.id || 'auto-created',
        access_token: anonUpload?.access_token,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[create-anonymous-meeting] Error:', error);
    captureException(error);

    // Track failed upload (best effort - don't throw if tracking fails)
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await trackEvent(supabase, MonitoringEvents.ANON_UPLOAD_FAILED, {
        error: error.message || 'Unknown error',
      });
    } catch (trackError) {
      console.error(
        '[create-anonymous-meeting] Error tracking failure:',
        trackError
      );
    }

    await flush();
    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function hashRateLimitKey(email: string, ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email + ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeFileHash(
  fileData: Uint8Array,
  fileSizeMB: number
): Promise<string> {
  // Compute hash from file data + size (to differentiate files with same content but different sizes)
  const sizeData = new TextEncoder().encode(fileSizeMB.toString());
  const combinedData = new Uint8Array(fileData.length + sizeData.length);
  combinedData.set(fileData);
  combinedData.set(sizeData, fileData.length);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
