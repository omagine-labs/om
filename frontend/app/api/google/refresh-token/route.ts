import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import { withValidation } from '../../_middleware/validation';

/**
 * Server-side API route to refresh Google OAuth tokens
 * This keeps the client secret secure on the server
 */
async function handleRefresh(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Fetch stored OAuth tokens from database
    // Use maybeSingle() to avoid 406 error when no token exists
    const { data: tokenData, error: fetchError } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .maybeSingle();

    if (fetchError || !tokenData || !tokenData.refresh_token) {
      console.error('No refresh token found:', fetchError);
      return NextResponse.json(
        { error: 'No refresh token available' },
        { status: 404 }
      );
    }

    // Refresh the token with Google
    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.json().catch(() => ({}));
      console.error('Failed to refresh Google token:', errorData);
      return NextResponse.json(
        { error: 'Failed to refresh token' },
        { status: 500 }
      );
    }

    const refreshData = await refreshResponse.json();

    // Update token in database
    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshData.expires_in);

    // Google may return a new refresh token during rotation
    const updateData: {
      access_token: string;
      expires_at: string;
      refresh_token?: string;
    } = {
      access_token: refreshData.access_token,
      expires_at: newExpiresAt.toISOString(),
    };

    // Only update refresh token if Google provided a new one
    if (refreshData.refresh_token) {
      updateData.refresh_token = refreshData.refresh_token;
    }

    const { error: updateError } = await supabase
      .from('oauth_tokens')
      .update(updateData)
      .eq('user_id', user.id)
      .eq('provider', 'google');

    if (updateError) {
      console.error('Error updating token in database:', updateError);
      return NextResponse.json(
        { error: 'Failed to update token' },
        { status: 500 }
      );
    }

    // Return the new access token
    return NextResponse.json({
      access_token: refreshData.access_token,
      expires_at: newExpiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export POST handler with validation middleware and rate limiting
// OAuth token refresh should be infrequent (once per hour typically)
// Allow 10 requests per 5 minutes to prevent abuse
export const POST = withValidation(handleRefresh, {
  rateLimit: {
    maxRequests: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
  },
});
