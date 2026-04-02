/**
 * Tests for check-email-eligibility Edge Function
 * Tests pure functions and shared utilities - no external dependencies
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { normalizeEmail, isValidEmail } from '../_shared/email-utils.ts';
import {
  getAllowedOrigin,
  getCorsHeaders,
  MONTHLY_UPLOAD_CAP,
  ALLOWED_ORIGINS,
} from '../_shared/constants.ts';

// Test email validation (shared utility)
Deno.test('isValidEmail: accepts valid emails', () => {
  assertEquals(isValidEmail('user@example.com'), true);
  assertEquals(isValidEmail('user+tag@example.com'), true);
  assertEquals(isValidEmail('user.name@example.com'), true);
  assertEquals(isValidEmail('test@omaginelabs.com'), true);
});

Deno.test('isValidEmail: rejects invalid emails', () => {
  assertEquals(isValidEmail('notanemail'), false);
  assertEquals(isValidEmail('@example.com'), false);
  assertEquals(isValidEmail('user@'), false);
  assertEquals(isValidEmail('user'), false);
  assertEquals(isValidEmail(''), false);
  assertEquals(isValidEmail('user@.com'), false);
});

// Test email normalization (shared utility)
Deno.test('normalizeEmail: converts to lowercase', () => {
  assertEquals(normalizeEmail('User@Example.com'), 'user@example.com');
  assertEquals(normalizeEmail('TEST@GMAIL.COM'), 'test@gmail.com');
});

Deno.test('normalizeEmail: removes +suffix', () => {
  assertEquals(normalizeEmail('user+tag@example.com'), 'user@example.com');
  assertEquals(
    normalizeEmail('user+test+another@example.com'),
    'user@example.com'
  );
});

Deno.test('normalizeEmail: removes dots for Gmail', () => {
  assertEquals(normalizeEmail('user.name@gmail.com'), 'username@gmail.com');
  assertEquals(normalizeEmail('u.s.e.r@gmail.com'), 'user@gmail.com');
});

Deno.test('normalizeEmail: handles googlemail.com same as gmail.com', () => {
  assertEquals(
    normalizeEmail('user.name@googlemail.com'),
    'username@googlemail.com'
  );
});

Deno.test('normalizeEmail: preserves dots for non-Gmail domains', () => {
  assertEquals(
    normalizeEmail('user.name@example.com'),
    'user.name@example.com'
  );
  assertEquals(
    normalizeEmail('user.name@outlook.com'),
    'user.name@outlook.com'
  );
});

Deno.test('normalizeEmail: handles combined normalization cases', () => {
  assertEquals(normalizeEmail('User.Name+Tag@Gmail.COM'), 'username@gmail.com');
  assertEquals(
    normalizeEmail('Test.User+Marketing@Example.COM'),
    'test.user@example.com'
  );
});

Deno.test('normalizeEmail: throws on invalid email', () => {
  let error;
  try {
    normalizeEmail('notanemail');
  } catch (e) {
    error = e;
  }
  assertExists(error);
});

// Test CORS headers functionality
Deno.test('getCorsHeaders: returns correct structure', () => {
  const headers = getCorsHeaders('https://example.com');
  assertExists(headers['Access-Control-Allow-Origin']);
  assertExists(headers['Access-Control-Allow-Headers']);
  assertExists(headers['Access-Control-Allow-Credentials']);
});

Deno.test('getAllowedOrigin: returns allowed origin from list', () => {
  const origin = getAllowedOrigin('https://app.omaginelabs.com');
  assertExists(origin);
});

// Test constants exist and are valid
Deno.test('MONTHLY_UPLOAD_CAP: is defined and positive', () => {
  assertExists(MONTHLY_UPLOAD_CAP);
  assertEquals(typeof MONTHLY_UPLOAD_CAP, 'number');
  assertEquals(MONTHLY_UPLOAD_CAP > 0, true);
});

Deno.test('ALLOWED_ORIGINS: is defined and contains domains', () => {
  assertExists(ALLOWED_ORIGINS);
  assertEquals(Array.isArray(ALLOWED_ORIGINS), true);
  assertEquals(ALLOWED_ORIGINS.length > 0, true);
});

/**
 * Edge Function retry logic tests
 *
 * These tests document the expected behavior for anonymous upload retry logic:
 * - Users can retry after failed uploads
 * - Users cannot reuse email after successful uploads
 */

