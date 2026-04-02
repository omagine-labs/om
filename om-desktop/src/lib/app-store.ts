import Store from 'electron-store';

/**
 * App preferences storage using electron-store
 * Stores non-sensitive app preferences and state
 */

interface AppStoreSchema {
  // Start at Login feature
  hasSetLoginItem: boolean; // Track if we've set login item once
  // Remember Me feature (Session Persistence)
  rememberMe: boolean; // User preference for persistent sessions
}

// Create store for app preferences
const store = new Store<AppStoreSchema>({
  name: 'om-app-preferences',
  defaults: {
    hasSetLoginItem: false,
    rememberMe: false, // Default to in-memory only (no keychain prompt)
  },
});

/**
 * App preferences storage API
 */
export const appStore = {
  // Start at Login
  hasSetLoginItem(): boolean {
    // @ts-expect-error - electron-store types don't expose get method properly
    return store.get('hasSetLoginItem', false);
  },

  markLoginItemSet(): void {
    // @ts-expect-error - electron-store types don't expose set method properly
    store.set('hasSetLoginItem', true);
    console.log('[AppStore] Marked login item as set');
  },

  // Remember Me preference
  getRememberMe(): boolean {
    // @ts-expect-error - electron-store types don't expose get method properly
    return store.get('rememberMe', false);
  },

  setRememberMe(value: boolean): void {
    // @ts-expect-error - electron-store types don't expose set method properly
    store.set('rememberMe', value);
    console.log('[AppStore] Remember me set to:', value);
  },
};
