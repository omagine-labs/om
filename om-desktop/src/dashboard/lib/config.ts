/**
 * Centralized configuration for environment-based settings
 * Desktop app version - uses Vite env variables instead of Next.js
 */

/**
 * Get the current environment (local or production)
 */
export function getEnvironment(): 'local' | 'production' {
  return (
    (import.meta.env.VITE_SUPABASE_ENV as 'local' | 'production') || 'local'
  );
}

/**
 * Get the Supabase URL based on the current environment
 */
export function getSupabaseUrl(): string {
  const env = getEnvironment();

  if (env === 'production') {
    return import.meta.env.VITE_SUPABASE_URL_PRODUCTION!;
  }

  return import.meta.env.VITE_SUPABASE_URL_LOCAL!;
}

/**
 * Get the Supabase anon key based on the current environment
 */
export function getSupabaseAnonKey(): string {
  const env = getEnvironment();

  if (env === 'production') {
    return import.meta.env.VITE_SUPABASE_ANON_KEY_PRODUCTION!;
  }

  return import.meta.env.VITE_SUPABASE_ANON_KEY_LOCAL!;
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

/**
 * Get the web app URL for sign-in and external links
 */
export function getWebAppUrl(): string {
  const env = getEnvironment();

  if (env === 'production') {
    return import.meta.env.VITE_WEB_APP_URL_PRODUCTION!;
  }

  return import.meta.env.VITE_WEB_APP_URL_LOCAL!;
}
