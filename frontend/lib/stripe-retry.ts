import Stripe from 'stripe';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Retry a Stripe API operation with exponential backoff
 *
 * Retries on:
 * - rate_limit_error (Stripe rate limiting)
 * - api_connection_error (Network issues)
 * - api_error (Internal Stripe errors)
 *
 * Does NOT retry on:
 * - card_error (Card declined - user action needed)
 * - invalid_request_error (Bad parameters - code fix needed)
 * - authentication_error (Invalid API key - config issue)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry on non-retryable errors
      if (error.type === 'StripeCardError') {
        throw error; // Card declined - user needs to fix
      }
      if (error.type === 'StripeInvalidRequestError') {
        throw error; // Bad request - code needs to fix
      }
      if (error.type === 'StripeAuthenticationError') {
        throw error; // Invalid API key - config issue
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );
      const jitter = Math.random() * 0.3 * delay; // 0-30% jitter
      const totalDelay = delay + jitter;

      console.warn(
        `Stripe API error (attempt ${attempt + 1}/${maxRetries + 1}):`,
        error.message,
        `Retrying in ${Math.round(totalDelay)}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError!;
}