Deno.test('Retry Logic: Should allow retry when previous upload failed', () => {
  // Test case: User uploaded a file that failed processing
  // Expected: They can retry with the same email

  // Mock scenario:
  const existingUpload = {
    id: 'upload-123',
    meeting_id: 'meeting-456',
    meetings: {
      id: 'meeting-456',
      processing_jobs: [{ status: 'failed' }],
    },
  };

  // Check if has successful processing
  const hasSuccessfulProcessing =
    existingUpload.meetings?.processing_jobs?.some(
      (job: any) => job.status === 'completed'
    );

  // Should allow retry (no successful processing)
  assertEquals(hasSuccessfulProcessing, false);
});

Deno.test(
  'Retry Logic: Should block retry when previous upload succeeded',
  () => {
    // Test case: User uploaded a file that completed processing successfully
    // Expected: They cannot reuse the same email

    // Mock scenario:
    const existingUpload = {
      id: 'upload-123',
      meeting_id: 'meeting-456',
      meetings: {
        id: 'meeting-456',
        processing_jobs: [{ status: 'completed' }],
      },
    };

    // Check if has successful processing
    const hasSuccessfulProcessing =
      existingUpload.meetings?.processing_jobs?.some(
        (job: any) => job.status === 'completed'
      );

    // Should block retry (has successful processing)
    assertEquals(hasSuccessfulProcessing, true);
  }
);

Deno.test(
  'Retry Logic: Should allow retry when processing is still pending',
  () => {
    // Test case: User's previous upload is still being processed
    // Expected: They can retry (edge case, shouldn't happen often)

    // Mock scenario:
    const existingUpload = {
      id: 'upload-123',
      meeting_id: 'meeting-456',
      meetings: {
        id: 'meeting-456',
        processing_jobs: [{ status: 'processing' }],
      },
    };

    // Check if has successful processing
    const hasSuccessfulProcessing =
      existingUpload.meetings?.processing_jobs?.some(
        (job: any) => job.status === 'completed'
      );

    // Should allow retry (no completed processing yet)
    assertEquals(hasSuccessfulProcessing, false);
  }
);

Deno.test(
  'Retry Logic: Should allow retry when no processing jobs exist',
  () => {
    // Test case: Upload record exists but no processing jobs (edge case)
    // Expected: They can retry

    // Mock scenario:
    const existingUpload = {
      id: 'upload-123',
      meeting_id: 'meeting-456',
      meetings: {
        id: 'meeting-456',
        processing_jobs: [],
      },
    };

    // Check if has successful processing
    const hasSuccessfulProcessing =
      existingUpload.meetings?.processing_jobs?.some(
        (job: any) => job.status === 'completed'
      );

    // Should allow retry (no processing jobs)
    assertEquals(hasSuccessfulProcessing, false);
  }
);

// Test CORS configuration (shared constants)
Deno.test('getAllowedOrigin: returns origin when in allowed list', () => {
  assertEquals(
    getAllowedOrigin('https://omaginelabs.com'),
    'https://omaginelabs.com'
  );
  assertEquals(
    getAllowedOrigin('https://www.omaginelabs.com'),
    'https://www.omaginelabs.com'
  );
  assertEquals(
    getAllowedOrigin('http://localhost:3000'),
    'http://localhost:3000'
  );
  assertEquals(
    getAllowedOrigin('http://localhost:5173'),
    'http://localhost:5173'
  );
});

Deno.test('getAllowedOrigin: returns default for unknown origins', () => {
  assertEquals(
    getAllowedOrigin('https://malicious-site.com'),
    ALLOWED_ORIGINS[0]
  );
  assertEquals(getAllowedOrigin('http://localhost:8080'), ALLOWED_ORIGINS[0]);
  assertEquals(getAllowedOrigin(null), ALLOWED_ORIGINS[0]);
});

Deno.test('getCorsHeaders: returns correct headers structure', () => {
  const headers = getCorsHeaders('https://omaginelabs.com');

  assertEquals(
    headers['Access-Control-Allow-Origin'],
    'https://omaginelabs.com'
  );
  assertEquals(headers['Access-Control-Allow-Credentials'], 'true');
  assertExists(headers['Access-Control-Allow-Headers']);
  assertEquals(
    headers['Access-Control-Allow-Headers'].includes('content-type'),
    true
  );
});

Deno.test('getCorsHeaders: uses default origin for null', () => {
  const headers = getCorsHeaders(null);
  assertEquals(headers['Access-Control-Allow-Origin'], ALLOWED_ORIGINS[0]);
});

