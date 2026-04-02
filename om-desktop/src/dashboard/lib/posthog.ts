import posthog from 'posthog-js';

class PostHogAnalytics {
  private initialized = false;

  /**
   * Initialize PostHog with configuration
   */
  init() {
    if (this.initialized) return;

    // Only run on client side
    if (typeof window === 'undefined') return;

    const apiKey = import.meta.env.VITE_POSTHOG_KEY;
    const apiHost =
      import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

    if (!apiKey) {
      console.warn(
        'PostHog API key not found. Analytics will be disabled. Set VITE_POSTHOG_KEY to enable.'
      );
      return;
    }

    try {
      posthog.init(apiKey, {
        api_host: apiHost,
        person_profiles: 'identified_only', // Only create profiles for identified users
        capture_pageview: true, // Automatically capture page views
        capture_pageleave: true, // Capture when users leave pages
        loaded: (_posthog) => {
          if (import.meta.env.DEV) {
            console.log('[PostHog] Initialized successfully');
          }
        },
      });

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize PostHog:', error);
    }
  }

  /**
   * Check if PostHog is initialized
   */
  private isEnabled(): boolean {
    return this.initialized && typeof window !== 'undefined';
  }

  /**
   * Identify a user with their properties
   */
  identify(userId: string, properties?: Record<string, any>) {
    if (!this.isEnabled()) return;

    try {
      posthog.identify(userId, properties);
      if (import.meta.env.DEV) {
        console.log('[PostHog] User identified:', userId);
      }
    } catch (error) {
      console.error('Failed to identify user:', error);
    }
  }

  /**
   * Track an event
   */
  capture(eventName: string, properties?: Record<string, any>) {
    if (!this.isEnabled()) return;

    try {
      posthog.capture(eventName, properties);
      if (import.meta.env.DEV) {
        console.log('[PostHog] Event captured:', eventName, properties);
      }
    } catch (error) {
      console.error('Failed to capture event:', error);
    }
  }

  /**
   * Reset analytics on logout
   */
  reset() {
    if (!this.isEnabled()) return;

    try {
      posthog.reset();
      if (import.meta.env.DEV) {
        console.log('[PostHog] User session reset');
      }
    } catch (error) {
      console.error('Failed to reset PostHog:', error);
    }
  }

  /**
   * Set person properties for the current user
   */
  setPersonProperties(properties: Record<string, any>) {
    if (!this.isEnabled()) return;

    try {
      posthog.setPersonProperties(properties);
    } catch (error) {
      console.error('Failed to set person properties:', error);
    }
  }

  /**
   * Get the PostHog instance (for advanced usage)
   */
  getInstance() {
    return posthog;
  }
}

// Export singleton instance
export const analytics = new PostHogAnalytics();
