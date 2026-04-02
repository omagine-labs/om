// Edge Function: Check Email Eligibility
// Lightweight pre-check before file upload to validate if email can be used for anonymous upload
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeEmail, isValidEmail } from '../_shared/email-utils.ts';
import { getCorsHeaders, MONTHLY_UPLOAD_CAP } from '../_shared/constants.ts';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('check-email-eligibility');

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
      await flush();
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
    const { email } = await req.json();

    // Validate required fields
    if (!email || typeof email !== 'string') {
      await flush();
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      await flush();
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = normalizeEmail(email);

    console.log(
      `[check-email-eligibility] Checking eligibility for: ${normalizedEmail}`
    );

    // 1. Check if beta user (they bypass all limits)
    const { data: betaUser, error: betaError } = await supabase
      .from('beta_users')
      .select('id')
      .eq('normalized_email', normalizedEmail)
      .maybeSingle();

    // PGRST116 = "no rows returned" from PostgREST, which is expected when user is not a beta user
    if (betaError && betaError.code !== 'PGRST116') {
      console.error(
        '[check-email-eligibility] Beta user check error:',
        betaError
      );
      throw betaError;
    }

    if (betaUser) {
      console.log(`[check-email-eligibility] Beta user detected, eligible`);
      await flush();
      return new Response(
        JSON.stringify({ eligible: true, reason: 'beta_user' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Check monthly cap
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const { count: uploadsThisMonth, error: countError } = await supabase
      .from('anonymous_uploads')
      .select('id', { count: 'exact', head: true })
      .gte('uploaded_at', firstDayOfMonth.toISOString());

    if (countError) {
      console.error(
        '[check-email-eligibility] Error counting uploads:',
        countError
      );
      throw countError;
    }

    if ((uploadsThisMonth ?? 0) >= MONTHLY_UPLOAD_CAP) {
      console.log('[check-email-eligibility] Monthly cap reached');
      await flush();
      return new Response(
        JSON.stringify({
          eligible: false,
          error:
            'Monthly upload capacity reached. Please try again next month or sign up for a free trial!',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Check if email already used for a SUCCESSFUL upload
    const { data: existingUpload, error: existingError } = await supabase
      .from('anonymous_uploads')
      .select('id, meeting_id, meetings!inner(id, processing_jobs(status))')
      .eq('normalized_email', normalizedEmail)
      .maybeSingle();

    // PGRST116 = "no rows returned" from PostgREST, which is expected when email hasn't been used
    if (existingError && existingError.code !== 'PGRST116') {
      console.error(
        '[check-email-eligibility] Error checking existing upload:',
        existingError
      );
      throw existingError;
    }

    if (existingUpload) {
      // Check if the existing upload has a completed processing job
      const hasSuccessfulProcessing =
        existingUpload.meetings?.processing_jobs?.some(
          (job: any) => job.status === 'completed'
        );

      if (hasSuccessfulProcessing) {
        console.log(
          `[check-email-eligibility] Email already used with successful upload: ${normalizedEmail}`
        );
        await flush();
        return new Response(
          JSON.stringify({
            eligible: false,
            error:
              'This email has already been used for a free analysis. Please sign up for a free trial to analyze more meetings!',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log(
          `[check-email-eligibility] Email has failed upload, allowing retry: ${normalizedEmail}`
        );
        // Allow retry for failed uploads by continuing to return eligible: true
      }
    }

    // Email is eligible
    console.log(`[check-email-eligibility] Email eligible: ${normalizedEmail}`);
    await flush();
    return new Response(JSON.stringify({ eligible: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[check-email-eligibility] Error:', error);

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
