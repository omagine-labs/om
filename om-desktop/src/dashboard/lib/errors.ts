/**
 * Custom error classes for subscription operations
 * These provide better error handling and type safety
 */

/**
 * Base subscription error class
 */
export class SubscriptionError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/**
 * Error when Stripe API calls fail
 */
export class StripeAPIError extends SubscriptionError {
  constructor(
    message: string,
    public stripeErrorCode?: string
  ) {
    super(message, 'STRIPE_API_ERROR', 500);
    this.name = 'StripeAPIError';
  }
}

/**
 * Error when plan type is invalid
 */
export class InvalidPlanError extends SubscriptionError {
  constructor(planType: string) {
    super(
      `Invalid plan type: ${planType}. Must be 'monthly' or 'annual'.`,
      'INVALID_PLAN',
      400
    );
    this.name = 'InvalidPlanError';
  }
}

/**
 * Error when user already has an active subscription
 */
export class DuplicateSubscriptionError extends SubscriptionError {
  constructor() {
    super(
      'User already has an active subscription',
      'DUPLICATE_SUBSCRIPTION',
      409
    );
    this.name = 'DuplicateSubscriptionError';
  }
}

/**
 * Error when subscription is not found
 */
export class SubscriptionNotFoundError extends SubscriptionError {
  constructor() {
    super('No subscription found for this user', 'SUBSCRIPTION_NOT_FOUND', 404);
    this.name = 'SubscriptionNotFoundError';
  }
}

/**
 * Error when user is not authorized
 */
export class UnauthorizedError extends SubscriptionError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error when operation is not allowed
 */
export class ForbiddenOperationError extends SubscriptionError {
  constructor(message: string) {
    super(message, 'FORBIDDEN_OPERATION', 403);
    this.name = 'ForbiddenOperationError';
  }
}

/**
 * Error when webhook signature verification fails
 */
export class WebhookSignatureError extends SubscriptionError {
  constructor() {
    super('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE', 400);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Type guard to check if error is a SubscriptionError
 */
export function isSubscriptionError(
  error: unknown
): error is SubscriptionError {
  return error instanceof SubscriptionError;
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown) {
  if (isSubscriptionError(error)) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
      },
      statusCode: error.statusCode,
    };
  }

  // Generic error
  console.error('Unexpected error:', error);
  return {
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    statusCode: 500,
  };
}
