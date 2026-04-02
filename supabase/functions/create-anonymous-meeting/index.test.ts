/**
 * Tests for create-anonymous-meeting Edge Function
 * Tests pure functions only - no external dependencies
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { normalizeEmail, isValidEmail } from '../_shared/email-utils.ts';

// Test email normalization
Deno.test('normalizeEmail: converts to lowercase', () => {
  assertEquals(normalizeEmail('User@Example.com'), 'user@example.com');
});

Deno.test('normalizeEmail: removes +suffix', () => {
  assertEquals(normalizeEmail('user+tag@example.com'), 'user@example.com');
});

Deno.test('normalizeEmail: removes dots for Gmail', () => {
  assertEquals(normalizeEmail('user.name@gmail.com'), 'username@gmail.com');
});

Deno.test('normalizeEmail: handles combined cases', () => {
  assertEquals(normalizeEmail('User.Name+Tag@Gmail.COM'), 'username@gmail.com');
});

Deno.test('normalizeEmail: preserves dots for non-Gmail', () => {
  assertEquals(
    normalizeEmail('user.name@example.com'),
    'user.name@example.com' // Dots are preserved for non-Gmail domains
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

// Test email validation
Deno.test('isValidEmail: accepts valid emails', () => {
  assertEquals(isValidEmail('user@example.com'), true);
  assertEquals(isValidEmail('user+tag@example.com'), true);
  assertEquals(isValidEmail('user.name@example.com'), true);
});

Deno.test('isValidEmail: rejects invalid emails', () => {
  assertEquals(isValidEmail('notanemail'), false);
  assertEquals(isValidEmail('@example.com'), false);
  assertEquals(isValidEmail('user@'), false);
  assertEquals(isValidEmail('user'), false);
  assertEquals(isValidEmail(''), false);
});

// Helper function to test User-Agent validation (extracted from main function)
function isSuspiciousUserAgent(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim() === '') {
    return true; // Empty user agent is suspicious
  }

  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /axios/i,
    /postman/i,
    /insomnia/i,
    /httpie/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(userAgent));
}

// Test User-Agent validation
Deno.test('isSuspiciousUserAgent: allows legitimate browsers', () => {
  assertEquals(
    isSuspiciousUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ),
    false
  );
  assertEquals(
    isSuspiciousUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    ),
    false
  );
  assertEquals(
    isSuspiciousUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)'),
    false
  );
});

Deno.test('isSuspiciousUserAgent: blocks bots and scrapers', () => {
  assertEquals(isSuspiciousUserAgent('Googlebot/2.1'), true);
  assertEquals(
    isSuspiciousUserAgent('Mozilla/5.0 (compatible; bingbot/2.0)'),
    true
  );
  assertEquals(isSuspiciousUserAgent('curl/7.64.1'), true);
  assertEquals(isSuspiciousUserAgent('python-requests/2.28.0'), true);
  assertEquals(isSuspiciousUserAgent('PostmanRuntime/7.29.0'), true);
});

Deno.test('isSuspiciousUserAgent: blocks empty user agents', () => {
  assertEquals(isSuspiciousUserAgent(null), true);
  assertEquals(isSuspiciousUserAgent(''), true);
  assertEquals(isSuspiciousUserAgent('   '), true);
});

// Helper function to compute file hash (extracted from main function)
async function computeFileHash(
  fileData: Uint8Array,
  fileSizeMB: number
): Promise<string> {
  const sizeData = new TextEncoder().encode(fileSizeMB.toString());
  const combinedData = new Uint8Array(fileData.length + sizeData.length);
  combinedData.set(fileData);
  combinedData.set(sizeData, fileData.length);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Test file hash computation
Deno.test(
  'computeFileHash: generates consistent hashes for same data',
  async () => {
    const testData = new TextEncoder().encode('test file content');
    const hash1 = await computeFileHash(testData, 1.5);
    const hash2 = await computeFileHash(testData, 1.5);
    assertEquals(hash1, hash2);
  }
);

Deno.test(
  'computeFileHash: generates different hashes for different data',
  async () => {
    const testData1 = new TextEncoder().encode('test file content 1');
    const testData2 = new TextEncoder().encode('test file content 2');
    const hash1 = await computeFileHash(testData1, 1.5);
    const hash2 = await computeFileHash(testData2, 1.5);
    assertEquals(hash1 !== hash2, true);
  }
);

Deno.test(
  'computeFileHash: generates different hashes for different file sizes',
  async () => {
    const testData = new TextEncoder().encode('test file content');
    const hash1 = await computeFileHash(testData, 1.5);
    const hash2 = await computeFileHash(testData, 2.0);
    assertEquals(hash1 !== hash2, true);
  }
);

Deno.test('computeFileHash: returns 64-character hex string', async () => {
  const testData = new TextEncoder().encode('test');
  const hash = await computeFileHash(testData, 1.0);
  assertEquals(hash.length, 64); // SHA-256 produces 64 hex characters
  assertEquals(/^[0-9a-f]+$/.test(hash), true); // All lowercase hex
});
