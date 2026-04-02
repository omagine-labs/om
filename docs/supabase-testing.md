# Supabase Edge Function Testing

Guide for testing Supabase Edge Functions using Deno's built-in test runner.

---

## Overview

Edge Functions are tested using **Deno Test** with TypeScript support. Tests cover:

- Utility function logic (pure functions)
- Input validation
- Error handling
- Integration with Edge Function endpoints (optional)

---

## Running Tests

### Run All Supabase Tests

```bash
npm run test:supabase
```

### Run Tests for Specific Function

```bash
cd supabase/functions/create-anonymous-meeting
deno test index.test.ts
```

### Run Tests with Coverage (future enhancement)

```bash
deno test --coverage=coverage supabase/functions/**/*.test.ts
```

---

## Test Structure

### File Naming Convention

- Test files: `index.test.ts` (alongside `index.ts`)
- Located in the same directory as the Edge Function
- Example: `supabase/functions/create-anonymous-meeting/index.test.ts`

### Test Types

**Unit Tests Only** - Pure function logic

We test **only pure functions** that don't depend on external services:

```typescript
import { normalizeEmail, isValidEmail } from '../_shared/email-utils.ts';

Deno.test('normalizeEmail: converts to lowercase', () => {
  assertEquals(normalizeEmail('User@Example.com'), 'user@example.com');
});

Deno.test('isValidEmail: rejects invalid emails', () => {
  assertEquals(isValidEmail('notanemail'), false);
});
```

**Why no integration tests?**

- Tests should **never make real API calls** or depend on running services
- Pure function tests are fast, reliable, and test the actual business logic
- Edge Functions are integration tested in production deployment
- Keeps tests simple and friction-free

---

## Writing Tests

### Test Template

```typescript
/**
 * Tests for <function-name> Edge Function
 * Run with: deno test index.test.ts
 */

import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// Test utilities/helpers
Deno.test('utility function: basic behavior', () => {
  assertEquals(myFunction('input'), 'expected');
});

// Test error cases
Deno.test('utility function: throws on invalid input', () => {
  let error;
  try {
    myFunction('invalid');
  } catch (e) {
    error = e;
  }
  assertExists(error);
});

// Integration tests (require running Supabase)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/my-function`;

Deno.test({
  name: 'Edge Function: integration test',
  ignore: !ANON_KEY, // Skip if not running against real Supabase
  async fn() {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'test' }),
    });
    assertEquals(response.status, 200);
  },
});
```

### Best Practices

1. **Test Pure Functions Only**
   - Extract business logic into pure functions (no side effects)
   - Test utility functions thoroughly
   - **Never make real API calls** or depend on external services

2. **Use Descriptive Names**

   ```typescript
   // ✅ Good
   Deno.test('normalizeEmail: removes Gmail dots', () => {});

   // ❌ Bad
   Deno.test('test1', () => {});
   ```

3. **Test Edge Cases**
   - Invalid input
   - Empty values
   - Null/undefined handling
   - Boundary conditions

4. **No External Dependencies**

   ```typescript
   // ✅ Good - pure function, no dependencies
   Deno.test('normalizeEmail: handles edge case', () => {
     assertEquals(normalizeEmail('Test@Gmail.com'), 'test@gmail.com');
   });

   // ❌ Bad - makes real HTTP call
   Deno.test('calls API', async () => {
     const response = await fetch('http://localhost:54321/...');
   });
   ```

---

## CI/CD Integration

Tests run automatically in GitHub Actions when Supabase files change.

### Workflow: `.github/workflows/supabase-lint-pr.yml`

```yaml
- name: Setup Deno
  uses: denoland/setup-deno@v1
  with:
    deno-version: v1.x

- name: Run Edge Function tests
  run: |
    deno test supabase/functions/**/*.test.ts
```

### Local PR Checks

```bash
npm run check-pr
```

This runs:

- Prettier formatting
- ESLint linting
- TypeScript type check
- **Edge Function tests** (if Deno installed)

---

## Test Coverage

### Current Coverage

| Function                   | Tests       | Coverage                         |
| -------------------------- | ----------- | -------------------------------- |
| `create-anonymous-meeting` | ✅ 8 tests  | Email normalization & validation |
| `process-meeting`          | ❌ No tests | -                                |
| `generate-magic-link`      | ❌ No tests | -                                |
| Other functions            | ❌ No tests | -                                |

### Adding Tests to Existing Functions

1. Create `index.test.ts` in function directory
2. Import utilities from function
3. Write unit tests for pure functions
4. Add integration tests if needed
5. Run `npm run test:supabase` to verify

---

## Example: create-anonymous-meeting

See `supabase/functions/create-anonymous-meeting/index.test.ts` for a complete example covering:

**Email Normalization:**

- Converts to lowercase
- Removes +suffix for all providers
- Removes dots for Gmail/Googlemail only
- Preserves dots for other providers
- Handles combined cases

**Email Validation:**

- Accepts valid email formats
- Rejects invalid formats (no @, no domain, empty)

---

## Troubleshooting

### Deno Not Found

Install Deno:

```bash
# macOS/Linux
curl -fsSL https://deno.land/install.sh | sh

# Homebrew
brew install deno

# Windows
irm https://deno.land/install.ps1 | iex
```

### Tests Fail Locally But Pass in CI

- Check Deno version: `deno --version` (should be v1.x)
- Ensure no external dependencies in test code
- Tests should be deterministic and isolated

### Permission Errors

Deno uses a secure-by-default model. Our tests don't require any permissions since they:

- Test only pure functions
- Make no network requests
- Don't access environment variables
- Don't read/write files

If you add tests that need permissions, use:

```bash
--allow-env   # Access environment variables (avoid if possible)
--allow-net   # Make network requests (use mocks instead)
--allow-read  # Read files (only if absolutely necessary)
```

---

## Future Enhancements

- [ ] Add test coverage reporting
- [ ] Add tests for all Edge Functions
- [ ] Mock Supabase client for unit tests
- [ ] Add E2E test suite with real database
- [ ] Performance benchmarking for critical paths

---

## References

- [Deno Testing Documentation](https://deno.land/manual/testing)
- [Deno Standard Library Assertions](https://deno.land/std/testing/asserts.ts)
- [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions)
