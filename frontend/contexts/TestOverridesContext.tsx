'use client';

import { createContext, useContext, type ReactNode, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

export interface TestOverrides {
  testAuth: boolean | undefined;
  testPremium: boolean | undefined;
  testPlayed: boolean | undefined;
  testOm: boolean | undefined;
  testLimitReached: boolean | undefined;
  testProcessing: string | boolean | undefined;
}

const TestOverridesContext = createContext<TestOverrides>({
  testAuth: undefined,
  testPremium: undefined,
  testPlayed: undefined,
  testOm: undefined,
  testLimitReached: undefined,
  testProcessing: undefined,
});

/**
 * Inner component that reads search params
 * Must be wrapped in Suspense
 */
function TestOverridesReader({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV === 'development';

  const getOverride = (param: string): boolean | undefined => {
    if (!isDev) return undefined;
    const value = searchParams.get(param);
    if (value === null) return undefined;
    return value === 'true';
  };

  // Special getter for test_processing that supports step values (upload|transcribe|analyze|results)
  const getProcessingOverride = (): string | boolean | undefined => {
    if (!isDev) return undefined;
    const value = searchParams.get('test_processing');
    if (value === null) return undefined;
    // Support specific steps or just 'true' for default
    if (['upload', 'transcribe', 'analyze', 'results'].includes(value)) {
      return value;
    }
    return value === 'true';
  };

  const overrides: TestOverrides = {
    testAuth: getOverride('test_auth'),
    testPremium: getOverride('test_premium'),
    testPlayed: getOverride('test_played'),
    testOm: getOverride('test_om'),
    testLimitReached: getOverride('test_limit_reached'),
    testProcessing: getProcessingOverride(),
  };

  return (
    <TestOverridesContext.Provider value={overrides}>
      {children}
    </TestOverridesContext.Provider>
  );
}

/**
 * Provider that handles useSearchParams with proper Suspense boundary
 *
 * This centralizes all test override reading so individual hooks don't need
 * to call useSearchParams directly, which can cause prerender failures.
 */
export function TestOverridesProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <TestOverridesReader>{children}</TestOverridesReader>
    </Suspense>
  );
}

/**
 * Hook to access test overrides from context
 * Safe to use anywhere - returns undefined values if not in provider
 */
export function useTestOverridesContext(): TestOverrides {
  return useContext(TestOverridesContext);
}
