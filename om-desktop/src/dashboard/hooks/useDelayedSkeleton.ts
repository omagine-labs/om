import { useEffect, useState } from 'react';

/**
 * Custom hook to delay showing skeleton loading states.
 * Prevents skeleton flicker on fast page loads by only showing the skeleton
 * if loading takes longer than the specified delay.
 *
 * @param isLoading - The actual loading state
 * @param delay - Delay in milliseconds before showing skeleton (default: 400ms)
 * @returns Boolean indicating whether to show the skeleton
 *
 * @example
 * const [isLoading, setIsLoading] = useState(true);
 * const showSkeleton = useDelayedSkeleton(isLoading);
 *
 * if (isLoading && showSkeleton) {
 *   return <SkeletonComponent />;
 * }
 *
 * if (isLoading) {
 *   return <BackgroundOnly />;
 * }
 */
export function useDelayedSkeleton(
  isLoading: boolean,
  delay: number = 400
): boolean {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setShowSkeleton(true);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setShowSkeleton(false);
    }
  }, [isLoading, delay]);

  return showSkeleton;
}
