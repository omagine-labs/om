import { authService } from './auth';
import { getAppVersion } from '../utils/version';
import * as Sentry from '@sentry/electron/main';

/**
 * Update the user's app_version in the database
 * Called after successful authentication to track which version the user is running
 */
export async function updateUserAppVersion(userId: string): Promise<void> {
  try {
    const appVersion = getAppVersion();
    const supabase = authService.getClient();

    console.log(
      `[AppVersion] Updating user ${userId} to app version ${appVersion}`
    );

    const { error } = await supabase
      .from('users')
      .update({ app_version: appVersion })
      .eq('id', userId);

    if (error) {
      console.error('[AppVersion] Error updating app version:', error);
      // Don't throw - this is non-critical
      Sentry.captureMessage('Failed to update user app version', {
        level: 'warning',
        tags: {
          component: 'app_version',
          operation: 'update',
        },
        extra: {
          error: error.message,
          userId,
          appVersion,
        },
      });
    } else {
      console.log('[AppVersion] Successfully updated app version');
      Sentry.addBreadcrumb({
        category: 'app_version',
        message: 'App version updated',
        level: 'info',
        data: {
          userId,
          appVersion,
        },
      });
    }
  } catch (error) {
    console.error('[AppVersion] Exception updating app version:', error);
    // Don't throw - this is non-critical
    Sentry.captureException(error, {
      tags: {
        component: 'app_version',
        operation: 'update',
      },
      extra: {
        userId,
      },
    });
  }
}
