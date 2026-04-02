import Intercom from '@intercom/messenger-js-sdk';

interface IntercomUser {
  user_id: string;
  email?: string;
  name?: string;
  created_at?: number;
  [key: string]: any; // For custom attributes
}

class IntercomMessenger {
  private initialized = false;
  private booted = false;

  /**
   * Initialize Intercom with configuration
   */
  init() {
    if (this.initialized) return;

    // Only run on client side
    if (typeof window === 'undefined') return;

    const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;

    if (!appId) {
      console.warn(
        'Intercom App ID not found. Messenger will be disabled. Set NEXT_PUBLIC_INTERCOM_APP_ID to enable.'
      );
      return;
    }

    try {
      // Initialize Intercom with hidden launcher (no chat widget, only tours/announcements)
      Intercom({
        app_id: appId,
        hide_default_launcher: true,
      });

      this.initialized = true;

      if (process.env.NODE_ENV === 'development') {
        console.log('[Intercom] Initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize Intercom:', error);
    }
  }

  /**
   * Check if Intercom is initialized
   */
  private isEnabled(): boolean {
    return this.initialized && typeof window !== 'undefined';
  }

  /**
   * Boot Intercom with user identification (legacy, without JWT)
   */
  boot(user: IntercomUser) {
    if (!this.isEnabled()) return;

    const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;
    if (!appId) return;

    try {
      Intercom({
        app_id: appId,
        hide_default_launcher: true,
        ...user,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[Intercom] User identified:', user.user_id);
      }
    } catch (error) {
      console.error('Failed to boot Intercom with user:', error);
    }
  }

  /**
   * Boot Intercom with JWT-based identity verification
   * This is the secure method that prevents user impersonation
   */
  bootWithJWT(token: string) {
    if (!this.isEnabled()) return;
    if (this.booted) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Intercom] Already booted, skipping duplicate boot');
      }
      return;
    }

    const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;
    if (!appId) return;

    try {
      Intercom({
        app_id: appId,
        hide_default_launcher: true,
        intercom_user_jwt: token,
        session_duration: 86400000, // 1 day (24 hours)
      });

      this.booted = true;

      if (process.env.NODE_ENV === 'development') {
        console.log('[Intercom] User identified with JWT (secure mode)');
      }
    } catch (error) {
      console.error('Failed to boot Intercom with JWT:', error);
    }
  }

  /**
   * Update user properties
   */
  update(properties?: Record<string, any>) {
    if (!this.isEnabled()) return;

    const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;
    if (!appId) return;

    try {
      // Call Intercom with updated properties
      Intercom({
        app_id: appId,
        hide_default_launcher: true,
        ...properties,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[Intercom] User properties updated:', properties);
      }
    } catch (error) {
      console.error('Failed to update Intercom:', error);
    }
  }

  /**
   * Shutdown Intercom (on logout)
   */
  shutdown() {
    if (!this.isEnabled()) return;

    try {
      // Re-initialize with just app_id to clear user data
      const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;
      if (appId) {
        Intercom({
          app_id: appId,
          hide_default_launcher: true,
        });
      }

      this.booted = false;

      if (process.env.NODE_ENV === 'development') {
        console.log('[Intercom] User session shutdown');
      }
    } catch (error) {
      console.error('Failed to shutdown Intercom:', error);
    }
  }
}

// Export singleton instance
export const intercom = new IntercomMessenger();
