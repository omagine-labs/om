import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-store
let mockStoreData: Record<string, unknown> = {};

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor() {}
      get(key: string, defaultValue?: unknown) {
        return mockStoreData[key] ?? defaultValue;
      }
      set(key: string, value: unknown) {
        mockStoreData[key] = value;
      }
      delete(key: string) {
        delete mockStoreData[key];
      }
    },
  };
});

// Mock appStore
const mockGetRememberMe = vi.fn();
vi.mock('../../app-store', () => ({
  appStore: {
    getRememberMe: mockGetRememberMe,
  },
}));

describe('SessionPersistence', () => {
  let sessionPersistence: typeof import('../persistence').sessionPersistence;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStoreData = {};
    mockGetRememberMe.mockReturnValue(false);

    // Reset module to get fresh instance
    vi.resetModules();

    // Re-import to get fresh singleton
    const module = await import('../persistence');
    sessionPersistence = module.sessionPersistence;
  });

  describe('isRememberMeEnabled', () => {
    it('should return false when Remember Me is disabled', () => {
      mockGetRememberMe.mockReturnValue(false);

      expect(sessionPersistence.isRememberMeEnabled()).toBe(false);
    });

    it('should return true when Remember Me is enabled', () => {
      mockGetRememberMe.mockReturnValue(true);

      expect(sessionPersistence.isRememberMeEnabled()).toBe(true);
    });
  });

  describe('save', () => {
    const mockSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: 12345,
      user: { id: 'user-1', email: 'test@example.com' },
    };

    it('should save session when Remember Me is enabled', () => {
      mockGetRememberMe.mockReturnValue(true);

      sessionPersistence.save(mockSession as any);

      expect(mockStoreData['session']).toEqual(mockSession);
    });

    it('should not save session when Remember Me is disabled', () => {
      mockGetRememberMe.mockReturnValue(false);

      sessionPersistence.save(mockSession as any);

      expect(mockStoreData['session']).toBeUndefined();
    });
  });

  describe('load', () => {
    const mockSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: 12345,
      user: { id: 'user-1', email: 'test@example.com' },
    };

    it('should load session when Remember Me is enabled', () => {
      mockGetRememberMe.mockReturnValue(true);
      mockStoreData['session'] = mockSession;

      const loaded = sessionPersistence.load();

      expect(loaded).toEqual(mockSession);
    });

    it('should return null when Remember Me is disabled', () => {
      mockGetRememberMe.mockReturnValue(false);
      mockStoreData['session'] = mockSession;

      const loaded = sessionPersistence.load();

      expect(loaded).toBeNull();
    });

    it('should return null/undefined when no session stored', () => {
      mockGetRememberMe.mockReturnValue(true);

      const loaded = sessionPersistence.load();

      // Returns null or undefined when no session is stored
      expect(loaded).toBeFalsy();
    });
  });

  describe('clear', () => {
    it('should clear the stored session', () => {
      mockStoreData['session'] = { access_token: 'test' };

      sessionPersistence.clear();

      expect(mockStoreData['session']).toBeUndefined();
    });
  });
});
