/**
 * Integration tests for Rate Limiter
 * Tests edge cases like window expiration, concurrent requests, and reset behavior
 */

import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/app/api/_middleware/rate-limit';

// Disable rate limiting via env for cleanup
const originalEnv = process.env.DISABLE_RATE_LIMITING;

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Ensure rate limiting is enabled for these tests
    delete process.env.DISABLE_RATE_LIMITING;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env.DISABLE_RATE_LIMITING = originalEnv;
  });

  describe('Basic functionality', () => {
    it('should allow requests within limit', () => {
      const config = {
        key: 'test-user-1',
        maxRequests: 5,
        windowMs: 60000, // 1 minute
      };

      // Make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(config);
        expect(result).toBeNull(); // All should be allowed
      }
    });

    it('should block requests exceeding limit', () => {
      const config = {
        key: 'test-user-2',
        maxRequests: 3,
        windowMs: 60000,
      };

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        const result = checkRateLimit(config);
        expect(result).toBeNull();
      }

      // 4th request should be blocked
      const blockedResult = checkRateLimit(config);
      expect(blockedResult).not.toBeNull();
      expect(blockedResult?.status).toBe(429);
    });

    it('should return correct rate limit headers when blocked', () => {
      const config = {
        key: 'test-user-3',
        maxRequests: 2,
        windowMs: 60000,
      };

      // Use up the limit
      checkRateLimit(config);
      checkRateLimit(config);

      // Get blocked response
      const blockedResponse = checkRateLimit(config);
      expect(blockedResponse).not.toBeNull();
      expect(blockedResponse?.headers.get('X-RateLimit-Limit')).toBe('2');
      expect(blockedResponse?.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(blockedResponse?.headers.get('Retry-After')).toBeDefined();
      expect(blockedResponse?.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });

  describe('Edge Cases - Window Expiration', () => {
    it('should reset count after rate limit window expires', async () => {
      const config = {
        key: 'test-user-window-reset',
        maxRequests: 2,
        windowMs: 100, // 100ms window for fast test
      };

      // Use up the limit
      const firstRequest = checkRateLimit(config);
      const secondRequest = checkRateLimit(config);
      expect(firstRequest).toBeNull();
      expect(secondRequest).toBeNull();

      // 3rd request should be blocked
      const thirdRequest = checkRateLimit(config);
      expect(thirdRequest).not.toBeNull();
      expect(thirdRequest?.status).toBe(429);

      // Wait for window to expire (100ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next request should be allowed (new window)
      const afterResetRequest = checkRateLimit(config);
      expect(afterResetRequest).toBeNull();

      // And we should be able to make another request
      const secondAfterReset = checkRateLimit(config);
      expect(secondAfterReset).toBeNull();
    });

    it('should handle requests at boundary of window expiration', async () => {
      const config = {
        key: 'test-user-boundary',
        maxRequests: 1,
        windowMs: 50, // 50ms window
      };

      // First request
      const first = checkRateLimit(config);
      expect(first).toBeNull();

      // Second request immediately (should be blocked)
      const second = checkRateLimit(config);
      expect(second?.status).toBe(429);

      // Wait just past window expiration
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should be allowed now
      const third = checkRateLimit(config);
      expect(third).toBeNull();
    });
  });

  describe('Edge Cases - Concurrent Requests', () => {
    it('should correctly track count for rapid concurrent requests', () => {
      const config = {
        key: 'test-user-concurrent',
        maxRequests: 5,
        windowMs: 60000,
      };

      // Simulate 10 rapid requests (no actual Promise.all needed since synchronous)
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(checkRateLimit(config));
      }

      // First 5 should pass
      expect(results.slice(0, 5).every((r) => r === null)).toBe(true);

      // Remaining 5 should be blocked
      expect(results.slice(5).every((r) => r?.status === 429)).toBe(true);
    });

    it('should maintain separate counts for different users', () => {
      const user1Config = {
        key: 'user-1',
        maxRequests: 2,
        windowMs: 60000,
      };

      const user2Config = {
        key: 'user-2',
        maxRequests: 2,
        windowMs: 60000,
      };

      // User 1 makes 2 requests (at limit)
      expect(checkRateLimit(user1Config)).toBeNull();
      expect(checkRateLimit(user1Config)).toBeNull();

      // User 1's 3rd request should be blocked
      expect(checkRateLimit(user1Config)?.status).toBe(429);

      // User 2 should still have full quota
      expect(checkRateLimit(user2Config)).toBeNull();
      expect(checkRateLimit(user2Config)).toBeNull();
      expect(checkRateLimit(user2Config)?.status).toBe(429);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should return correct remaining count', () => {
      const config = {
        key: 'test-user-headers',
        maxRequests: 5,
        windowMs: 60000,
      };

      // Make 3 requests
      checkRateLimit(config);
      checkRateLimit(config);
      checkRateLimit(config);

      // Check headers
      const headers = getRateLimitHeaders(config);
      expect(headers['X-RateLimit-Limit']).toBe('5');
      expect(headers['X-RateLimit-Remaining']).toBe('2'); // 5 - 3 = 2
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should show 0 remaining when at limit', () => {
      const config = {
        key: 'test-user-at-limit',
        maxRequests: 2,
        windowMs: 60000,
      };

      // Use up the limit
      checkRateLimit(config);
      checkRateLimit(config);

      // Check headers
      const headers = getRateLimitHeaders(config);
      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('should never show negative remaining count', () => {
      const config = {
        key: 'test-user-over-limit',
        maxRequests: 1,
        windowMs: 60000,
      };

      // Exceed the limit
      checkRateLimit(config);
      checkRateLimit(config); // Over limit

      // Headers should still show 0, not negative
      const headers = getRateLimitHeaders(config);
      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
  });

  describe('Configuration edge cases', () => {
    it('should skip rate limiting when key is null', () => {
      const config = {
        key: null,
        maxRequests: 1,
        windowMs: 60000,
      };

      // Should allow unlimited requests
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit(config)).toBeNull();
      }
    });

    it('should skip rate limiting when DISABLE_RATE_LIMITING env is set', () => {
      process.env.DISABLE_RATE_LIMITING = 'true';

      const config = {
        key: 'test-user',
        maxRequests: 1,
        windowMs: 60000,
      };

      // Should allow unlimited requests
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit(config)).toBeNull();
      }
    });

    it('should use default values when not specified', () => {
      const config = {
        key: 'test-user-defaults',
      };

      // Default maxRequests is 10
      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit(config)).toBeNull();
      }

      // 11th should be blocked
      expect(checkRateLimit(config)?.status).toBe(429);
    });
  });
});
