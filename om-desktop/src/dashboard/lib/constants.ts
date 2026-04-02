/**
 * Authentication polling interval in milliseconds
 * Used to check for auth state changes (sign-in/sign-out) across windows
 * Set to 30 seconds since we also check on window focus events
 */
export const AUTH_POLL_INTERVAL_MS = 30000;
