/**
 * Session Persistence - Simple "Remember me" storage
 *
 * Only used when user opts into "Remember me".
 * Otherwise, session only lives in memory.
 */

import Store from 'electron-store';
import type { Session } from '@supabase/supabase-js';
import { appStore } from '../app-store';

interface PersistedData {
  session: Session | null;
}

class SessionPersistence {
  private store: Store<PersistedData>;

  constructor() {
    this.store = new Store<PersistedData>({
      name: 'om-auth-v2', // New name for clean slate, won't conflict with old data
      encryptionKey: 'om-desktop-auth-key-v2',
      defaults: { session: null },
    });
  }

  isRememberMeEnabled(): boolean {
    return appStore.getRememberMe();
  }

  save(session: Session): void {
    if (this.isRememberMeEnabled()) {
      console.log('[SessionPersistence] Saving session to disk');
      // Note: electron-store extends conf, but TypeScript struggles with the inherited
      // generic method signatures. The methods work correctly at runtime.
      (this.store as any).set('session', session);
    }
  }

  load(): Session | null {
    if (!this.isRememberMeEnabled()) {
      console.log(
        '[SessionPersistence] Remember me disabled, not loading from disk'
      );
      return null;
    }

    const session = (this.store as any).get('session') as Session | null;
    if (session) {
      console.log('[SessionPersistence] Loaded session from disk');
    }
    return session;
  }

  clear(): void {
    console.log('[SessionPersistence] Clearing persisted session');
    (this.store as any).delete('session');
  }
}

export const sessionPersistence = new SessionPersistence();
