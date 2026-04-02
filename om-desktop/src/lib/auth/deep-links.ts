/**
 * Deep Link Handler - Handles om:// protocol for authentication
 *
 * Supported routes:
 * - om://auth/magiclink?token=xxx&email=yyy - Magic link from web
 *
 * Note: Legacy flows (om://auth/callback, om://auth/success) have been removed.
 * All auth now goes through the magic link flow which creates independent sessions.
 */

import { Notification, shell } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { authService } from './service';
import { config } from '../config';
import type { MenuBarService } from '../../services/menu-bar';

/**
 * Handle incoming deep link URL
 */
export async function handleDeepLink(
  url: string,
  menuBarService: MenuBarService | null
): Promise<void> {
  console.log('[DeepLink] Received:', url);

  Sentry.addBreadcrumb({
    category: 'deep_link',
    message: 'Deep link received',
    level: 'info',
    data: { url: url.split('?')[0] }, // Log route without params
  });

  try {
    const urlObj = new URL(url);
    const route = `${urlObj.host}${urlObj.pathname}`;

    switch (route) {
      case 'auth/magiclink':
        await handleMagicLink(urlObj, menuBarService);
        break;

      default:
        console.warn('[DeepLink] Unknown route:', route);
        Sentry.addBreadcrumb({
          category: 'deep_link',
          message: 'Unknown deep link route',
          level: 'warning',
          data: { route },
        });
    }
  } catch (error) {
    console.error('[DeepLink] Error handling deep link:', error);

    Sentry.captureException(error, {
      tags: { component: 'deep_link' },
    });

    showErrorNotification('Authentication failed. Please try again.');
  }
}

/**
 * Handle magic link authentication
 * URL format: om://auth/magiclink?token=xxx&email=yyy
 */
async function handleMagicLink(
  url: URL,
  menuBarService: MenuBarService | null
): Promise<void> {
  // Support both query params and hash params (for flexibility)
  const queryParams = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.substring(1));

  const token = queryParams.get('token') || hashParams.get('token');
  const email = queryParams.get('email') || hashParams.get('email');

  if (!token) {
    console.error('[DeepLink] Magic link missing token');
    showErrorNotification('Invalid authentication link.');
    return;
  }

  console.log('[DeepLink] Verifying magic link for:', email || 'unknown');

  const result = await authService.verifyMagicLink(token);

  if (result.success) {
    console.log('[DeepLink] Magic link verified successfully');

    // Update menu bar state
    if (menuBarService) {
      await menuBarService.updateAuthState();
    }

    // Show success notification
    showSuccessNotification(email || 'User');

    // Open dashboard in browser
    if (menuBarService) {
      await menuBarService.openDashboard();
    } else {
      await shell.openExternal(`${config.webApp.url}/dashboard`);
    }

    Sentry.addBreadcrumb({
      category: 'deep_link',
      message: 'Magic link auth successful',
      level: 'info',
    });
  } else {
    console.error('[DeepLink] Magic link verification failed:', result.error);
    showErrorNotification(
      result.error || 'Authentication failed. Please try again.'
    );
  }
}

/**
 * Show success notification
 */
function showSuccessNotification(email: string): void {
  const notification = new Notification({
    title: 'Signed In',
    body: `Welcome, ${email}`,
    silent: true,
  });
  notification.show();
}

/**
 * Show error notification
 */
function showErrorNotification(message: string): void {
  const notification = new Notification({
    title: 'Sign In Failed',
    body: message,
    silent: false,
  });
  notification.show();
}
