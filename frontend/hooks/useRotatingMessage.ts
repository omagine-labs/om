import { useState, useEffect } from 'react';

/**
 * Hook that cycles through an array of messages on an interval
 * @param messages - Array of messages to rotate through
 * @param intervalMs - Interval in milliseconds (default: 3000)
 * @returns Current message string
 */
export function useRotatingMessage(
  messages: string[],
  intervalMs = 3000
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [messages.length, intervalMs]);

  return messages[index];
}
