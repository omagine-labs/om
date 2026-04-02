import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/supabase/database.types';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and Route Handlers
 * Supports both cookie-based auth (web app) and Bearer token auth (desktop app)
 * @returns Supabase server client with cookie handling
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

/**
 * Creates a Supabase client that supports both cookie-based and Bearer token authentication
 * Use this in API routes that need to support both web app (cookies) and desktop app (Bearer tokens)
 * @returns Supabase client configured for the current request
 */
export async function createAuthenticatedSupabaseClient() {
  const headersList = await headers();
  const authorization = headersList.get('authorization');

  // Check if request has Bearer token (desktop app)
  if (authorization?.startsWith('Bearer ')) {
    const accessToken = authorization.substring(7);

    // For Bearer token auth, create a standard client with global auth headers
    // This ensures the JWT is included in all requests (including database operations)
    const supabase = createClient<Database>(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    // Verify the token is valid by passing it explicitly to getUser()
    // This validates the JWT server-side
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      console.error(
        '[createAuthenticatedSupabaseClient] Token validation failed:',
        {
          error: userError?.message,
          code: userError?.code,
        }
      );
      // Return client anyway - route handler will throw UnauthorizedError
    }

    return supabase;
  }

  // Fall back to cookie-based auth (web app)
  return createServerSupabaseClient();
}

/**
 * Creates a Supabase client with service role key (bypasses RLS)
 * ONLY use this for server-side operations that need to bypass RLS (e.g., webhooks)
 * @returns Supabase client with service role privileges
 */
export function createServiceRoleClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
