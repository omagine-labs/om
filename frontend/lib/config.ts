/**
 * Centralized configuration for environment-based settings
 *
 * To switch between local and production, change NEXT_PUBLIC_SUPABASE_ENV in .env.local
 */

/**
 * Get the current environment (local or production)
 */
export function getEnvironment(): 'local' | 'production' {
  return (
    (process.env.NEXT_PUBLIC_SUPABASE_ENV as 'local' | 'production') || 'local'
  );
}

/**
 * Get the Supabase URL based on the current environment
 */
export function getSupabaseUrl(): string {
  const env = getEnvironment();

  if (env === 'production') {
    return process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION!;
  }

  return process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL!;
}

/**
 * Get the Supabase anon key based on the current environment
 */
export function getSupabaseAnonKey(): string {
  const env = getEnvironment();

  if (env === 'production') {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PRODUCTION!;
  }

  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL!;
}

/**
 * Check if running in local development mode
 */
export function isLocalEnvironment(): boolean {
  return getEnvironment() === 'local';
}

/**
 * Check if running in production mode
 */
export function isProductionEnvironment(): boolean {
  return getEnvironment() === 'production';
}
