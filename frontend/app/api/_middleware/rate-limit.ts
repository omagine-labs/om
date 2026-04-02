import { NextResponse } from 'next/server';

/**
 * Simple in-memory rate limiter for API routes
 * Tracks requests per user ID with sliding window
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  },
  5 * 60 * 1000
);

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed within the window
   * @default 10
   */
  maxRequests?: number;

  /**
   * Time window in milliseconds
   * @default 300000 (5 minutes)
   */
  windowMs?: number;

  /**
   * Key to use for rate limiting (e.g., user ID)
   * If not provided, no rate limiting is applied
   */
  key: string | null;
}

/**
 * Check if request is rate limited
 * Returns null if allowed, or NextResponse with 429 if rate limited
 */
export function checkRateLimit(config: RateLimitConfig): NextResponse | null {
  // Skip rate limiting if disabled via environment variable
  if (process.env.DISABLE_RATE_LIMITING === 'true') {
    return null;
  }

  // Skip rate limiting if no key provided
  if (!config.key) {
    return null;
  }

  const maxRequests = config.maxRequests ?? 10;
  const windowMs = config.windowMs ?? 5 * 60 * 1000; // 5 minutes default
  const now = Date.now();
  const resetAt = now + windowMs;

  const entry = rateLimitStore.get(config.key);

  // First request or window expired
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(config.key, { count: 1, resetAt });
    return null;
  }

  // Increment count
  entry.count++;

  // Rate limit exceeded
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': entry.resetAt.toString(),
        },
      }
    );
  }

  // Request allowed
  return null;
}

/**
 * Get rate limit headers for successful responses
 */
export function getRateLimitHeaders(
  config: RateLimitConfig
): Record<string, string> {
  if (!config.key) {
    return {};
  }

  const maxRequests = config.maxRequests ?? 10;
  const entry = rateLimitStore.get(config.key);

  if (!entry) {
    return {
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': maxRequests.toString(),
    };
  }

  const remaining = Math.max(0, maxRequests - entry.count);

  return {
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': entry.resetAt.toString(),
  };
}
