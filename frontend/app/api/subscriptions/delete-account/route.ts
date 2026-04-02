import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { getStripeClient } from '@/lib/stripe';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/app/api/_middleware/rate-limit';
import {
  UnauthorizedError,
  StripeAPIError,
  formatErrorResponse,
} from '@/lib/errors';

interface DeleteAccountRequest {
  confirmationToken: string;
}

/**
 * DELETE /api/subscriptions/delete-account
 *
 * Permanently delete user account and all associated data
 * This is a destructive operation that cannot be undone
 *
 * Rate Limit: 3 requests per 10 minutes (very restrictive)
 *
 * Request Body:
 * - confirmationToken: Must be exactly "DELETE" to confirm deletion
 *
 * Steps:
 * 1. Cancel Stripe subscription immediately
 * 2. Delete Stripe customer
 * 3. Delete all user data from database (cascading deletes):
 *    - payment_history (CASCADE from subscriptions)
 *    - subscriptions
 *    - meeting_analysis (CASCADE from users)
 *    - processing_jobs (CASCADE from users)
 *    - oauth_tokens (CASCADE from users)
 *    - users
 *    - auth.users (Supabase Auth)
 *
 * Returns:
 * - 200: Account deleted successfully
 * - 400: Invalid confirmation token
 * - 401: User not authenticated
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createAuthenticatedSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError();
    }

    // Check rate limit (3 requests per 10 minutes - very restrictive)
    const rateLimitResponse = checkRateLimit({
      key: user.id,
      maxRequests: 3,
      windowMs: 10 * 60 * 1000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Parse request body
    let body: DeleteAccountRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invalid JSON in request body',
            code: 'INVALID_REQUEST',
          },
        },
        { status: 400 }
      );
    }

    const { confirmationToken } = body;

    // Validate confirmation token
    if (confirmationToken !== 'DELETE') {
      return NextResponse.json(
        {
          success: false,
          error: {
            message:
              'Invalid confirmation token. Must be exactly "DELETE" to confirm account deletion.',
            code: 'INVALID_CONFIRMATION',
          },
        },
        { status: 400 }
      );
    }

    // Log deletion for audit purposes
    console.log(
      `[ACCOUNT DELETION] User ${user.id} (${user.email}) initiated account deletion`
    );

    // Get subscription if exists
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    const stripe = getStripeClient();

    // Cancel Stripe subscription immediately if exists
    if (subscription?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
        console.log(
          `[ACCOUNT DELETION] Canceled subscription: ${subscription.stripe_subscription_id}`
        );
      } catch (error: any) {
        console.error('Failed to cancel Stripe subscription:', error);
        // Continue with deletion even if Stripe cancellation fails
      }
    }

    // Delete Stripe customer if exists
    if (subscription?.stripe_customer_id) {
      try {
        await stripe.customers.del(subscription.stripe_customer_id);
        console.log(
          `[ACCOUNT DELETION] Deleted Stripe customer: ${subscription.stripe_customer_id}`
        );
      } catch (error: any) {
        console.error('Failed to delete Stripe customer:', error);
        // Continue with deletion even if customer deletion fails
      }
    }

    // Delete user data from database
    // Foreign key CASCADE will handle related tables:
    // - payment_history (CASCADE from subscriptions)
    // - meetings (CASCADE from users) → processing_jobs (CASCADE from meetings)
    // - meeting_analysis (CASCADE from users)
    // - oauth_tokens (CASCADE from users)

    // Delete subscriptions (cascades to payment_history)
    const { error: subscriptionDeleteError } = await supabase
      .from('subscriptions')
      .delete()
      .eq('user_id', user.id);

    if (subscriptionDeleteError) {
      console.error('Failed to delete subscriptions:', subscriptionDeleteError);
      throw new Error('Failed to delete subscription data');
    }

    // Delete from users table (cascades to meetings, jobs, oauth, etc.)
    const { error: userDeleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', user.id);

    if (userDeleteError) {
      console.error('Failed to delete user:', userDeleteError);
      throw new Error('Failed to delete user data');
    }

    // Delete Supabase Auth user (final step)
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
      user.id
    );

    if (authDeleteError) {
      console.error('Failed to delete auth user:', authDeleteError);
      throw new Error('Failed to delete authentication account');
    }

    console.log(
      `[ACCOUNT DELETION] Successfully deleted account for user ${user.id}`
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Account and all data deleted successfully',
      },
      {
        status: 200,
        headers: getRateLimitHeaders({
          key: user.id,
          maxRequests: 3,
          windowMs: 10 * 60 * 1000,
        }),
      }
    );
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
