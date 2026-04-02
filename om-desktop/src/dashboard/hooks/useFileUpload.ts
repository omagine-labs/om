import { useState } from 'react';
import { authApi } from '@/lib/api-client';
import { getFileExtension } from '@/lib/upload-constants';
import { trackEvent, TechEvents } from '@/lib/analytics';

interface UploadResponse {
  success: boolean;
  jobId?: string;
  storagePath?: string;
  signedUrl?: string;
  message?: string;
}

interface MeetingInfo {
  id: string; // Database meeting ID
  summary: string;
  start: string;
}

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);

  const uploadFile = async (
    file: File,
    meetingInfo?: MeetingInfo
  ): Promise<UploadResponse> => {
    setIsUploading(true);
    setError(null);
    setUploadProgress(0);
    setUploadStartTime(Date.now());

    const fileType = file.type || 'unknown';

    try {
      // Get current user from main process
      const user = await authApi.getCurrentUser();
      if (!user) {
        throw new Error('You must be logged in to upload files');
      }

      const fileSizeMB = Number((file.size / (1024 * 1024)).toFixed(2));

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      let data: UploadResponse;

      // Check if running in desktop app (has electronAPI with upload support)
      if (window.electronAPI?.upload?.manualFile) {
        console.log('Using desktop upload service via IPC');

        // Convert file to ArrayBuffer for IPC transfer
        const fileBuffer = await file.arrayBuffer();

        // Call desktop upload service via IPC
        // The IPC handler handles both storage upload and job creation
        const result = await window.electronAPI.upload.manualFile(
          fileBuffer,
          file.name,
          file.type,
          fileSizeMB,
          meetingInfo
            ? {
                title: meetingInfo.summary,
                startTime: meetingInfo.start,
                endTime: undefined,
                meetingId: meetingInfo.id ? meetingInfo.id : undefined,
              }
            : undefined
        );

        clearInterval(progressInterval);
        setUploadProgress(100);

        // Map desktop response to UploadResponse format
        data = {
          success: result.success,
          jobId: result.jobId,
          storagePath: result.storagePath,
          message: result.message,
        };

        console.log('[Upload] Desktop IPC result:', data);

        if (!data.success) {
          throw new Error(data.message || 'Upload failed');
        }
      } else {
        console.log('Using web API upload');

        // Web app: Need to upload to storage first, then call API
        // Note: This path is for web app only, not used in desktop
        const jobId = crypto.randomUUID();
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const ext = getFileExtension(file.name);
        const storagePath = `${user.id}/${year}/${month}/${jobId}.${ext}`;

        // For web, we need to dynamically import the Supabase client
        // This is a fallback path that won't be used in the desktop app
        const { createClient } = await import('@/lib/supabase');
        const supabase = createClient();

        const { error: uploadError } = await supabase.storage
          .from('recordings')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          clearInterval(progressInterval);
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        clearInterval(progressInterval);
        setUploadProgress(100);

        // Web app: call Next.js API route
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jobId,
            storagePath,
            originalFilename: file.name,
            fileSizeMB,
            meetingInfo: meetingInfo
              ? {
                  title: meetingInfo.summary,
                  startTime: meetingInfo.start,
                  meetingId: meetingInfo.id ? meetingInfo.id : undefined,
                }
              : undefined,
          }),
        });

        data = await response.json();

        if (!response.ok || !data.success) {
          // If job creation failed, try to clean up uploaded file
          await supabase.storage.from('recordings').remove([storagePath]);
          throw new Error(data.message || 'Failed to create processing job');
        }
      }

      // Success!
      // Reset state after short delay to show success
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
        setUploadStartTime(null);
      }, 1500);

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      console.error('Upload error:', err);

      // Track upload failed (for debugging)
      trackEvent(TechEvents.UPLOAD_FAILED, {
        file_type: fileType,
        file_size: file.size,
        error: errorMessage,
      });

      setError(errorMessage);
      setUploadProgress(0);
      setIsUploading(false);
      setUploadStartTime(null);

      throw err;
    }
  };

  const resetUpload = () => {
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    setUploadStartTime(null);
  };

  return {
    uploadFile,
    isUploading,
    uploadProgress,
    error,
    resetUpload,
  };
}
