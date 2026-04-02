# Testing

Testing strategy, patterns, and guidelines for Meeting Intelligence Assistant.

**See Also**:

- [Python Backend Testing](./python-testing.md) - pytest patterns and metrics testing
- `frontend/__tests__/README.md` - Frontend integration test documentation

---

## Overview

**Frontend**: Jest and React Testing Library for unit and integration tests
**Backend**: pytest for Python service and metrics testing (see [python-testing.md](./python-testing.md))

**Test Organization**:

- `frontend/__tests__/unit/` - Unit tests for utilities, hooks, components
- `frontend/__tests__/integration/` - Integration tests for API routes and webhooks
- `python-backend/tests/` - Python backend tests (see [python-testing.md](./python-testing.md))

---

## Running Tests

### All Tests

```bash
# Run all tests across all workspaces
npm test

# Run frontend tests only
npm run test:frontend

# Watch mode (re-run on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Specific Tests

```bash
# Run specific test file
npm test -- frontend/__tests__/unit/lib/analytics.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should track events"

# Run tests in specific directory
npm test -- frontend/__tests__/integration/
```

---

## Test Structure

### Unit Tests

**Location**: `frontend/__tests__/unit/`

**What to Test**:

- Pure functions and utilities
- React hooks
- Component logic
- Helper functions

**Example**:

```typescript
// frontend/__tests__/unit/lib/analytics.test.ts
import { trackEvent, RetentionEvents } from '@/lib/analytics';
import * as posthog from '@/lib/posthog';

jest.mock('@/lib/posthog');

describe('Analytics', () => {
  it('should track events with properties', async () => {
    await trackEvent(RetentionEvents.DASHBOARD_VIEWED, {
      meeting_count: 5,
    });

    expect(posthog.analytics.capture).toHaveBeenCalledWith('dashboard_viewed', {
      meeting_count: 5,
    });
  });
});
```

### Integration Tests

**Location**: `frontend/__tests__/integration/`

**What to Test**:

- API routes
- Webhook handlers
- Middleware
- Database interactions

**Pattern**:

```typescript
describe('POST /api/subscriptions/create', () => {
  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Test auth
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid plan type', async () => {
      // Test validation
    });
  });

  describe('Business logic', () => {
    it('should create subscription with trial', async () => {
      // Test happy path
    });
  });

  describe('Error handling', () => {
    it('should handle Stripe API errors', async () => {
      // Test error cases
    });
  });
});
```

---

## Mock Factories

**Location**: `frontend/__tests__/mocks/factories.ts`

Mock factories provide reusable functions to create consistent test data.

### Available Factories

**Data Models**:

```typescript
createMockSubscription(overrides); // Database subscription
createMockStripeSubscription(overrides); // Stripe API subscription
createMockCheckoutSession(overrides); // Stripe checkout session
createMockPaymentHistory(overrides); // Payment history record
createMockUser(overrides); // User record
```

**Client Mocks**:

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

---

## Testing Patterns

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
    eq: jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST301', message: 'Database error' },
    }),
  }),
});
```

---

## Testing Patterns

### Testing Middleware and Shared Logic

**Approach**: Test shared utilities (rate limiters, auth middleware, etc.) separately from route tests.

**Benefits**:

- Route tests can mock the middleware
- Middleware tests focus on edge cases and configuration
- Cleaner test organization

**Example**: Rate limiting logic is tested independently, then mocked in API route tests.

### Testing Webhooks

**Security-First Approach**:

- Always verify webhook signatures (prevents unauthorized requests)
- Use timing-safe comparison methods (prevents timing attacks)
- Test signature verification with valid and invalid signatures

**Idempotency Testing**:

- Test duplicate webhook delivery (webhooks can be sent multiple times)
- Verify no duplicate charges, records, or side effects
- Use unique identifiers to detect duplicates

**Error Handling**:

- Test malformed payloads (missing required fields)
- Test network errors and retries
- Ensure graceful degradation

---

## Coverage Targets

- **API Routes**: >80% coverage
- **Webhooks**: 100% event type coverage
- **Middleware**: >90% coverage
- **Pages**: >70% coverage

---

## Best Practices

1. ✅ **Use factories** for mock data instead of inline objects
2. ✅ **Test error cases** not just happy paths
3. ✅ **Verify idempotency** for state-changing operations
4. ✅ **Test edge cases** (null values, empty arrays, timeouts)
5. ✅ **Clear mocks** in `beforeEach()` to prevent test pollution
6. ✅ **Use descriptive test names** that explain what is being tested
7. ✅ **Group related tests** in `describe()` blocks
8. ✅ **Document security decisions** (e.g., why we use `constructEvent`)

---

## Debugging Tests

### Test Fails with "Unexpected token"

**Problem**: ESM/CJS compatibility issue

**Solution**: Ensure `jest.config.js` has correct `transformIgnorePatterns`

### Mock Not Working

**Problem**: Mock imported after actual module

**Solution**: Always call `jest.mock()` before imports

### Rate Limit Test Flaky

**Problem**: Timing-dependent test

**Solution**: Use explicit timeouts with buffer (e.g., `setTimeout(resolve, windowMs + 50)`)

### Webhook Test Fails with Console Errors

**Problem**: Expected errors cluttering output

**Solution**: Add error pattern to `jest.setup.js` console suppression

---

## Adding New Tests

### 1. Choose Test Location

- API route → `__tests__/integration/api/`
- Webhook → `__tests__/integration/api/webhooks/`
- Middleware → `__tests__/integration/middleware/`
- Component → `__tests__/unit/components/`
- Utility → `__tests__/unit/lib/`

### 2. Use Mock Factories

Import from `__tests__/mocks/factories.ts`

### 3. Follow Test Structure

```typescript
describe('Feature Name', () => {
  let mockSupabase: any;
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockStripe = createMockStripeClient();
  });

  describe('Category 1', () => {
    it('should handle case A', () => {
      // Test
    });
  });

  describe('Category 2', () => {
    it('should handle case B', () => {
      // Test
    });
  });
});
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)
- [Complete Integration Test Docs](../frontend/__tests__/README.md)
