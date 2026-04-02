import { createClient } from './supabase';
import type { User } from '@supabase/supabase-js';
import {
  trackEvent,
  identifyUser,
  resetAnalytics,
  AcquisitionEvents,
  ActivationEvents,
} from './analytics';

/**
 * Sign up a new user with email and password
 * @param email - User's email address
 * @param password - User's password
 * @returns Object with user data or error
 */
export async function signUp(email: string, password: string) {
  const supabase = createClient();

  // Sign up with Supabase Auth
  // The user record is created automatically by a database trigger
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return { data: null, error: authError };
  }

  // Identify user and track signup event
  if (authData.user) {
    identifyUser(authData.user.id, {
      email: authData.user.email,
      created_at: authData.user.created_at,
    });

    trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, {
      method: 'email',
    });

    // Track signup source if UTM parameters were captured
    try {
      const utmDataStr = localStorage.getItem('signup_utm');
      if (utmDataStr) {
        const utmData = JSON.parse(utmDataStr);
        if (utmData.source) {
          trackEvent(AcquisitionEvents.SIGNUP_SOURCE, {
            source: utmData.source,
            campaign: utmData.campaign,
            medium: utmData.medium,
          });
        }
        // Clean up after tracking
        localStorage.removeItem('signup_utm');
      }
    } catch (error) {
      console.error('[Analytics] Failed to track signup source:', error);
      // Don't throw - analytics failures shouldn't break signup
    }
  }

  return { data: authData, error: null };
}

/**
 * Sign in a user with email and password
 * @param email - User's email address
 * @param password - User's password
 * @returns Object with user data or error
 */
export async function signIn(email: string, password: string) {
  const supabase = createClient();

  // Sign in with email and password
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { data: null, error };
  }

  // Identify user and track login event
  if (data.user) {
    // Fetch user profile for full identification
    const { data: userProfile } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', data.user.id)
      .single();

    identifyUser(data.user.id, {
      email: data.user.email,
      full_name: userProfile?.full_name,
      created_at: data.user.created_at,
    });

    trackEvent(ActivationEvents.USER_LOGGED_IN, {
      method: 'email',
    });
  }

  return { data, error: null };
}

/**
 * Sign out the current user
 * Uses 'local' scope to only sign out this session (not desktop app or other sessions)
 * @returns Object with error if any
 */
export async function signOut() {
  const supabase = createClient();

  // Use 'local' scope to only sign out this browser session
  // This allows desktop app to maintain its independent session
  const { error } = await supabase.auth.signOut({ scope: 'local' });

  // Reset analytics on successful logout
  if (!error) {
    resetAnalytics();
  }

  return { error };
}

/**
 * Sign in with Google OAuth
 * @param redirectTo Optional redirect URL after OAuth callback
 * @returns Object with error if any
 */
export async function signInWithGoogle(redirectTo?: string) {
  const supabase = createClient();

  // Track OAuth attempt
  trackEvent(AcquisitionEvents.OAUTH_LOGIN_ATTEMPT, {
    provider: 'google',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account', // Allow account selection; consent only on first auth
      },
      scopes:
        'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly',
    },
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * Sign in with Microsoft OAuth
 * @param redirectTo Optional redirect URL after OAuth callback
 * @returns Object with error if any
 */
export async function signInWithMicrosoft(redirectTo?: string) {
  const supabase = createClient();

  // Track OAuth attempt
  trackEvent(AcquisitionEvents.OAUTH_LOGIN_ATTEMPT, {
    provider: 'microsoft',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
      queryParams: {
        prompt: 'select_account', // Show account picker, consent only on first auth
      },
      scopes: 'User.Read email profile openid offline_access Calendars.Read',
    },
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * Get the current user (client-side)
 * @returns Current user or null
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
