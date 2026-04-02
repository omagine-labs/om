'use client';

import { usePostHogIdentify } from '@/hooks/usePostHogIdentify';
import { useIntercomIdentify } from '@/hooks/useIntercomIdentify';

/**
 * Client-side wrapper for authenticated layout
 * Handles PostHog and Intercom user identification
 */
export function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  // Identify user with PostHog on mount
  usePostHogIdentify();

  // Identify user with Intercom on mount
  useIntercomIdentify();

  return <>{children}</>;
}
