import { ipcMain } from 'electron';
import { authService } from '../lib/auth';
import { config } from '../lib/config';
import * as Sentry from '../lib/sentry';

interface UploadFileParams {
  fileBuffer: ArrayBuffer;
  fileName: string;
  fileType: string;
  fileSizeMB: number;
  meetingInfo?: {
    title: string;
    startTime: string;
    endTime?: string;
    meetingId?: string;
  };
}

interface UploadResponse {
  success: boolean;
  jobId?: string;
  storagePath?: string;
  signedUrl?: string;
  message?: string;
}

/**
 * Register upload IPC handlers for manual file uploads from the dashboard.
 *
 * This handler enables users to upload meeting recordings manually via the
 * desktop app's embedded dashboard. The upload flow:
 * 1. Transfers file from renderer to main process via IPC (as ArrayBuffer)
 * 2. Uploads file to Supabase Storage with user-scoped path
 * 3. Calls frontend API with Bearer token to create meeting/job records
 * 4. Returns job ID for status tracking
 *
 * Security:
 * - Validates user authentication before processing
 * - Uses Bearer token for API calls (not cookies)
 * - Cleans up storage on API failure
 * - Comprehensive Sentry logging for monitoring
 *
 * @example
 * // Called from renderer via window.electronAPI.upload.manualFile()
 * const result = await manualFile(fileBuffer, 'meeting.mp4', 'video/mp4', 150.5, {
 *   title: 'Q4 Planning',
 *   startTime: '2025-01-15T14:00:00.000Z'
 * });
 */
export function registerUploadHandlers(): void {
  /**
   * Handle manual file upload from dashboard
   * This is used when the user uploads a recording via the "Upload Recording" button
   * in the desktop app's embedded dashboard
   */
  ipcMain.handle(
    'upload:manual-file',
    async (_event, params: UploadFileParams): Promise<UploadResponse> => {
      const startTime = Date.now();

      try {
        console.log('[Upload Handler] Manual upload started:', {
          fileName: params.fileName,
          fileSizeMB: params.fileSizeMB,
          meetingTitle: params.meetingInfo?.title,
        });

        // Add Sentry breadcrumb
        Sentry.addBreadcrumb('upload', 'Manual file upload started', {
          fileName: params.fileName,
          fileSizeMB: params.fileSizeMB,
          fileType: params.fileType,
          component: 'desktop-app',
        });

        // Get authenticated session from auth service
        const session = await authService.getSession();

        if (!session?.user) {
          console.error('[Upload Handler] No authenticated session');
          Sentry.captureException(new Error('User not authenticated'));
          return { success: false, message: 'User not authenticated' };
        }

        const user = session.user;
        const supabase = authService.getClient();

        Sentry.setUser(user.id);
        Sentry.setTag('user_id', user.id);

        // Generate unique job ID
        const jobId = crypto.randomUUID();

        // Generate storage path
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        // Extract file extension from filename
        const ext = params.fileName.split('.').pop() || 'mp4';
        const storagePath = `${user.id}/${year}/${month}/${jobId}.${ext}`;

        console.log(
          '[Upload Handler] Uploading to Supabase Storage:',
          storagePath
        );

        // Upload to Supabase Storage
        const uploadStart = Date.now();
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('recordings')
          .upload(storagePath, Buffer.from(params.fileBuffer), {
            cacheControl: '3600',
            upsert: false,
            contentType: params.fileType,
          });

        if (uploadError) {
          console.error('[Upload Handler] Storage upload failed:', uploadError);
          Sentry.captureException(uploadError);
          return {
            success: false,
            message: `Upload failed: ${uploadError.message}`,
          };
        }

        const uploadDuration = Date.now() - uploadStart;
        console.log(
          `[Upload Handler] File uploaded to storage in ${uploadDuration}ms:`,
          uploadData.path
        );

        // Use access token from the session we already have
        const accessToken = session.access_token;
        if (!accessToken) {
          return {
            success: false,
            message: 'No valid session available. Please sign in again.',
          };
        }

        // Call frontend API to create meeting record
        console.log(
          '[Upload Handler] Calling frontend API to create meeting record'
        );
        Sentry.addBreadcrumb('upload', 'Calling frontend API', {
          storagePath,
          fileSizeMB: params.fileSizeMB,
        });

        const apiStart = Date.now();
        const response = await fetch(`${config.webApp.url}/api/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            jobId,
            storagePath,
            originalFilename: params.fileName,
            fileSizeMB: params.fileSizeMB,
            meetingInfo: params.meetingInfo
              ? {
                  title: params.meetingInfo.title,
                  startTime: params.meetingInfo.startTime,
                  endTime: params.meetingInfo.endTime,
                  meetingId: params.meetingInfo.meetingId,
                }
              : undefined,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[Upload Handler] API request failed (${response.status}):`,
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

          // Try to clean up uploaded file
          await supabase.storage.from('recordings').remove([storagePath]);

          // Only capture unexpected errors in Sentry (not validation errors)
          const isValidationError =
            errorMessage.includes('Recording duration') &&
            errorMessage.includes('below the minimum requirement');

          if (!isValidationError) {
            Sentry.captureException(
              new Error(`API upload failed: ${errorMessage}`)
            );
          }

          return { success: false, message: `API error: ${errorMessage}` };
        }

        const result = await response.json();
        const apiDuration = Date.now() - apiStart;
        const totalElapsed = Date.now() - startTime;

        console.log(
          `[Upload Handler] Upload completed in ${apiDuration}ms (total: ${totalElapsed}ms):`,
          {
            meetingId: result.meetingId,
            jobId: result.jobId,
            storagePath: result.storagePath,
          }
        );

        // Add success breadcrumb
        Sentry.addBreadcrumb('upload', 'Manual upload completed successfully', {
          meetingId: result.meetingId,
          jobId: result.jobId,
          totalElapsed,
        });

        Sentry.setTag('meeting_id', result.meetingId);
        Sentry.setTag('job_id', result.jobId);

        // Note: We don't send info-level captureMessage to Sentry to avoid noise
        // Breadcrumbs are sufficient for tracking successful operations

        return {
          success: true,
          jobId: result.jobId,
          storagePath: result.storagePath,
          message: 'Upload successful',
        };
      } catch (error) {
        const totalElapsed = Date.now() - startTime;
        console.error(
          `[Upload Handler] Upload error after ${totalElapsed}ms:`,
          error
        );

        Sentry.captureException(error);

        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}
