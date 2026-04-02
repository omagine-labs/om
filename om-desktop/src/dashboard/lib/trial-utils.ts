/**
 * Trial calculation utilities
 * Provides consistent trial days remaining calculation across the application
 */

/**
 * Calculate the number of days remaining in a trial period
 *
 * @param trialEnd - Trial end date (ISO string or Unix timestamp in seconds)
 * @returns Number of days remaining (rounded up), or null if trialEnd is not provided or trial has ended
 *
 * @example
 * // With ISO string - trial in future
 * calculateTrialDaysRemaining('2025-11-15T00:00:00Z') // => 10
 *
 * @example
 * // With Unix timestamp (seconds)
 * calculateTrialDaysRemaining(1731628800) // => 10
 *
 * @example
 * // Trial ended in the past
 * calculateTrialDaysRemaining('2025-01-01T00:00:00Z') // => null
 */
export function calculateTrialDaysRemaining(
  trialEnd: string | number | null | undefined
): number | null {
  if (!trialEnd) {
    return null;
  }

  // Convert to Date object
  let trialEndDate: Date;

  if (typeof trialEnd === 'number') {
    // Unix timestamp in seconds
    trialEndDate = new Date(trialEnd * 1000);
  } else {
    // ISO string
    trialEndDate = new Date(trialEnd);
  }

  // Calculate days remaining
  const now = new Date();
  const msRemaining = trialEndDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  // Return null if trial has already ended (prevents negative days)
  // Use || 0 to convert -0 to 0 (JavaScript quirk)
  return daysRemaining >= 0 ? daysRemaining || 0 : null;
}
