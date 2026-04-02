/**
 * Test utilities for integration testing Next.js API routes
 */

import { NextRequest } from 'next/server';
import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(
  method: string,
  url: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): NextRequest {
  const requestUrl = url.startsWith('http')
    ? url
    : `http://localhost:3000${url}`;

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  if (options.body && method !== 'GET') {
    requestInit.body = JSON.stringify(options.body);
  }

  const request = new NextRequest(requestUrl, requestInit);

  // Add cookies if provided
  if (options.cookies) {
    Object.entries(options.cookies).forEach(([name, value]) => {
      request.cookies.set(name, value);
    });
  }

  return request;
}

/**
 * Helper to create authenticated request with mock Supabase session
 */
export function createAuthenticatedRequest(
  method: string,
  url: string,
  options: {
    userId?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const userId = options.userId || 'test-user-id';

  // Mock Supabase auth cookies (simplified for testing)
  const mockAuthCookies = {
    'sb-access-token': 'mock-access-token',
    'sb-refresh-token': 'mock-refresh-token',
  };

  return createMockRequest(method, url, {
    ...options,
    cookies: mockAuthCookies,
    headers: {
      ...options.headers,
      Authorization: `Bearer mock-access-token`,
    },
  });
}

/**
 * Helper to create unauthenticated request (no auth cookies)
 */
export function createUnauthenticatedRequest(
  method: string,
  url: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  return createMockRequest(method, url, options);
}

/**
 * Parse JSON response from NextResponse
 */
export async function parseJsonResponse(response: Response): Promise<any> {
  // Clone the response to avoid consuming the body
  const clonedResponse = response.clone();
  const text = await clonedResponse.text();

  if (!text || text === '') {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse JSON response:', text);
    throw error;
  }
}

/**
 * Assert response has expected status code
 */
export function assertStatus(response: Response, expectedStatus: number) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`
    );
  }
}

/**
 * Assert response is successful (2xx)
 */
export function assertSuccess(response: Response) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Expected success status, got ${response.status}`);
  }
}

/**
 * Assert response has error status (4xx or 5xx)
 */
export function assertError(response: Response) {
  if (response.status < 400) {
    throw new Error(`Expected error status, got ${response.status}`);
  }
}
