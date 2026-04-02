import { randomUUID } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import Store from 'electron-store';
import { uploadService } from './upload-service';
import type { MeetingMetadata } from '../lib/meeting-metadata';

/**
 * Queued upload item (stitched audio)
 */
export interface QueuedUpload {
  id: string;
  sessionId: string;
  stitchedAudioPath: string;
  stitchedMicPath?: string;
  stitchedSystemPath?: string;
  metadata: MeetingMetadata;
  offRecordPeriods: Array<{
    placeholderStart: number;
    placeholderEnd: number;
    actualDuration: number;
  }>;
  totalDuration: number;
  queuedAt: Date;
  retries: number;
  lastError?: string;
}

/**
 * Queue data schema
 */
interface QueueData {
  uploadQueue: QueuedUpload[];
}

/**
 * UploadQueue - Manages offline upload queue with persistence
 */
export class UploadQueue {
  private queue: QueuedUpload[] = [];
  private store: Store<QueueData>;
  private isProcessing: boolean = false;

  constructor() {
    this.store = new Store<QueueData>({
      name: 'upload-queue',
      defaults: {
        uploadQueue: [],
      },
    });

    // Load queue from storage and deserialize dates
    // @ts-expect-error - electron-store types don't expose get method properly
    const storedQueue = this.store.get('uploadQueue', []);
    this.queue = this.deserializeQueue(storedQueue);
    console.log(
      '[UploadQueue] Initialized with',
      this.queue.length,
      'queued items'
    );
  }

  /**
   * Deserialize queue from storage (convert date strings back to Date objects)
   */
  private deserializeQueue(items: QueuedUpload[]): QueuedUpload[] {
    return items.map((item) => ({
      ...item,
      queuedAt: new Date(item.queuedAt),
      metadata: {
        ...item.metadata,
        startTime: new Date(item.metadata.startTime),
        endTime: item.metadata.endTime
          ? new Date(item.metadata.endTime)
          : undefined,
      },
    }));
  }

  /**
   * Add a stitched audio upload to the queue for later processing
   */
  async queueForLater(
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
  ): Promise<void> {
    const item: QueuedUpload = {
      id: randomUUID(),
      sessionId,
      stitchedAudioPath,
      stitchedMicPath,
      stitchedSystemPath,
      metadata,
      offRecordPeriods,
      totalDuration,
      queuedAt: new Date(),
      retries: 0,
    };

    this.queue.push(item);
    this.saveQueue();

    console.log('[UploadQueue] Added stitched audio to queue:', {
      id: item.id,
      sessionId,
      title: metadata.title,
      queueSize: this.queue.length,
    });
  }

  /**
   * Process the queue (upload all pending items)
   * Called automatically on authentication events.
   */
  async processQueue(): Promise<void> {
    // Check if already processing
    if (this.isProcessing) {
      console.log('[UploadQueue] Already processing queue');
      return;
    }

    if (this.queue.length === 0) {
      console.log('[UploadQueue] Queue is empty');
      return;
    }

    this.isProcessing = true;
    console.log(
      '[UploadQueue] Processing queue with',
      this.queue.length,
      'items'
    );

    // Process each item sequentially
    const itemsToProcess = [...this.queue]; // Copy to avoid modification during iteration

    for (const item of itemsToProcess) {
      try {
        console.log('[UploadQueue] Processing item:', {
          id: item.id,
          sessionId: item.sessionId,
          title: item.metadata.title,
          retries: item.retries,
        });

        // Check if file still exists before attempting upload
        const fs = await import('node:fs');
        if (!fs.existsSync(item.stitchedAudioPath)) {
          console.log(
            '[UploadQueue] File no longer exists, removing from queue:',
            item.stitchedAudioPath
          );
          this.removeFromQueue(item.id);
          continue; // Skip to next item
        }

        // Upload stitched audio
        const result = await uploadService.uploadStitchedAudio(
          item.sessionId,
          item.stitchedAudioPath,
          item.metadata,
          item.offRecordPeriods,
          item.totalDuration,
          item.stitchedMicPath,
          item.stitchedSystemPath
        );

        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        // Success - remove from queue
        this.removeFromQueue(item.id);
        console.log('[UploadQueue] Successfully uploaded:', item.id);
      } catch (error) {
        console.error('[UploadQueue] Failed to upload:', error);

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Check if this is a validation error (non-retryable)
        // Validation errors contain "below the minimum requirement" or similar
        const isValidationError =
          errorMessage.includes('below the minimum requirement') ||
          (errorMessage.includes('duration') &&
            errorMessage.includes('minimum'));

        if (isValidationError) {
          console.log(
            '[UploadQueue] Validation error, removing from queue and cleaning up:',
            item.id
          );

          // Clean up local stitched audio files
          await this.cleanupLocalFile(item.stitchedAudioPath);
          if (item.stitchedMicPath) {
            await this.cleanupLocalFile(item.stitchedMicPath);
          }
          if (item.stitchedSystemPath) {
            await this.cleanupLocalFile(item.stitchedSystemPath);
          }

          // Remove from queue without retry
          this.removeFromQueue(item.id);
          continue; // Skip retry logic
        }

        // Increment retry count for retryable errors
        const queuedItem = this.queue.find((i) => i.id === item.id);
        if (queuedItem) {
          queuedItem.retries++;
          queuedItem.lastError = errorMessage;

          // Remove if max retries exceeded (3 attempts on auth = reasonable limit)
          if (queuedItem.retries > 3) {
            console.log(
              '[UploadQueue] Max retries exceeded, removing and cleaning up:',
              item.id
            );

            // Clean up local stitched audio files
            await this.cleanupLocalFile(item.stitchedAudioPath);
            if (item.stitchedMicPath) {
              await this.cleanupLocalFile(item.stitchedMicPath);
            }
            if (item.stitchedSystemPath) {
              await this.cleanupLocalFile(item.stitchedSystemPath);
            }

            this.removeFromQueue(item.id);
            // No notification - item was already queued, user knows it failed
          } else {
            this.saveQueue();
          }
        }
      }
    }

    this.isProcessing = false;
    console.log(
      '[UploadQueue] Queue processing complete, remaining:',
      this.queue.length
    );
  }

  /**
   * Clean up local stitched audio file
   */
  private async cleanupLocalFile(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
      console.log('[UploadQueue] Deleted local stitched audio:', filePath);
    } catch (error) {
      // Ignore ENOENT errors (file doesn't exist)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[UploadQueue] Cleanup error:', error);
      }
      // Don't throw - cleanup failure is non-critical
    }
  }

  /**
   * Remove an item from the queue
   */
  private removeFromQueue(id: string): void {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveQueue();
    }
  }

  /**
   * Save queue to persistent storage
   */
  private saveQueue(): void {
    // @ts-expect-error - electron-store types don't expose set method properly
    this.store.set('uploadQueue', this.queue);
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): { count: number; items: QueuedUpload[] } {
    return {
      count: this.queue.length,
      items: [...this.queue],
    };
  }

  /**
   * Clear the entire queue
   */
  clearQueue(): void {
    console.log('[UploadQueue] Clearing queue');
    this.queue = [];
    this.saveQueue();
  }
}

/**
 * Singleton instance
 */
export const uploadQueue = new UploadQueue();
