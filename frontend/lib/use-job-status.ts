import { useEffect, useState, useCallback } from 'react';
import { getSupabaseUrl } from '@/lib/config';

export type JobStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface JobStatusData {
  id: string;
  status: JobStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  hasAnalysis: boolean;
}

export interface UseJobStatusOptions {
  /**
   * Polling interval in milliseconds
   * @default 3000 (3 seconds)
   */
  interval?: number;

  /**
   * Whether to start polling immediately
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback when job completes successfully
   */
  onComplete?: (job: JobStatusData) => void;

  /**
   * Callback when job fails
   */
  onError?: (job: JobStatusData) => void;
}

export interface UseJobStatusReturn {
  job: JobStatusData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

/**
 * Hook for polling job status
 *
 * @example
 * ```tsx
 * const { job, isLoading, error } = useJobStatus(jobId, {
 *   onComplete: (job) => {
 *     console.log('Job completed!', job);
 *     router.push(`/results/${job.id}`);
 *   },
 *   onError: (job) => {
 *     console.error('Job failed:', job.error);
 *   }
 * });
 * ```
 */
export function useJobStatus(
  jobId: string | null,
  options: UseJobStatusOptions = {}
): UseJobStatusReturn {
  const { interval = 3000, enabled = true, onComplete, onError } = options;

  const [job, setJob] = useState<JobStatusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(enabled);

  const fetchJobStatus = useCallback(async () => {
    if (!jobId) {
      setIsLoading(false);
      return;
    }

    try {
      // Get Supabase URL from environment
      const supabaseUrl = getSupabaseUrl();

      // Get auth token from Supabase client
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call Supabase Edge Function
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-job-status?jobId=${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch job status: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch job status');
      }

      const jobData = data.job as JobStatusData;
      setJob(jobData);
      setError(null);

      // Call callbacks based on status
      if (jobData.status === 'completed' && onComplete) {
        onComplete(jobData);
        setIsPolling(false); // Stop polling when complete
      } else if (jobData.status === 'failed' && onError) {
        onError(jobData);
        setIsPolling(false); // Stop polling when failed
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching job status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId, onComplete, onError]);

  // Initial fetch
  useEffect(() => {
    if (jobId && enabled) {
      fetchJobStatus();
    }
  }, [jobId, enabled, fetchJobStatus]);

  // Polling
  useEffect(() => {
    if (!jobId || !isPolling) {
      return;
    }

    // Don't poll if job is in terminal state
    if (job?.status === 'completed' || job?.status === 'failed') {
      setIsPolling(false);
      return;
    }

    const intervalId = setInterval(() => {
      fetchJobStatus();
    }, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [jobId, isPolling, interval, job?.status, fetchJobStatus]);

  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  return {
    job,
    isLoading,
    error,
    refetch: fetchJobStatus,
    startPolling,
    stopPolling,
  };
}

/**
 * Trigger processing for a job
 *
 * @example
 * ```tsx
 * const { processJob, isProcessing, error } = useProcessJob();
 *
 * const handleProcess = async () => {
 *   const result = await processJob(jobId);
 *   if (result.success) {
 *     console.log('Processing started!');
 *   }
 * };
 * ```
 */
export function useProcessJob() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processJob = useCallback(async (jobId: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Get Supabase URL from environment
      const supabaseUrl = getSupabaseUrl();

      // Get auth token from Supabase client
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call Supabase Edge Function
      const response = await fetch(
        `${supabaseUrl}/functions/v1/process-meeting`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start processing');
      }

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error starting processing:', err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    processJob,
    isProcessing,
    error,
  };
}
