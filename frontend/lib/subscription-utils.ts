import type { SubscriptionResponse } from './api/subscriptions';

/**
 * Format a date string for display in subscription UI
 * Converts ISO date string to localized format: "January 15, 2024"
 */
export function formatSubscriptionDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a date range for billing period display
 * Example: "January 1, 2024 - January 31, 2024"
 */
export function formatPeriodRange(start: string, end: string): string {
  return `${formatSubscriptionDate(start)} - ${formatSubscriptionDate(end)}`;
}

/**
 * Calculate days remaining until a specific date
 * Returns null if date is in the past or invalid
 */
export function getDaysRemaining(endDate: string): number | null {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) {
    return null; // Date has passed
  }

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days remaining in trial period
 * Used specifically for trial subscriptions
 */
export function getTrialDaysRemaining(
  subscription: NonNullable<SubscriptionResponse['subscription']>
): number | null {
  if (subscription.status !== 'trialing' || !subscription.trialEnd) {
    return null;
  }

  return getDaysRemaining(subscription.trialEnd);
}

/**
 * Check if subscription is in trial period
 */
export function isInTrialPeriod(
  subscription: NonNullable<SubscriptionResponse['subscription']>
): boolean {
  return subscription.status === 'trialing';
}

/**
 * Check if subscription is canceled but still active (until period end)
 */
export function isCanceledButActive(
  subscription: NonNullable<SubscriptionResponse['subscription']>
): boolean {
  return subscription.cancelAtPeriodEnd === true;
}

/**
 * Check if subscription is active (either trialing or active status)
 */
export function isSubscriptionActive(
  subscription: NonNullable<SubscriptionResponse['subscription']>
): boolean {
  return subscription.status === 'active' || subscription.status === 'trialing';
}

/**
 * Get the next renewal date from subscription
 */
export function getNextRenewalDate(
  subscription: NonNullable<SubscriptionResponse['subscription']>
): string {
  return subscription.currentPeriodEnd;
}

/**
 * Format the next renewal date with amount
 * Example: "$29.99 on January 31, 2024"
 */
export function formatNextRenewal(
  amountCents: number,
  renewalDate: string
): string {
  const amount = (amountCents / 100).toFixed(2);
  const date = formatSubscriptionDate(renewalDate);
  return `$${amount} on ${date}`;
}

/**
 * Check if user is on a free account (100% discount)
 * A true free account has a permanent 100% discount, not just a $0 upcoming charge
 */
export function isFreeAccount(
  subscription: NonNullable<SubscriptionResponse['subscription']>
): boolean {
  // Check if discount is 100% off and permanent (not scheduled changes)
  const hasFullDiscount =
    subscription.discount?.percentOff === 100 &&
    subscription.discount?.duration === 'forever';

  // Also check if upcoming invoice is $0 with no subscription amount
  // (meaning they'll never be charged, not just "no charge right now")
  const willNeverBeCharged =
    subscription.upcomingInvoice?.amountDue === 0 &&
    (subscription.upcomingInvoice?.subscriptionAmount ?? 0) === 0;

  return hasFullDiscount || willNeverBeCharged;
}
