/**
 * Auth IPC Handlers - Clean interface between renderer and AuthService
 *
 * This is a thin layer that exposes auth functionality to the renderer process.
 * All business logic is in the AuthService.
 */

import { ipcMain, shell, BrowserWindow } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { authService } from '../lib/auth/service';
import { config } from '../lib/config';
import type { MenuBarService } from '../services/menu-bar';

// Store reference to menu bar service for auth state updates
let menuBarServiceRef: MenuBarService | null = null;

// Track whether handlers have been registered (ipcMain.handle doesn't have listenerCount)
let handlersRegistered = false;

/**
 * Register all auth-related IPC handlers
 * @param menuBarService - Menu bar service for updating auth state in menu
 */
export function registerAuthHandlers(
  menuBarService: MenuBarService | null
): void {
  menuBarServiceRef = menuBarService;

  // If handlers already registered, just update the reference
  if (handlersRegistered) {
    console.log(
      '[Auth IPC] Handlers already registered, updating menu bar ref'
    );
    return;
  }

  console.log('[Auth IPC] Registering handlers');

  // ==================== Core Auth Methods ====================

  /**
   * Get current user
   * Returns User object or null if not authenticated
   */
  ipcMain.handle('auth:get-current-user', async () => {
    return authService.getUser();
  });

  /**
   * Get current session
   * Returns Session object or null if not authenticated
   */
  ipcMain.handle('auth:get-session', async () => {
    return authService.getSession();
  });

  /**
   * Get auth state
   * Returns: 'loading' | 'authenticated' | 'unauthenticated'
   */
  ipcMain.handle('auth:getState', async () => {
    return authService.getState();
  });

  /**
   * Check if user is authenticated
   * Returns boolean
   */
  ipcMain.handle('auth:is-authenticated', async () => {
    return authService.getState() === 'authenticated';
  });

  // ==================== Auth Actions ====================

  /**
   * Sign out (local only - doesn't affect web session)
   */
  ipcMain.handle('auth:sign-out', async () => {
    await authService.signOut();

    // Update menu bar state
    if (menuBarServiceRef) {
      await menuBarServiceRef.updateAuthState();
    }

    return { success: true };
  });

  /**
   * Open sign in page in system browser
   * Auth completes via deep link (om://auth/magiclink)
   */
  ipcMain.handle('auth:open-sign-in', async () => {
    const url = `${config.webApp.url}/login?source=desktop`;
    console.log('[Auth IPC] Opening sign in page:', url);
    await shell.openExternal(url);
    return { success: true };
  });

  /**
   * Open dashboard in system browser
   * Uses magic link for seamless auth if user is authenticated
   */
  ipcMain.handle('auth:open-dashboard', async () => {
    if (menuBarServiceRef) {
      await menuBarServiceRef.openDashboard();
      return { success: true };
    }

    // Fallback: just open dashboard URL
    await shell.openExternal(`${config.webApp.url}/dashboard`);
    return { success: true };
  });

  // ==================== Session Management ====================

  /**
   * Refresh session
   * Note: With the new architecture, Supabase handles refresh automatically.
   * This is kept for backward compatibility but delegates to getSession().
   */
  ipcMain.handle('auth:refresh-session', async () => {
    // getSession() will auto-refresh if needed via Supabase's built-in logic
    const session = await authService.getSession();
    return {
      success: !!session,
      session,
      user: session?.user || null,
    };
  });

  /**
   * Initialize auth (for manual initialization from renderer)
   * Note: Auth is auto-initialized on app start. This is for recovery scenarios.
   */
  ipcMain.handle('auth:initialize', async () => {
    try {
      await authService.initialize();
      return {
        success: true,
        state: authService.getState(),
        user: authService.getUser(),
      };
    } catch (error) {
      console.error('[Auth IPC] Initialize failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Wait for auth to be ready
   * Returns when auth state is no longer 'loading'
   */
  ipcMain.handle('auth:waitForReady', async (_event, timeoutMs = 10000) => {
    const startTime = Date.now();

    while (authService.getState() === 'loading') {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Auth timeout: still loading after ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      state: authService.getState(),
      user: authService.getUser(),
    };
  });

  /**
   * Manual refresh (alias for auth:refresh-session)
   */
  ipcMain.handle('auth:refresh', async () => {
    const session = await authService.getSession();
    return {
      success: !!session,
      session,
      user: session?.user || null,
    };
  });

  // ==================== Subscription Check ====================

  /**
   * Check if user has active subscription
   */
  ipcMain.handle('check-subscription', async () => {
    try {
      const user = authService.getUser();
      if (!user) {
        return false;
      }

      const supabase = authService.getClient();
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[Auth IPC] Error checking subscription:', error);
        return false;
      }

      const activeStatuses = ['active', 'trialing'];
      return data && activeStatuses.includes(data.status);
    } catch (error) {
      console.error('[Auth IPC] Exception checking subscription:', error);
      return false;
    }
  });

  handlersRegistered = true;
  console.log('[Auth IPC] Handlers registered');
}

/**
 * Set up auth state change notifications to renderer
 * Call this after creating the main window
 */
export function setupAuthStateNotifications(
  webContents: Electron.WebContents
): void {
  authService.onStateChange((event) => {
    console.log('[Auth IPC] Sending state change to renderer:', event.state);
    webContents.send('auth:state-changed', event);
  });
}

/**
 * Update menu bar service reference
 * Called when menu bar service is initialized after handlers
 */
export function updateMenuBarService(menuBarService: MenuBarService): void {
  menuBarServiceRef = menuBarService;
}
