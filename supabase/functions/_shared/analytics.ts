/**
 * Analytics tracking utility for Supabase Edge Functions
 *
 * Logs events to the user_event_log table for monitoring and alerting.
 * For anonymous events, uses the GUEST_USER_ID.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GUEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Track an analytics event from an Edge Function.
 *
 * @param supabase - Supabase client instance
 * @param eventName - The event name (use monitoring event constants)
 * @param properties - Event properties
 * @param userId - Optional user ID (defaults to GUEST_USER_ID for anonymous events)
 */
export async function trackEvent(
  supabase: SupabaseClient,
  eventName: string,
  properties?: Record<string, unknown>,
  userId?: string
): Promise<void> {
  try {
    const { error } = await supabase.from('user_event_log').insert({
      user_id: userId || GUEST_USER_ID,
      event_name: eventName,
      payload: properties || null,
    });

    if (error) {
      console.error('[Analytics] Failed to log event:', error);
      // Don't throw - analytics failures shouldn't break functionality
    }
  } catch (error) {
    console.error('[Analytics] Error in trackEvent:', error);
    // Don't throw - analytics failures shouldn't break functionality
  }
}

/**
 * Hash an IP address for privacy-preserving analytics
 */
export async function hashIpAddress(ipAddress: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ipAddress + Deno.env.get('SUPABASE_JWT_SECRET'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

// Monitoring event constants (duplicated from frontend for Edge Function use)
export const MonitoringEvents = {
  ANON_UPLOAD_SUCCEEDED: 'anon_upload_succeeded',
  ANON_UPLOAD_FAILED: 'anon_upload_failed',
  ANON_UPLOAD_CAPACITY_WARNING: 'anon_upload_capacity_warning',
  ANON_UPLOAD_RATE_LIMITED: 'anon_upload_rate_limited',
  ANON_UPLOAD_FRAUD_DETECTED: 'anon_upload_fraud_detected',
  ANON_UPLOAD_IP_BLOCKED: 'anon_upload_ip_blocked',
} as const;
