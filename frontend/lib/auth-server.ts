import 'server-only';
import { createServerSupabaseClient } from './supabase-server';
import type { User } from '@supabase/supabase-js';

/**
 * Get the current user (server-side)
 * @returns Current user or null
 */
export async function getServerUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
