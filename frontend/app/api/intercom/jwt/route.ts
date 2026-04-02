import { NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/app/api/_middleware/rate-limit';
import { UnauthorizedError, formatErrorResponse } from '@/lib/errors';
import jwt from 'jsonwebtoken';
import { calculateTrialDaysRemaining } from '@/lib/trial-utils';
import type { IntercomJWTPayload } from '@/types/intercom';

// CORS headers for desktop app access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * OPTIONS /api/intercom/jwt
 *
 * Handle CORS preflight requests from desktop app
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * POST /api/intercom/jwt
 *
 * Generate a JWT token for Intercom identity verification
 * Supports both cookie-based auth (web app) and Bearer token auth (desktop app)
 *
 * Rate Limit: 60 requests per 5 minutes
 *
 * Returns:
 * - 200: JWT token for Intercom
 * - 401: User not authenticated
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
export async function POST() {
  try {
    // Authenticate user (supports both cookies and Bearer tokens)
    const supabase = await createAuthenticatedSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError();
    }

    // Check rate limit (60 requests per 5 minutes)
    const rateLimitResponse = checkRateLimit({
      key: user.id,
      maxRequests: 60,
      windowMs: 5 * 60 * 1000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Get Intercom secret from environment
    const secret = process.env.INTERCOM_IDENTITY_VERIFICATION_SECRET;
    if (!secret) {
      console.error(
        'INTERCOM_IDENTITY_VERIFICATION_SECRET not configured in environment'
      );
      throw new Error('Intercom identity verification not configured');
    }

    // Fetch user profile for full name
    const { data: userProfile } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Fetch user's subscription status and trial information
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, trial_end, trial_start')
      .eq('user_id', user.id)
      .single();

    // Fetch user's analyzed meetings count (meetings with completed analysis)
    // Uses inner join to count distinct meetings that have analysis records
    const { count: meetingsCount } = await supabase
      .from('meetings')
      .select('id, meeting_analysis!inner(id)', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('meeting_analysis.created_by', user.id);

    // Fetch user's first meeting analysis timestamp
    const { data: firstMeetingAnalysis } = await supabase
      .from('meeting_analysis')
      .select('created_at')
      .eq('created_by', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Fetch user's calendar connection status (check for Google or Microsoft OAuth)
    const { data: oauthTokens } = await supabase
      .from('oauth_tokens')
      .select('id')
      .eq('user_id', user.id)
      .in('provider', ['google', 'azure'])
      .limit(1)
      .maybeSingle();

    // Check if user has authenticated via desktop app (app_downloaded indicator)
    const { data: desktopAuthEvent } = await supabase
      .from('user_event_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('event_name', 'desktop_auth')
      .limit(1)
      .maybeSingle();

    // Calculate trial days remaining if user is in trial
    const trialDaysRemaining =
      subscription?.status === 'trialing'
        ? calculateTrialDaysRemaining(subscription.trial_end)
        : null;

    // Create JWT payload with user data and custom attributes
    const payload: IntercomJWTPayload = {
      user_id: user.id,
      email: user.email,
      name: userProfile?.full_name ?? undefined,
      // Custom attributes (non-sensitive, can be in JWT)
      app_downloaded: !!desktopAuthEvent,
      calendar_connected: !!oauthTokens,
      meetings_count: meetingsCount || 0,
      first_meeting_analyzed_at: firstMeetingAnalysis?.created_at ?? null,
      plan: subscription?.status === 'active' ? 'pro' : 'free',
      // Trial attributes for onboarding email sequences
      trial_end_date: subscription?.trial_end ?? undefined,
      trial_days_remaining: trialDaysRemaining ?? undefined,
      is_trialing: subscription?.status === 'trialing',
    };

    // Sign JWT with 1 hour expiration
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });

    // Return JWT token
    return NextResponse.json(
      {
        success: true,
        token,
      },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          ...getRateLimitHeaders({
            key: user.id,
            maxRequests: 60,
            windowMs: 5 * 60 * 1000,
          }),
        },
      }
    );
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      {
        success: errorResponse.success,
        error: errorResponse.error,
      },
      {
        status: errorResponse.statusCode,
        headers: corsHeaders,
      }
    );
  }
}
