/**
 * AuthService - Single source of truth for authentication
 *
 * Uses Supabase's built-in:
 * - onAuthStateChange for state tracking
 * - startAutoRefresh/stopAutoRefresh for token refresh (Electron pattern)
 * - Session management
 *
 * This replaces the previous over-engineered auth system with:
 * - No custom state machine
 * - No custom health checker
 * - No manual refresh logic
 */

import {
  createClient,
  SupabaseClient,
  Session,
  User,
  AuthChangeEvent,
} from '@supabase/supabase-js';
import { app, powerMonitor, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import * as Sentry from '@sentry/electron/main';
import { config } from '../config';
import { sessionPersistence } from './persistence';
import { updateUserAppVersion } from '../update-app-version';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthStateChangeEvent {
  state: AuthState;
  user: User | null;
}

class AuthService extends EventEmitter {
  private supabase: SupabaseClient;
  private currentState: AuthState = 'loading';
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private initialized = false;

  constructor() {
    super();

    // Create Supabase client with Electron-appropriate settings
    this.supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // We handle persistence ourselves for "Remember me"
        detectSessionInUrl: false, // We handle deep links ourselves
      },
    });
  }

  /**
   * Initialize the auth service
   * Must be called once after app is ready
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[Auth] Already initialized');
      return;
    }
    this.initialized = true;
    console.log('[Auth] Initializing...');

    // Set up auth state listener FIRST (before restoring session)
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.handleAuthChange(event, session);
    });

    // Set up focus-based refresh (Supabase's recommended pattern for Electron)
    this.setupFocusBasedRefresh();

    // Try to restore session from persistence
    await this.restoreSession();

    console.log('[Auth] Initialization complete, state:', this.currentState);
  }

  /**
   * Set up focus-based auto-refresh
   * Supabase docs: "In non-browser environments like Electron, use startAutoRefresh()
   * when app is active, stopAutoRefresh() when backgrounded."
   */
  private setupFocusBasedRefresh(): void {
    // Start refresh when any window gains focus
    app.on('browser-window-focus', () => {
      if (this.currentState === 'authenticated') {
        console.log('[Auth] Window focused, starting auto-refresh');
        this.supabase.auth.startAutoRefresh();
      }
    });

    // Stop refresh when all windows lose focus
    app.on('browser-window-blur', () => {
      // Only stop if no windows are focused
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        console.log('[Auth] All windows blurred, stopping auto-refresh');
        this.supabase.auth.stopAutoRefresh();
      }
    });

    // Handle system sleep/wake
    powerMonitor.on('suspend', () => {
      console.log('[Auth] System suspending, stopping auto-refresh');
      this.supabase.auth.stopAutoRefresh();
    });

    powerMonitor.on('resume', async () => {
      console.log('[Auth] System resuming');
      if (this.currentState === 'authenticated') {
        // Verify session is still valid after wake
        const {
          data: { session },
          error,
        } = await this.supabase.auth.getSession();

        if (error) {
          console.error('[Auth] Error getting session after wake:', error);
          Sentry.captureMessage('Auth error after system wake', {
            level: 'warning',
            extra: { error: error.message },
          });
          return;
        }

        if (session) {
          console.log('[Auth] Session valid after wake, starting auto-refresh');
          this.supabase.auth.startAutoRefresh();
        } else {
          console.log('[Auth] No session after wake');
          this.setState('unauthenticated', null, null);
        }
      }
    });
  }

  /**
   * Restore session from persistent storage
   */
  private async restoreSession(): Promise<void> {
    const savedSession = sessionPersistence.load();

    if (!savedSession) {
      console.log('[Auth] No saved session to restore');
      this.setState('unauthenticated', null, null);
      return;
    }

    console.log('[Auth] Restoring saved session...');

    const { data, error } = await this.supabase.auth.setSession({
      access_token: savedSession.access_token,
      refresh_token: savedSession.refresh_token,
    });

    if (error) {
      console.error('[Auth] Failed to restore session:', error);
      sessionPersistence.clear();
      this.setState('unauthenticated', null, null);

      // Only log unexpected errors to Sentry (not expected ones like expired tokens)
      if (!error.message?.includes('expired')) {
        Sentry.captureMessage('Auth session restore failed', {
          level: 'warning',
          extra: { error: error.message },
        });
      }
      return;
    }

    // onAuthStateChange will handle updating state
    console.log('[Auth] Session restore initiated');
  }

  /**
   * Handle auth state changes from Supabase
   */
  private handleAuthChange(
    event: AuthChangeEvent,
    session: Session | null
  ): void {
    console.log(
      '[Auth] Auth event:',
      event,
      session ? 'with session' : 'no session'
    );

    // Add Sentry breadcrumb for debugging
    Sentry.addBreadcrumb({
      category: 'auth',
      message: `Auth event: ${event}`,
      level: 'info',
      data: {
        hasSession: !!session,
        hasUser: !!session?.user,
      },
    });

    if (session?.user) {
      this.setState('authenticated', session.user, session);

      // Persist session if "Remember me" is enabled
      if (sessionPersistence.isRememberMeEnabled()) {
        sessionPersistence.save(session);
      }

      // Start auto-refresh when authenticated
      this.supabase.auth.startAutoRefresh();

      // Update app version in database (non-blocking)
      updateUserAppVersion(session.user.id).catch((err) =>
        console.error('[Auth] Failed to update app version:', err)
      );
    } else {
      this.setState('unauthenticated', null, null);
      sessionPersistence.clear();
      this.supabase.auth.stopAutoRefresh();
    }
  }

  /**
   * Update internal state and emit change event
   */
  private setState(
    state: AuthState,
    user: User | null,
    session: Session | null
  ): void {
    const changed =
      this.currentState !== state || this.currentUser?.id !== user?.id;

    this.currentState = state;
    this.currentUser = user;
    this.currentSession = session;

    if (changed) {
      console.log('[Auth] State changed to:', state, user?.email || 'no user');
      this.emit('state-change', { state, user } as AuthStateChangeEvent);
    }
  }

  // ==================== Public API ====================

  /**
   * Get current auth state
   */
  getState(): AuthState {
    return this.currentState;
  }

  /**
   * Get current user (null if not authenticated)
   */
  getUser(): User | null {
    return this.currentUser;
  }

  /**
   * Get current session (null if not authenticated)
   */
  async getSession(): Promise<Session | null> {
    // Get fresh session from Supabase (will auto-refresh if needed)
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    return session;
  }

  /**
   * Get Supabase client for direct API calls
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Sign out (local only - doesn't affect web session)
   */
  async signOut(): Promise<void> {
    console.log('[Auth] Signing out');
    await this.supabase.auth.signOut({ scope: 'local' });
    // onAuthStateChange will handle state update
  }

  /**
   * Verify a magic link token (for deep link auth)
   * Waits for auth state to be fully established before returning
   */
  async verifyMagicLink(
    tokenHash: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[Auth] Verifying magic link');

    const { data, error } = await this.supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });

    if (error) {
      console.error('[Auth] Magic link verification failed:', error);
      Sentry.captureMessage('Magic link verification failed', {
        level: 'warning',
        extra: { error: error.message },
      });
      return { success: false, error: error.message };
    }

    // verifyOtp returns the session - use it to update state immediately
    // This prevents race condition where onAuthStateChange fires async
    if (data.session && data.user) {
      console.log('[Auth] Magic link verified, setting state from response');
      this.setState('authenticated', data.user, data.session);

      // Persist session if "Remember me" is enabled
      if (sessionPersistence.isRememberMeEnabled()) {
        sessionPersistence.save(data.session);
      }

      // Start auto-refresh
      this.supabase.auth.startAutoRefresh();

      // Update app version in database (non-blocking)
      updateUserAppVersion(data.user.id).catch((err) =>
        console.error('[Auth] Failed to update app version:', err)
      );
    } else {
      console.warn('[Auth] Magic link verified but no session returned');
    }

    console.log('[Auth] Magic link verified, user:', data.user?.email);
    return { success: true };
  }

  /**
   * Subscribe to auth state changes
   */
  onStateChange(callback: (event: AuthStateChangeEvent) => void): () => void {
    this.on('state-change', callback);
    return () => this.off('state-change', callback);
  }
}

// Export singleton instance
export const authService = new AuthService();
