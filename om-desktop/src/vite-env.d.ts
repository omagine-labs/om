/// <reference types="vite/client" />

// Development server URLs (provided by vite-plugin-electron in dev mode)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string | undefined;
declare const DASHBOARD_VITE_DEV_SERVER_URL: string | undefined;
declare const DASHBOARD_VITE_NAME: string | undefined;

// Environment variables
interface ImportMetaEnv {
  readonly VITE_SUPABASE_ENV: 'local' | 'production';
  readonly VITE_SUPABASE_URL_LOCAL: string;
  readonly VITE_SUPABASE_URL_PRODUCTION: string;
  readonly VITE_SUPABASE_ANON_KEY_LOCAL: string;
  readonly VITE_SUPABASE_ANON_KEY_PRODUCTION: string;
  readonly VITE_WEB_APP_URL_LOCAL: string;
  readonly VITE_WEB_APP_URL_PRODUCTION: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_INTERCOM_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
