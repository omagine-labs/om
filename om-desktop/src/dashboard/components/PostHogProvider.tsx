'use client';

import { analytics } from '@/lib/posthog';

// Initialize PostHog immediately when this module loads (client-side only)
if (typeof window !== 'undefined') {
  analytics.init();
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
