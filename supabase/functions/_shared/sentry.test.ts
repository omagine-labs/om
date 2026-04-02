/**
 * Unit tests for shared Sentry initialization module
 */

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { initSentry } from './sentry.ts';

// Test: Development mode skips initialization
Deno.test('initSentry: skips initialization in development mode', () => {
  // Save original env vars
  const originalDsn = Deno.env.get('SENTRY_DSN');
  const originalEnv = Deno.env.get('SENTRY_ENVIRONMENT');

  // Set development environment
  Deno.env.set('SENTRY_DSN', 'https://fake@sentry.io/123');
  Deno.env.set('SENTRY_ENVIRONMENT', 'development');

  const result = initSentry('test-function');

  // Should return false (Sentry disabled)
  assertEquals(result, false);

  // Restore original env vars
  if (originalDsn) Deno.env.set('SENTRY_DSN', originalDsn);
  else Deno.env.delete('SENTRY_DSN');
  if (originalEnv) Deno.env.set('SENTRY_ENVIRONMENT', originalEnv);
  else Deno.env.delete('SENTRY_ENVIRONMENT');
});

// Test: Missing DSN skips initialization
Deno.test('initSentry: skips initialization when SENTRY_DSN is missing', () => {
  // Save original env vars
  const originalDsn = Deno.env.get('SENTRY_DSN');
  const originalEnv = Deno.env.get('SENTRY_ENVIRONMENT');

  // Remove DSN
  Deno.env.delete('SENTRY_DSN');
  Deno.env.set('SENTRY_ENVIRONMENT', 'production');

  const result = initSentry('test-function');

  // Should return false (no DSN)
  assertEquals(result, false);

  // Restore original env vars
  if (originalDsn) Deno.env.set('SENTRY_DSN', originalDsn);
  if (originalEnv) Deno.env.set('SENTRY_ENVIRONMENT', originalEnv);
  else Deno.env.delete('SENTRY_ENVIRONMENT');
});

// Test: Function name is passed correctly
Deno.test('initSentry: accepts function name parameter', () => {
  // Save original env vars
  const originalDsn = Deno.env.get('SENTRY_DSN');
  const originalEnv = Deno.env.get('SENTRY_ENVIRONMENT');

  // Set valid environment
  Deno.env.set('SENTRY_DSN', 'https://fake@sentry.io/123');
  Deno.env.set('SENTRY_ENVIRONMENT', 'production');

  // Should not throw error with valid function name
  try {
    initSentry('test-function');
    // If we reach here without error, test passes
    assertEquals(true, true);
  } catch {
    // Should not throw
    assertEquals(
      false,
      true,
      'initSentry should not throw with valid parameters'
    );
  }

  // Restore original env vars
  if (originalDsn) Deno.env.set('SENTRY_DSN', originalDsn);
  else Deno.env.delete('SENTRY_DSN');
  if (originalEnv) Deno.env.set('SENTRY_ENVIRONMENT', originalEnv);
  else Deno.env.delete('SENTRY_ENVIRONMENT');
});