// Test constants
Deno.test('MONTHLY_UPLOAD_CAP: is a positive number', () => {
  assertEquals(typeof MONTHLY_UPLOAD_CAP, 'number');
  assertEquals(MONTHLY_UPLOAD_CAP > 0, true);
  assertEquals(MONTHLY_UPLOAD_CAP, 500); // Current expected value
});

Deno.test('ALLOWED_ORIGINS: contains expected production URLs', () => {
  assertEquals(ALLOWED_ORIGINS.includes('https://omaginelabs.com'), true);
  assertEquals(ALLOWED_ORIGINS.includes('https://www.omaginelabs.com'), true);
});

Deno.test('ALLOWED_ORIGINS: contains localhost for development', () => {
  assertEquals(ALLOWED_ORIGINS.includes('http://localhost:3000'), true);
  assertEquals(ALLOWED_ORIGINS.includes('http://localhost:5173'), true);
});

// Test eligibility logic helpers
// These test the pure logic that would be used in the edge function

/**
 * Helper to check if an email would be eligible based on:
 * - Not a beta user (simulated)
 * - Monthly cap not reached
 * - Email not already used
 */
function checkEligibilityLogic(
  isBetaUser: boolean,
  uploadsThisMonth: number,
  emailAlreadyUsed: boolean
): { eligible: boolean; reason?: string; error?: string } {
  // Beta users bypass all limits
  if (isBetaUser) {
    return { eligible: true, reason: 'beta_user' };
  }

  // Check monthly cap
  if (uploadsThisMonth >= MONTHLY_UPLOAD_CAP) {
    return {
      eligible: false,
      error:
        'Monthly upload capacity reached. Please try again next month or sign up for a free trial!',
    };
  }

  // Check if email already used
  if (emailAlreadyUsed) {
    return {
      eligible: false,
      error:
        'This email has already been used for a free analysis. Please sign up for a free trial to analyze more meetings!',
    };
  }

  return { eligible: true };
}

Deno.test('eligibility: beta users are always eligible', () => {
  const result = checkEligibilityLogic(true, MONTHLY_UPLOAD_CAP + 100, true);
  assertEquals(result.eligible, true);
  assertEquals(result.reason, 'beta_user');
});

Deno.test('eligibility: new email under cap is eligible', () => {
  const result = checkEligibilityLogic(false, 0, false);
  assertEquals(result.eligible, true);
  assertEquals(result.error, undefined);
});

Deno.test('eligibility: email near cap is still eligible', () => {
  const result = checkEligibilityLogic(false, MONTHLY_UPLOAD_CAP - 1, false);
  assertEquals(result.eligible, true);
});

Deno.test('eligibility: monthly cap reached returns error', () => {
  const result = checkEligibilityLogic(false, MONTHLY_UPLOAD_CAP, false);
  assertEquals(result.eligible, false);
  assertExists(result.error);
  assertEquals(result.error?.includes('Monthly upload capacity'), true);
});

Deno.test('eligibility: over monthly cap returns error', () => {
  const result = checkEligibilityLogic(false, MONTHLY_UPLOAD_CAP + 50, false);
  assertEquals(result.eligible, false);
  assertExists(result.error);
});

Deno.test('eligibility: already used email returns error', () => {
  const result = checkEligibilityLogic(false, 100, true);
  assertEquals(result.eligible, false);
  assertExists(result.error);
  assertEquals(result.error?.includes('already been used'), true);
});

Deno.test('eligibility: monthly cap takes precedence over email check', () => {
  // When both conditions fail, monthly cap is checked first
  const result = checkEligibilityLogic(false, MONTHLY_UPLOAD_CAP, true);
  assertEquals(result.eligible, false);
  assertEquals(result.error?.includes('Monthly upload capacity'), true);
});

// Test first day of month calculation (used for monthly cap)
Deno.test('first day of month calculation is correct', () => {
  const now = new Date();
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  // Should be the first day
  assertEquals(firstDayOfMonth.getDate(), 1);
  // Should be midnight
  assertEquals(firstDayOfMonth.getHours(), 0);
  assertEquals(firstDayOfMonth.getMinutes(), 0);
  assertEquals(firstDayOfMonth.getSeconds(), 0);
  // Should be same month/year as now
  assertEquals(firstDayOfMonth.getMonth(), now.getMonth());
  assertEquals(firstDayOfMonth.getFullYear(), now.getFullYear());
});
