import { useState } from 'react';
import { createClient } from '@/lib/supabase';
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
      // Get Supabase client
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('You must be logged in to upload files');
      }

      // Generate unique job ID using browser crypto API
      const jobId = crypto.randomUUID();

      // Generate storage path
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const ext = getFileExtension(file.name);
      const storagePath = `${user.id}/${year}/${month}/${jobId}.${ext}`;

      console.log('Uploading directly to Supabase Storage:', storagePath);

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

      // Upload file directly to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        clearInterval(progressInterval);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('Upload successful:', uploadData);

      // Create processing job record via API
      const fileSizeMB = Number((file.size / (1024 * 1024)).toFixed(2));

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
                // Only include meetingId if it's a real database ID (not empty)
                meetingId: meetingInfo.id ? meetingInfo.id : undefined,
              }
            : undefined,
        }),
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data: UploadResponse = await response.json();

      if (!response.ok || !data.success) {
        // If job creation failed, try to clean up uploaded file
        await supabase.storage.from('recordings').remove([storagePath]);
        throw new Error(data.message || 'Failed to create processing job');
      }

      // Success!
      const duration = uploadStartTime ? Date.now() - uploadStartTime : 0;

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
