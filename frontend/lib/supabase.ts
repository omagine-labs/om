import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/supabase/database.types';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';

/**
 * Creates a Supabase client for use in Client Components
 * @returns Supabase browser client
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
