/**
 * Application-wide constants
 */

/**
 * Guest User ID for anonymous speaker assignments
 *
 * Used when anonymous users assign themselves to speakers before creating an account.
 * This special UUID is used in the database to track anonymous assignments, which are
 * later transferred to the real user ID upon account creation.
 *
 * Referenced in:
 * - RLS policies (meeting_analysis table)
 * - Anonymous preview speaker assignment
 * - Account claiming logic
 */
export const GUEST_USER_ID = '00000000-0000-0000-0000-000000000001';
