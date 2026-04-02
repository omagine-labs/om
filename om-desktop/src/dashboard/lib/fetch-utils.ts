/**
 * Retry a fetch request with exponential backoff
 *
 * Handles transient errors like 404 during Next.js Hot Module Replacement (HMR).
 * During development, Next.js may temporarily return 404 while rebuilding API routes
 * on Hot Module Replacement. This utility retries only on 404 status codes.
 *
 * Auth errors (401, 403) and other status codes are returned immediately without retry,
 * allowing the caller to handle them appropriately.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (headers, method, etc.)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds, doubles each retry (default: 100ms)
 * @returns Promise resolving to the fetch Response
 * @throws Error if max retries exceeded or AbortSignal triggered
 *
 * @example
 * ```typescript
 * const response = await fetchWithRetry('/api/refresh-token', {
 *   method: 'POST',
 *   signal: abortController.signal
 * });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 100
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Only retry on 404 (route temporarily unavailable during HMR)
      // Auth errors (401, 403) and other status codes return immediately
      if (response.status !== 404 || attempt === maxRetries - 1) {
        return response;
      }

      // Log retry attempt for debugging in development
      if (process.env.NODE_ENV === 'development') {
        console.debug(
          `[fetch-utils] API route returned 404 (likely HMR rebuild), retrying... (attempt ${attempt + 1}/${maxRetries})`
        );
      }
    } catch (err) {
      // Preserve original error type
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw lastError;
      }
    }

    // Check if request was aborted before waiting
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Exponential backoff: 100ms, 200ms, 400ms
    const delay = initialDelayMs * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Check again after delay in case abort happened during wait
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  }

  // Shouldn't reach here, but provide fallback
  throw lastError || new Error('Max retries reached');
}
