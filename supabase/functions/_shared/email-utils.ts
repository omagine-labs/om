/**
 * Email normalization utilities
 * Used to prevent duplicate accounts via email manipulation
 */

/**
 * Normalize email to prevent duplicate accounts
 * - Converts to lowercase
 * - Removes +suffix (e.g., user+test@gmail.com → user@gmail.com)
 * - Removes dots for Gmail (user.name@gmail.com → username@gmail.com)
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split('@');

  if (!local || !domain) {
    throw new Error('Invalid email format');
  }

  // Remove +suffix
  const baseLocal = local.split('+')[0];

  // Remove dots for Gmail
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const normalizedLocal = baseLocal.replace(/\./g, '');
    return `${normalizedLocal}@${domain}`;
  }

  return `${baseLocal}@${domain}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
