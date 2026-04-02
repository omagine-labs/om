import fsPromises from 'node:fs/promises';
import { Notification, shell } from 'electron';
import { authService } from '../lib/auth';
import { config } from '../lib/config';
import type { MeetingMetadata } from '../lib/meeting-metadata';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '../lib/sentry';

/**
 * Processing job status
 */
export interface ProcessingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error?: string | null;
}

/**
 * UploadService - Handles uploading stitched audio recordings to Supabase Storage and backend
 */
export class UploadService {
  private supabase: SupabaseClient;
  private currentNotification: Notification | null = null;

  constructor() {
    this.supabase = authService.getClient();
  }

  /**
   * Monitor processing status by polling the processing_jobs table
   */
  async monitorProcessing(
    meetingId: string,
    meetingTitle: string
  ): Promise<void> {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes (5s intervals)

    console.log('[Upload] Starting to monitor processing:', {
      meetingId,
      meetingTitle,
    });

    return new Promise<void>((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        attempts++;

        try {
          const { data: job, error } = await this.supabase
            .from('processing_jobs')
            .select('status, processing_error')
            .eq('meeting_id', meetingId)
            .single();

          if (error) {
            console.error('[Upload] Poll error:', error);
            return;
          }

          const typedJob = job as ProcessingJob;

          console.log('[Upload] Processing status:', {
            meetingId,
            status: typedJob.status,
            attempt: attempts,
          });

          if (typedJob.status === 'completed') {
            clearInterval(pollInterval);

            this.showNotificationWithAction(
              'Meeting Ready',
              `${meetingTitle} has been processed. Click to view analysis.`,
              () => {
                // Open meetings page in web app
                const meetingsUrl = `${config.webApp.url}/meetings`;
                void shell.openExternal(meetingsUrl);
              }
            );

            resolve();
          } else if (typedJob.status === 'failed') {
            clearInterval(pollInterval);
            const errorMessage =
              typedJob.processing_error || 'Processing failed';

            // Show error notification to user
            const { showProcessingError } = await import(
              '../utils/error-notifications'
            );
            showProcessingError(errorMessage);

            reject(new Error(errorMessage));
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            reject(new Error('Processing timeout'));
          }
        } catch (error) {
          console.error('[Upload] Monitoring error:', error);
          clearInterval(pollInterval);
          reject(error);
        }
      }, 5000); // Poll every 5 seconds
    });
  }

  /**
   * Delete local recording file after successful upload
   */
  async cleanupLocalFile(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
      console.log('[Upload] Deleted local recording:', filePath);
    } catch (error) {
      // Ignore ENOENT errors (file doesn't exist)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[Upload] Cleanup error:', error);
      }
      // Don't throw - cleanup failure is non-critical
    }
  }

  /**
   * Show notification to user
   */
  private showNotification(title: string, body: string): void {
    // Close previous notification
    if (this.currentNotification) {
      this.currentNotification.close();
    }

    // Create new notification
    this.currentNotification = new Notification({
      title,
      body,
      silent: true,
    });

    this.currentNotification.show();

    // Auto-cleanup notification reference after it's dismissed
    this.currentNotification.on('close', () => {
      this.currentNotification = null;
    });
  }

  /**
   * Show notification with click action
   */
  private showNotificationWithAction(
    title: string,
    body: string,
    action: () => void
  ): void {
    // Close previous notification
    if (this.currentNotification) {
      this.currentNotification.close();
    }

    // Create new notification
    this.currentNotification = new Notification({
      title,
      body,
      silent: true,
    });

    // Handle click action
    this.currentNotification.on('click', () => {
      console.log('[Upload] Notification clicked, executing action');
      action();
    });

    this.currentNotification.show();

    // Auto-cleanup notification reference after it's dismissed
    this.currentNotification.on('close', () => {
      this.currentNotification = null;
    });
  }

  /**
   * Upload stitched audio file to Supabase Storage and create meeting via backend API
   * @param sessionId - Unique session identifier
   * @param stitchedAudioPath - Path to stitched audio file
   * @param metadata - Meeting metadata
   * @param offRecordPeriods - Array of off-record periods with placeholder positions and actual duration
   * @param totalDuration - Total duration in seconds
   * @param stitchedMicPath - Optional path to stitched mic-only audio file
   * @param stitchedSystemPath - Optional path to stitched system-only audio file
   * @returns Upload result with success status and meetingId
   */
  async uploadStitchedAudio(
    sessionId: string,
    stitchedAudioPath: string,
    metadata: MeetingMetadata,
    offRecordPeriods: Array<{
      placeholderStart: number;
      placeholderEnd: number;
      actualDuration: number;
    }>,
    totalDuration: number,
    stitchedMicPath?: string,
    stitchedSystemPath?: string
  ): Promise<{ success: boolean; meetingId?: string; error?: string }> {
    const startTime = Date.now();
    try {
      // Add Sentry breadcrumb for upload start
      Sentry.addBreadcrumb('upload', 'Starting upload', {
        sessionId,
        fileSizeMB: 'calculating',
        durationSeconds: totalDuration,
        meetingTitle: metadata.title,
        platform: metadata.platform,
        component: 'desktop-app',
      });

      // Set Sentry tags for filtering
      Sentry.setTag('session_id', sessionId);
      Sentry.setTag('platform', metadata.platform);

      console.log('[Upload] ⬆️ Starting stitched audio upload:', {
        sessionId,
        originalFilename: `${sessionId}.mp3`,
        offRecordCount: offRecordPeriods.length,
        durationSeconds: totalDuration,
        meetingTitle: metadata.title,
        platform: metadata.platform,
      });

      // Get authenticated session from auth service
      const session = await authService.getSession();

      if (!session?.user) {
        console.error('[Upload] ❌ No authenticated session');
        Sentry.captureException(new Error('User not authenticated'));
        return { success: false, error: 'User not authenticated' };
      }

      const userId = session.user.id;
      Sentry.setUser(userId);
      Sentry.setTag('user_id', userId);
      console.log('[Upload] ✅ User authenticated:', userId);

      // Check if file exists before attempting to read
      const fs = await import('node:fs');
      if (!fs.existsSync(stitchedAudioPath)) {
        const error = `File not found: ${stitchedAudioPath}`;
        console.error('[Upload] ❌', error);
        Sentry.captureMessage(error, {
          level: 'warning',
          tags: { error_type: 'file_not_found' },
          extra: { sessionId, stitchedAudioPath },
        });
        return {
          success: false,
          error: 'Audio file no longer exists (may have been deleted)',
        };
      }

      // Read stitched audio file
      const fileBuffer = await fsPromises.readFile(stitchedAudioPath);
      const fileSizeMB = fileBuffer.length / 1024 / 1024;

      console.log('[Upload] Stitched audio size:', fileSizeMB.toFixed(2), 'MB');

      // Construct storage path: {user_id}/{year}/{month}/{session_id}.mp3
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const storagePath = `${userId}/${year}/${month}/${sessionId}.mp3`;

      // Upload to Supabase Storage
      console.log('[Upload] 📤 Uploading to Supabase Storage:', storagePath);
      Sentry.addBreadcrumb('upload', 'Uploading to Supabase Storage', {
        storagePath,
        fileSizeMB,
      });

      const uploadStart = Date.now();
      const { data, error } = await this.supabase.storage
        .from('recordings')
        .upload(storagePath, fileBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'audio/mpeg',
        });

      if (error) {
        console.error('[Upload] ❌ Storage upload failed:', error);
        Sentry.captureException(error);
        return { success: false, error: `Upload failed: ${error.message}` };
      }

      const uploadDuration = Date.now() - uploadStart;
      console.log(
        `[Upload] ✅ Stitched audio uploaded to storage in ${uploadDuration}ms:`,
        data.path
      );

      // Upload mic track if available
      let micAudioPath: string | undefined;
      if (stitchedMicPath && fs.existsSync(stitchedMicPath)) {
        console.log('[Upload] 📤 Uploading mic track to Supabase Storage...');
        const micFileBuffer = await fsPromises.readFile(stitchedMicPath);
        const micStoragePath = `${userId}/${year}/${month}/${sessionId}_mic.mp3`;

        const { data: micData, error: micError } = await this.supabase.storage
          .from('recordings')
          .upload(micStoragePath, micFileBuffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'audio/mpeg',
          });

        if (micError) {
          console.error('[Upload] ❌ Mic track upload failed:', micError);
          // Non-fatal - continue with main upload
        } else {
          micAudioPath = micData.path;
          console.log('[Upload] ✅ Mic track uploaded:', micAudioPath);
        }
      }

      // Upload system track if available
      let systemAudioPath: string | undefined;
      if (stitchedSystemPath && fs.existsSync(stitchedSystemPath)) {
        console.log(
          '[Upload] 📤 Uploading system track to Supabase Storage...'
        );
        const systemFileBuffer = await fsPromises.readFile(stitchedSystemPath);
        const systemStoragePath = `${userId}/${year}/${month}/${sessionId}_system.mp3`;

        const { data: systemData, error: systemError } =
          await this.supabase.storage
            .from('recordings')
            .upload(systemStoragePath, systemFileBuffer, {
              cacheControl: '3600',
              upsert: false,
              contentType: 'audio/mpeg',
            });

        if (systemError) {
          console.error('[Upload] ❌ System track upload failed:', systemError);
          // Non-fatal - continue with main upload
        } else {
          systemAudioPath = systemData.path;
          console.log('[Upload] ✅ System track uploaded:', systemAudioPath);
        }
      }

      // Use access token from the session we already have
      const accessToken = session.access_token;
      if (!accessToken) {
        return {
          success: false,
          error: 'No valid session available. Please sign in again.',
        };
      }

      // Call backend API to create meeting with stitched audio
      console.log('[Upload] 📡 Calling frontend API to create meeting record');
      Sentry.addBreadcrumb('upload', 'Calling frontend API', {
        storagePath,
        fileSizeMB,
        durationSeconds: totalDuration,
      });

      const apiStart = Date.now();
      const response = await fetch(`${config.webApp.url}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          storagePath,
          micAudioPath,
          systemAudioPath,
          originalFilename: `${sessionId}.mp3`,
          fileSizeMB,
          durationSeconds: totalDuration,
          meetingInfo: {
            title: metadata.title,
            startTime: metadata.startTime.toISOString(),
            endTime: metadata.endTime?.toISOString(),
            description: `Auto-detected ${metadata.platform} meeting`,
            meetingLink: metadata.url,
          },
          offRecordPeriods,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Upload] ❌ API request failed (${response.status}):`,
          errorText
        );
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage =
            errorJson.message || errorJson.error || 'Unknown error';
        } catch {
          errorMessage = errorText || `API error: ${response.status}`;
        }

        // Capture API error in Sentry
        Sentry.captureException(
          new Error(`API upload failed: ${errorMessage}`)
        );

        return { success: false, error: `API error: ${errorMessage}` };
      }

      const result = await response.json();
      const apiDuration = Date.now() - apiStart;
      const totalElapsed = Date.now() - startTime;
      console.log(
        `[Upload] ✅ Meeting created successfully in ${apiDuration}ms (total: ${totalElapsed}ms):`,
        {
          meetingId: result.meetingId,
          jobId: result.jobId,
          storagePath: result.storagePath,
        }
      );

      // Add success breadcrumb
      Sentry.addBreadcrumb('upload', 'Upload completed successfully', {
        meetingId: result.meetingId,
        jobId: result.jobId,
        totalElapsed,
      });

      // Set meeting_id and job_id tags for correlation
      Sentry.setTag('meeting_id', result.meetingId);
      Sentry.setTag('job_id', result.jobId);

      // Structured log: Upload completed (Sentry Logs)
      Sentry.captureMessage('Upload completed successfully', {
        level: 'info',
        extra: {
          jobId: result.jobId,
          meetingId: result.meetingId,
          component: 'desktop-app',
          stage: 'upload-complete',
          fileSizeMB,
          durationSeconds: totalDuration,
          totalElapsed,
        },
      });

      return {
        success: true,
        meetingId: result.meetingId,
      };
    } catch (error) {
      const totalElapsed = Date.now() - startTime;
      console.error(
        `[Upload] ❌ Stitched audio upload error after ${totalElapsed}ms:`,
        error
      );

      // Capture unexpected errors in Sentry
      Sentry.captureException(error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Singleton instance
 */
export const uploadService = new UploadService();
