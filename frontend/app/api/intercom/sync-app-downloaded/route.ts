import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { UnauthorizedError, formatErrorResponse } from '@/lib/errors';
import { updateIntercomUser } from '@/lib/intercom-api';

/**
 * POST /api/intercom/sync-app-downloaded
 *
 * Sync app_downloaded attribute to Intercom after desktop app authentication.
 * Called from client-side after desktop_auth event is tracked.
 *
 * Returns:
 * - 200: Success
 * - 401: User not authenticated
 * - 500: Internal server error
 */
export async function POST() {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError();
    }

    // Sync app_downloaded to Intercom for real-time targeting
    try {
      await updateIntercomUser(user.id, {
        app_downloaded: true,
      });
    } catch (err) {
      console.error('Error syncing app_downloaded to Intercom:', err);
      // Don't throw - Intercom failures shouldn't block the response
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      {
        success: errorResponse.success,
        error: errorResponse.error,
      },
      { status: errorResponse.statusCode }
    );
  }
}
