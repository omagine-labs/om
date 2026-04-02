# Integration Tests Documentation

## Overview

This directory contains integration tests for the subscription management system, including API routes, webhooks, middleware, and UI components.

## Test Structure

```
__tests__/
├── integration/
│   ├── api/
│   │   ├── subscriptions/     # Subscription API route tests
│   │   └── webhooks/          # Stripe webhook tests
│   ├── middleware/            # Rate limiter tests
│   └── pages/                 # Page component tests
├── mocks/
│   ├── factories.ts           # Reusable mock factories
│   └── handlers.ts            # MSW request handlers
├── constants/
│   └── rates.ts               # Rate limit configurations
└── utils/
    └── api-test-helpers.ts    # Testing utilities
```

## Testing Philosophy

### Why Jest Mocks Instead of MSW?

**Decision:** We use Jest module mocks (`jest.mock()`) instead of Mock Service Worker (MSW) for API route integration tests.

**Reasons:**

1. **ESM Compatibility:** MSW v2 has compatibility issues with Next.js 15's native ESM support
2. **Direct Testing:** We test Next.js API route handlers directly without HTTP layer
3. **Faster Execution:** No HTTP server needed, tests run faster
4. **Better Type Safety:** Direct access to route handler types and return values

**Trade-offs:**

- ❌ Less realistic (no actual HTTP requests)
- ✅ Faster test execution
- ✅ Better error messages
- ✅ No ESM compatibility issues

### Rate Limiting Test Strategy

**Centralized Constants:** Rate limit values are centralized in `__tests__/constants/rates.ts` to ensure consistency across tests.

**Test Coverage:**

- Basic functionality (allow within limit, block when exceeded)
- Edge cases (window expiration, concurrent requests)
- Configuration edge cases (null key, disabled via env)
- Header validation (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`)

**Why Test Rate Limiting Directly?**

- Most API route tests mock the rate limiter to focus on route logic
- Dedicated `rate-limit.test.ts` tests the rate limiter module itself
- This separation keeps tests focused and maintainable

## Mock Factories

### Purpose

Mock factories in `__tests__/mocks/factories.ts` provide reusable functions to create consistent test data.

**Benefits:**

- Reduces code duplication across tests
- Ensures consistent data structure
- Makes tests more maintainable when models change
- Improves test readability

### Available Factories

**Data Models:**

```typescript
createMockSubscription(overrides); // Database subscription record
createMockStripeSubscription(overrides); // Stripe API subscription object
createMockCheckoutSession(overrides); // Stripe checkout session
createMockPaymentHistory(overrides); // Payment history record
createMockUser(overrides); // User record
```

**Client Mocks:**

```typescript
createMockSupabaseClient(config); // Supabase client with query chains
createMockStripeClient(overrides); // Stripe client with common methods
```

### Usage Example

```typescript
import {
  createMockSubscription,
  createMockSupabaseClient,
} from '../mocks/factories';

test('should fetch subscription', () => {
  const mockSub = createMockSubscription({ status: 'trialing' });
  const mockSupabase = createMockSupabaseClient({
    subscriptions: { data: mockSub, error: null },
  });

  // Test logic...
});
```

## Test Categories

### 1. API Route Tests

**Location:** `__tests__/integration/api/subscriptions/`

**What We Test:**

- Authentication (401 for unauthenticated requests)
- Request validation (400 for invalid input)
- Business logic (duplicate checks, trial eligibility)
- Error handling (500 for Stripe/database errors)
- Rate limiting (429 after limit exceeded)

**Pattern:**

```typescript
describe('POST /api/subscriptions/checkout-session', () => {
  describe('Authentication', () => {
    /* auth tests */
  });
  describe('Request validation', () => {
    /* validation tests */
  });
  describe('Business logic', () => {
    /* happy path tests */
  });
  describe('Error handling', () => {
    /* error scenarios */
  });
});
```

### 2. Webhook Tests

**Location:** `__tests__/integration/api/webhooks/stripe.test.ts`

**What We Test:**

- Security (signature verification)
- Event handling (all Stripe event types)
- Idempotency (duplicate events don't cause double-writes)
- Error handling (malformed events, network errors)

**Critical Test Cases:**

- ✅ Duplicate `checkout.session.completed` (no double-charging)
- ✅ Duplicate `invoice.payment_succeeded` (no double-recording)
- ✅ Malformed events (missing required fields)
- ✅ Network errors (graceful handling)

**Security Note:**
The webhook handler uses `stripe.webhooks.constructEvent()` for signature verification. This method uses timing-safe HMAC comparison to prevent timing attacks. See `app/api/webhooks/stripe/route.ts:54-56` for implementation.

### 3. Middleware Tests

**Location:** `__tests__/integration/middleware/rate-limit.test.ts`

**What We Test:**

- Basic rate limiting (allow/block behavior)
- Window expiration (reset after time window)
- Concurrent requests (accurate counting)
- Configuration (disabled mode, null keys, defaults)
- Headers (correct `X-RateLimit-*` values)

### 4. Page Component Tests

**Location:** `__tests__/integration/pages/account-settings.test.ts`

**What We Test:**

- Rendering with different subscription states
- User interactions (cancel, reactivate, change plan)
- Loading states
- Error states

## Common Patterns

### Authentication Mock

```typescript
mockSupabase.auth.getUser.mockResolvedValue({
  data: { user: { id: 'test-user-id', email: 'test@example.com' } },
  error: null,
});
```

### Database Query Mock

```typescript
mockSupabase.from.mockReturnValue({
  select: jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: createMockSubscription(),
        error: null,
      }),
    }),
  }),
});
```

### Stripe API Mock

```typescript
mockStripe.checkout.sessions.create.mockResolvedValue(
  createMockCheckoutSession()
);
```

### Error Simulation

```typescript
// Stripe error
mockStripe.subscriptions.retrieve.mockRejectedValue(
  new Error('Stripe API error')
);

