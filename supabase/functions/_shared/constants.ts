/**
 * Shared constants for anonymous upload Edge Functions
 */

// Monthly cap for anonymous uploads (across all users)
export const MONTHLY_UPLOAD_CAP = 500;

// CORS allowed origins for marketing website and local development
export const ALLOWED_ORIGINS = [
  'https://omaginelabs.com',
  'https://www.omaginelabs.com',
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev server
];

// Guest user ID for anonymous uploads (links to special guest user in auth.users)
export const GUEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// Rate limiting configuration
export const RATE_LIMIT_WINDOW_HOURS = 1; // Time window for IP-based rate limiting
export const RATE_LIMIT_MAX_UPLOADS_PER_IP = 5; // Max uploads per IP within time window
export const RATE_LIMIT_ABUSE_THRESHOLD = 10; // Multiple emails from same IP within window

// File fingerprinting configuration
export const FILE_HASH_SAMPLE_SIZE = 1024 * 1024; // 1MB sample for hash computation

/**
 * Get the allowed origin for CORS headers based on request origin
 */
export function getAllowedOrigin(origin: string | null): string {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0]; // Default to production
}

/**
 * Generate CORS headers for a given request origin
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}
