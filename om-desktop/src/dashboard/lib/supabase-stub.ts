/**
 * Stub file for server-only modules
 * These should never be called in the browser/Electron renderer
 */

export function createServerSupabaseClient(): never {
  throw new Error(
    'createServerSupabaseClient cannot be called in browser context'
  );
}

export function createServiceRoleClient(): never {
  throw new Error(
    'createServiceRoleClient cannot be called in browser context'
  );
}

export async function getCurrentUser(): Promise<never> {
  throw new Error(
    'Server-side getCurrentUser cannot be called in browser context'
  );
}

export async function requireAuth(): Promise<never> {
  throw new Error(
    'Server-side requireAuth cannot be called in browser context'
  );
}

export async function getActiveSubscription(): Promise<never> {
  throw new Error(
    'Server-side getActiveSubscription cannot be called in browser context'
  );
}

export async function requireActiveSubscription(): Promise<never> {
  throw new Error(
    'Server-side requireActiveSubscription cannot be called in browser context'
  );
}

export async function createBillingPortalSession(): Promise<never> {
  throw new Error(
    'Server-side createBillingPortalSession cannot be called in browser context'
  );
}

export async function createCheckoutSession(): Promise<never> {
  throw new Error(
    'Server-side createCheckoutSession cannot be called in browser context'
  );
}
