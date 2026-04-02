/**
 * Auth Module - Clean authentication for Electron
 *
 * Uses Supabase's built-in patterns:
 * - onAuthStateChange for state tracking
 * - startAutoRefresh/stopAutoRefresh for token refresh
 * - verifyOtp for magic link authentication
 */

export { authService } from './service';
export type { AuthState, AuthStateChangeEvent } from './service';
export { handleDeepLink } from './deep-links';
export { sessionPersistence } from './persistence';
