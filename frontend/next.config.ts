import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, '../'),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '1gb',
    },
  },
  images: {
    remotePatterns: [
      {
        // Local Supabase storage (127.0.0.1)
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/slides/**',
      },
      {
        // Local Supabase storage (localhost)
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/public/slides/**',
      },
      {
        // Production Supabase storage (wildcard for any project)
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/slides/**',
      },
    ],
  },
};

// Only wrap with Sentry if DSN is configured
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      // Automatically tree-shake Sentry in production builds
      silent: true,
      // Disable Sentry during build (only enable in runtime)
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Upload source maps only if auth token is set
      authToken: process.env.SENTRY_AUTH_TOKEN,
    })
  : nextConfig;
