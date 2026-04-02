/**
 * API Logger - Conditional logging for API routes
 * Suppresses logs during tests while keeping them in development/production
 */

const isTest = process.env.NODE_ENV === 'test';

export const apiLogger = {
  log: (...args: unknown[]) => {
    if (!isTest) {
      console.log(...args);
    }
  },

  error: (...args: unknown[]) => {
    if (!isTest) {
      console.error(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (!isTest) {
      console.warn(...args);
    }
  },

  info: (...args: unknown[]) => {
    if (!isTest) {
      console.info(...args);
    }
  },
};
