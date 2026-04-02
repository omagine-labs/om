import { NextResponse } from 'next/server';

/**
 * CORS headers for API routes that need to be accessed from the desktop app
 *
 * Security Note:
 * - These routes require Bearer token authentication
 * - CORS is a browser security feature, not an API security feature
 * - The auth token is the real security boundary
 * - We allow all origins since authentication is required
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400', // 24 hours
};

/**
 * Handle CORS preflight (OPTIONS) requests
 * Call this at the start of your route handler for OPTIONS method
 */
export function handleCorsPrelight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Add CORS headers to an existing NextResponse
 */
export function addCorsHeaders(response: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Create a NextResponse.json with CORS headers included
 */
export function jsonWithCors(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): NextResponse {
  const response = NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      ...corsHeaders,
      ...init?.headers,
    },
  });
  return response;
}
