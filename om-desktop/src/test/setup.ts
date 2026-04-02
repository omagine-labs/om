import { vi, beforeEach, afterEach } from 'vitest';

// Suppress console logs during tests for cleaner output
// Note: Set SHOW_TEST_LOGS=true to see console output during debugging
const shouldSuppressLogs = !process.env.SHOW_TEST_LOGS;

beforeEach(() => {
  if (shouldSuppressLogs) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  }
});

afterEach(() => {
  if (shouldSuppressLogs) {
    vi.restoreAllMocks();
  }
});

// Mock electron-store
vi.mock('electron-store', () => {
  const Store = vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  }));
  return { default: Store };
});

// Mock auth service with Supabase client
vi.mock('../lib/auth', () => ({
  authService: {
    getClient: vi.fn(() => ({
      auth: { getUser: vi.fn(), getSession: vi.fn() },
      storage: { from: vi.fn() },
      from: vi.fn(),
    })),
    getUser: vi.fn(),
    getState: vi.fn(() => 'unauthenticated'),
    getSession: vi.fn(),
    initialize: vi.fn(),
    signOut: vi.fn(),
    onStateChange: vi.fn(() => () => {}),
  },
}));

// Mock Sentry modules to avoid Electron import issues in tests
vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/electron/renderer', () => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
