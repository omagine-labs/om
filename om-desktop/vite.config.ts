import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';
import dotenv from 'dotenv';

// Load .env file for build-time variable replacement
dotenv.config();

// https://vitejs.dev/config
export default defineConfig(({ command }) => {
  const isServe = command === 'serve'; // Development mode

  return {
    plugins: [
      react(),
      electron([
        {
          // Main process entry (absolute path from project root)
          entry: path.resolve(__dirname, 'src/main.ts'),
          vite: {
            define: {
              // Embed production credentials at build time
              'process.env.SUPABASE_URL_PRODUCTION': JSON.stringify(
                process.env.SUPABASE_URL_PRODUCTION
              ),
              'process.env.SUPABASE_ANON_KEY_PRODUCTION': JSON.stringify(
                process.env.SUPABASE_ANON_KEY_PRODUCTION
              ),
              'process.env.SUPABASE_URL_LOCAL': JSON.stringify(
                process.env.SUPABASE_URL_LOCAL
              ),
              'process.env.SUPABASE_ANON_KEY_LOCAL': JSON.stringify(
                process.env.SUPABASE_ANON_KEY_LOCAL
              ),
              'process.env.WEB_APP_URL_PRODUCTION': JSON.stringify(
                process.env.WEB_APP_URL_PRODUCTION
              ),
              'process.env.WEB_APP_URL_LOCAL': JSON.stringify(
                process.env.WEB_APP_URL_LOCAL
              ),
              // Sentry DSN for error tracking (main process)
              'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN),
            },
            build: {
              outDir: path.resolve(__dirname, 'dist-electron'),
              // Only empty in production builds to prevent duplicate accumulation
              // In dev mode, keep files so preload.js doesn't get deleted
              emptyOutDir: !isServe,
              sourcemap: false, // Disable source maps in production
              minify: 'esbuild', // Ensure minification
              rollupOptions: {
                output: {
                  // Use consistent naming instead of hash-based names
                  entryFileNames: '[name].js',
                  chunkFileNames: '[name].js',
                  assetFileNames: '[name].[ext]',
                },
              },
            },
          },
          onstart(args) {
            // Start Electron after build
            args.startup();
          },
        },
        {
          // Preload script entry (absolute path from project root)
          entry: path.resolve(__dirname, 'src/preload.ts'),
          vite: {
            build: {
              outDir: path.resolve(__dirname, 'dist-electron'),
              emptyOutDir: false, // Don't empty (main process already did)
              sourcemap: false,
              minify: 'esbuild',
              rollupOptions: {
                output: {
                  entryFileNames: '[name].js',
                  chunkFileNames: '[name].js',
                  assetFileNames: '[name].[ext]',
                },
              },
            },
          },
        },
      ]),
    ],
    // Use dashboard as the root
    root: 'src/dashboard',
    publicDir: path.resolve(__dirname, 'src/dashboard/public'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/dashboard'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: path.resolve(__dirname, 'dist-renderer'),
      emptyOutDir: true,
      sourcemap: false, // Disable source maps in production
      minify: 'esbuild', // Ensure minification
      rollupOptions: {
        output: {
          // Use consistent naming for better caching
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash].[ext]',
        },
      },
    },
    // Use relative paths for assets in Electron (file:// protocol)
    base: './',
  };
});
