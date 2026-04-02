import dotenv from 'dotenv';
import { app } from 'electron';

// Load environment variables (only works in development with .env file)
dotenv.config();

// Environment type
type Environment = 'local' | 'production';

// Cache the environment detection result
let cachedEnvironment: Environment | null = null;

/**
 * Get the current environment
 * In packaged apps, check if we're running from /Applications or similar
 */
function getEnvironment(): Environment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  // Check explicit env var first
  const env = process.env.SUPABASE_ENV?.toLowerCase();
  if (env === 'production' || env === 'local') {
    cachedEnvironment = env as Environment;
    return cachedEnvironment;
  }

  // Auto-detect: if app is packaged, use production
  // app.isPackaged is true when running from a built .app bundle
  if (app.isPackaged) {
    cachedEnvironment = 'production';
    return cachedEnvironment;
  }

  cachedEnvironment = 'local'; // Default to local for development
  return cachedEnvironment;
}

// Lazy-evaluated configuration object
class Config {
  get environment(): Environment {
    return getEnvironment();
  }

  get supabase() {
    const env = getEnvironment();
    return {
      url:
        env === 'production'
          ? process.env.SUPABASE_URL_PRODUCTION!
          : process.env.SUPABASE_URL_LOCAL!,
      anonKey:
        env === 'production'
          ? process.env.SUPABASE_ANON_KEY_PRODUCTION!
          : process.env.SUPABASE_ANON_KEY_LOCAL!,
    };
  }

  get webApp() {
    const env = getEnvironment();
    return {
      url:
        env === 'production'
          ? process.env.WEB_APP_URL_PRODUCTION!
          : process.env.WEB_APP_URL_LOCAL!,
    };
  }

  // OAuth client IDs (NOT secrets - those stay on the backend/web app)
  get oauth() {
    return {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
      },
    };
  }

  // Recording and processing limits
  get recording() {
    return {
      maxFileSizeMB: 500, // Maximum file size for audio extraction (prevents resource exhaustion)
    };
  }

  // Validation method (call after app is ready)
  validate() {
    if (!this.supabase.url || !this.supabase.anonKey) {
      throw new Error(
        `Missing Supabase configuration for environment: ${this.environment}\n` +
          `Please check your .env file and ensure SUPABASE_URL_${this.environment.toUpperCase()} ` +
          `and SUPABASE_ANON_KEY_${this.environment.toUpperCase()} are set.`
      );
    }

    console.log('[Config] Loaded configuration:', {
      environment: this.environment,
      supabaseUrl: this.supabase.url,
      webAppUrl: this.webApp.url,
    });
  }
}

/**
 * Application configuration based on environment
 */
export const config = new Config();
