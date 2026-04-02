import { fetchWithRetry } from '@/lib/fetch-utils';

// Mock global fetch
const originalFetch = global.fetch;

describe('fetch-utils', () => {
  describe('fetchWithRetry()', () => {
    beforeEach(() => {
      // Reset fetch mock before each test
      global.fetch = jest.fn();
      jest.clearAllMocks();
    });

    afterAll(() => {
      // Restore original fetch
      global.fetch = originalFetch;
    });

    /**
     * CRITICAL TEST: Success on first attempt
     * Should not retry when fetch succeeds immediately
     */
    it('should return response on first successful attempt', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry('/api/test', { method: 'GET' });

      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    /**
     * CRITICAL TEST: Retry on 404
     * Should retry when receiving 404 (HMR race condition)
     */
    it('should retry on 404 and succeed on second attempt', async () => {
      const mock404 = new Response('not found', { status: 404 });
      const mock200 = new Response('success', { status: 200 });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mock404)
        .mockResolvedValueOnce(mock200);

      const result = await fetchWithRetry('/api/test', { method: 'GET' });

      expect(result).toBe(mock200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    /**
     * CRITICAL TEST: Max retries exceeded on persistent 404
     * Should return 404 response after exhausting retries
     */
    it('should return 404 after max retries exceeded', async () => {
      const mock404 = new Response('not found', { status: 404 });
      (global.fetch as jest.Mock).mockResolvedValue(mock404);

      const result = await fetchWithRetry('/api/test', { method: 'GET' }, 3);

      expect(result.status).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    /**
     * CRITICAL TEST: Non-404 errors return immediately
     * Auth errors (401, 403) and other errors should not be retried
     */
    it('should return 401 immediately without retry', async () => {
      const mock401 = new Response('unauthorized', { status: 401 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mock401);

      const result = await fetchWithRetry('/api/test', { method: 'GET' });

      expect(result.status).toBe(401);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return 403 immediately without retry', async () => {
      const mock403 = new Response('forbidden', { status: 403 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mock403);

      const result = await fetchWithRetry('/api/test', { method: 'GET' });

      expect(result.status).toBe(403);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return 500 immediately without retry', async () => {
      const mock500 = new Response('server error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mock500);

      const result = await fetchWithRetry('/api/test', { method: 'GET' });

      expect(result.status).toBe(500);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    /**
     * CRITICAL TEST: Network errors retried
     * Should retry on network failures
     */
    it('should retry on network error and succeed', async () => {
      const networkError = new Error('Network error');
      const mock200 = new Response('success', { status: 200 });

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mock200);

      const result = await fetchWithRetry('/api/test', { method: 'GET' });

      expect(result).toBe(mock200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    /**
     * CRITICAL TEST: Network errors throw after max retries
     * Should throw original error after exhausting retries
     */
    it('should throw network error after max retries', async () => {
      const networkError = new Error('Persistent network error');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(
        fetchWithRetry('/api/test', { method: 'GET' }, 3)
      ).rejects.toThrow('Persistent network error');

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    /**
     * CRITICAL TEST: AbortSignal behavior
     * Should throw AbortError when signal is aborted before retry
     */
    it('should throw AbortError when signal aborted before retry', async () => {
      const mock404 = new Response('not found', { status: 404 });
      (global.fetch as jest.Mock).mockResolvedValue(mock404);

      const controller = new AbortController();

      // Abort after first attempt
      (global.fetch as jest.Mock).mockImplementationOnce(() => {
        controller.abort();
        return Promise.resolve(mock404);
      });

      await expect(
        fetchWithRetry('/api/test', {
          method: 'GET',
          signal: controller.signal,
        })
      ).rejects.toThrow('Aborted');

      // Should only call once since abort happens before retry
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    /**
     * CRITICAL TEST: AbortSignal during delay
     * Should throw AbortError if aborted during retry delay
     */
    it('should throw AbortError when signal aborted during delay', async () => {
      const mock404 = new Response('not found', { status: 404 });
      (global.fetch as jest.Mock).mockResolvedValue(mock404);

      const controller = new AbortController();

      // Start the retry attempt
      const promise = fetchWithRetry(
        '/api/test',
        { method: 'GET', signal: controller.signal },
        3,
        10 // Short delay for test
      );

      // Abort during delay
      setTimeout(() => controller.abort(), 5);

      await expect(promise).rejects.toThrow('Aborted');
    });

    /**
     * TEST: Custom retry parameters
     * Should respect custom maxRetries and initialDelayMs
     */
    it('should use custom maxRetries parameter', async () => {
      const mock404 = new Response('not found', { status: 404 });
      (global.fetch as jest.Mock).mockResolvedValue(mock404);

      const maxRetries = 5;
      await fetchWithRetry('/api/test', { method: 'GET' }, maxRetries);

      expect(global.fetch).toHaveBeenCalledTimes(maxRetries);
    });

    /**
     * TEST: Exponential backoff timing
     * Should wait with exponential backoff between retries
     */
    it('should use exponential backoff delays', async () => {
      const mock404 = new Response('not found', { status: 404 });
      const mock200 = new Response('success', { status: 200 });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mock404)
        .mockResolvedValueOnce(mock404)
        .mockResolvedValueOnce(mock200);

      const startTime = Date.now();
      await fetchWithRetry('/api/test', { method: 'GET' }, 3, 50);
      const elapsed = Date.now() - startTime;

      // Should wait ~50ms + ~100ms = ~150ms total
      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(140);
      expect(elapsed).toBeLessThan(300);
    });

    /**
     * TEST: Preserve original error type
     * Should preserve non-Error thrown values by wrapping them
     */
    it('should preserve non-Error thrown values', async () => {
      const customError = { code: 'CUSTOM_ERROR', message: 'Custom error' };
      (global.fetch as jest.Mock).mockRejectedValue(customError);

      await expect(
        fetchWithRetry('/api/test', { method: 'GET' }, 2)
      ).rejects.toThrow('[object Object]');
    });

    /**
     * TEST: Request options passed through
     * Should pass all fetch options correctly
     */
    it('should pass fetch options correctly', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const options: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      };

      await fetchWithRetry('/api/test', options);

      expect(global.fetch).toHaveBeenCalledWith('/api/test', options);
    });
  });
});
