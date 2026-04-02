import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { withValidation } from '@/app/api/_middleware/validation';

/**
 * Allowed origins for CORS on this endpoint.
 * The marketing site and local dev are permitted.
 */
const ALLOWED_ORIGINS = [
  'https://www.omaginelabs.com',
  'https://omaginelabs.com',
  'http://localhost:3000',
];

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Handle CORS preflight (OPTIONS) requests
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * POST /api/email-signup
 * Accepts { email, source? } and inserts into email_signups table.
 * Handles duplicate emails gracefully (returns success).
 * Rate limited to 5 requests per IP per minute via DB check.
 */
export const POST = withValidation(
  async (request: NextRequest): Promise<NextResponse> => {
    const corsHeaders = getCorsHeaders(request);

    try {
      const body = await request.json();
      const { email, source } = body as { email?: string; source?: string };

      // Validate email
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return NextResponse.json(
          { error: 'A valid email address is required' },
          { status: 400, headers: corsHeaders }
        );
      }

      const normalizedEmail = email.toLowerCase().trim();
      const signupSource = source || 'skills-course';
      const ip = getClientIp(request);

      const supabase = createServiceRoleClient();

      // DB-based rate limiting: count recent signups from this IP
      if (process.env.DISABLE_RATE_LIMITING !== 'true') {
        const windowStart = new Date(
          Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000
        ).toISOString();

        const { count } = await supabase
          .from('email_signups')
          .select('*', { count: 'exact', head: true })
          .eq('ip_address', ip)
          .gte('created_at', windowStart);

        if (count !== null && count >= RATE_LIMIT_MAX) {
          return NextResponse.json(
            {
              error: 'Rate limit exceeded',
              message: 'Too many requests. Please try again later.',
            },
            { status: 429, headers: corsHeaders }
          );
        }
      }

      // Insert into database
      const { error } = await supabase.from('email_signups').insert({
        email: email.trim(),
        normalized_email: normalizedEmail,
        ip_address: ip,
        signup_source: signupSource,
      });

      // Handle duplicate email gracefully (Postgres unique violation code)
      if (error && error.code === '23505') {
        return NextResponse.json(
          { success: true },
          { status: 200, headers: corsHeaders }
        );
      }

      if (error) {
        console.error('Failed to insert email signup:', error);
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { success: true },
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      console.error('Error in email-signup POST:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHeaders }
      );
    }
  }
);
