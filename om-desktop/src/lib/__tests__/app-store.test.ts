import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-store for this test
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
      clear() {
        mockStoreData = {};
      }
    },
  };
});

import { appStore } from '../app-store';

describe('appStore', () => {
  beforeEach(() => {
    // Reset store data before each test
    mockStoreData = {};
  });

  describe('Start at Login', () => {
    it('should return false for hasSetLoginItem by default', () => {
      expect(appStore.hasSetLoginItem()).toBe(false);
    });

    it('should set hasSetLoginItem to true when marked', () => {
      appStore.markLoginItemSet();
      expect(appStore.hasSetLoginItem()).toBe(true);
    });

    it('should persist hasSetLoginItem state correctly', () => {
      // Verify initial state
      expect(appStore.hasSetLoginItem()).toBe(false);

      // Change state
      appStore.markLoginItemSet();

      // Verify change persisted
      expect(appStore.hasSetLoginItem()).toBe(true);
    });
  });
});
