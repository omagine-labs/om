import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import {
  checkRateLimit,
  getRateLimitHeaders,
  type RateLimitConfig,
} from './rate-limit';

/**
 * Validates that the request is a POST request
 * Returns 405 Method Not Allowed if not POST
 */
export function validatePostRequest(request: NextRequest): NextResponse | null {
  if (request.method !== 'POST') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      {
        status: 405,
        headers: {
          Allow: 'POST',
        },
      }
    );
  }
  return null;
}

/**
 * Validates Content-Type header for POST requests
 * Returns 415 Unsupported Media Type if invalid
 */
export function validateContentType(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get('content-type');

  // Allow no content-type for empty POST bodies
  if (!contentType) {
    return null;
  }

  // Accept JSON or form-encoded content
  const validTypes = ['application/json', 'application/x-www-form-urlencoded'];
  const isValid = validTypes.some((type) => contentType.includes(type));

  if (!isValid) {
    return NextResponse.json(
      { error: 'Unsupported media type' },
      {
        status: 415,
        headers: {
          Accept: validTypes.join(', '),
        },
      }
    );
  }

  return null;
}

/**
 * Adds security headers to the response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent caching of sensitive OAuth token data
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Add Content-Security-Policy for API routes
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );

  return response;
}

/**
 * Complete validation middleware wrapper
 * Validates request method, content type, rate limiting, and adds security headers
 */
export function withValidation(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: {
    rateLimit?: Partial<Omit<RateLimitConfig, 'key'>>;
  } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Validate POST method
    const methodError = validatePostRequest(request);
    if (methodError) return addSecurityHeaders(methodError);

    // Validate content type
    const contentTypeError = validateContentType(request);
    if (contentTypeError) return addSecurityHeaders(contentTypeError);

    // Get user ID for rate limiting
    let userId: string | null = null;
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        getSupabaseUrl(),
        getSupabaseAnonKey(),
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll() {
              // No-op for read-only middleware
            },
          },
        }
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch {
      // If auth check fails, continue without rate limiting
    }

    // Check rate limit
    const rateLimitError = checkRateLimit({
      key: userId,
      maxRequests: options.rateLimit?.maxRequests,
      windowMs: options.rateLimit?.windowMs,
    });
    if (rateLimitError) return addSecurityHeaders(rateLimitError);

    // Execute handler
    const response = await handler(request);

    // Add rate limit headers
    const rateLimitHeaders = getRateLimitHeaders({
      key: userId,
      maxRequests: options.rateLimit?.maxRequests,
      windowMs: options.rateLimit?.windowMs,
    });
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add security headers to response
    return addSecurityHeaders(response);
  };
}