// Database error
mockSupabase.from.mockReturnValue({
  select: jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST301', message: 'Database error' },
      }),
    }),
  }),
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- __tests__/integration/api/subscriptions/current.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Adding New Tests

### 1. Choose Test Location

- API route → `__tests__/integration/api/subscriptions/`
- Webhook → `__tests__/integration/api/webhooks/`
- Middleware → `__tests__/integration/middleware/`
- Page → `__tests__/integration/pages/`

### 2. Use Mock Factories

Import from `__tests__/mocks/factories.ts`:

```typescript
import {
  createMockSubscription,
  createMockSupabaseClient,
  createMockStripeClient,
} from '../../../mocks/factories';
```

### 3. Use Rate Limit Constants

Import from `__tests__/constants/rates.ts`:

```typescript
import {
  RATE_LIMITS,
  getExpectedRateLimitHeaders,
} from '../../../constants/rates';
```

### 4. Follow Test Structure

```typescript
describe('POST /api/your-route', () => {
  let mockSupabase: any;
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockStripe = createMockStripeClient();
  });

  describe('Authentication', () => {
    /* ... */
  });
  describe('Validation', () => {
    /* ... */
  });
  describe('Business logic', () => {
    /* ... */
  });
  describe('Error handling', () => {
    /* ... */
  });
});
```

## Coverage Targets

- **API Routes:** >80% coverage
- **Webhooks:** 100% event type coverage
- **Middleware:** >90% coverage
- **Pages:** >70% coverage

## ESLint Configuration

**Change:** Added `coverage/**` to ESLint ignore list

**Reason:** Jest generates coverage reports in `coverage/` directory. These files are auto-generated HTML/JS and shouldn't be linted.

**File:** `eslint.config.mjs:22`

```javascript
ignores: [
  'node_modules/**',
  '.next/**',
  'coverage/**', // ← Added to prevent linting generated coverage files
  // ...
];
```

## Debugging Tips

### Test Fails with "Unexpected token"

**Problem:** ESM/CJS compatibility issue

**Solution:** Ensure `jest.config.js` has correct `transformIgnorePatterns`

### Mock Not Working

**Problem:** Mock imported after actual module

**Solution:** Always call `jest.mock()` before imports

### Rate Limit Test Flaky

**Problem:** Timing-dependent test

**Solution:** Use explicit timeouts with buffer (e.g., `setTimeout(resolve, windowMs + 50)`)

### Webhook Test Fails with Console Errors

**Problem:** Expected errors cluttering output

**Solution:** Add error pattern to `jest.setup.js` console suppression

## Best Practices

1. ✅ **Use factories** for mock data instead of inline objects
2. ✅ **Test error cases** not just happy paths
3. ✅ **Verify idempotency** for state-changing operations
4. ✅ **Test edge cases** (null values, empty arrays, timeouts)
5. ✅ **Clear mocks** in `beforeEach()` to prevent test pollution
6. ✅ **Use descriptive test names** that explain what is being tested
7. ✅ **Group related tests** in `describe()` blocks
8. ✅ **Document security decisions** (e.g., why we use `constructEvent`)

## Questions?

For testing questions or issues, check:

- Jest documentation: https://jestjs.io/docs/getting-started
- Testing Library: https://testing-library.com/docs/
- Next.js testing: https://nextjs.org/docs/testing
