import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MeetingMetadata } from '../../lib/meeting-metadata';

// Mock electron-store before importing the module
vi.mock('electron-store', () => {
  class MockStore {
    private data: Map<string, unknown> = new Map();

    constructor(_options: Record<string, unknown>) {
      this.data.set('uploadQueue', []);
    }

    get(key: string, defaultValue?: unknown) {
      return this.data.get(key) ?? defaultValue;
    }

    set(key: string, value: unknown) {
      this.data.set(key, value);
    }

    delete(key: string) {
      this.data.delete(key);
    }
  }

  return {
    default: MockStore,
  };
});

// Mock fs/promises for file cleanup tests
const mockUnlink = vi.fn();
vi.mock('node:fs/promises', () => ({
  default: {
    unlink: mockUnlink,
  },
}));

// Mock node:fs for file existence checks
const mockExistsSync = vi.fn();
vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

// Mock upload service
vi.mock('../upload-service', () => ({
  uploadService: {
    uploadStitchedAudio: vi
      .fn()
      .mockResolvedValue({ success: true, meetingId: 'test-meeting-id' }),
  },
}));

describe('UploadQueue', () => {
  let uploadQueue: typeof import('../upload-queue').uploadQueue;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true); // By default, files exist

    // Re-import to get fresh instance
    const module = await import('../upload-queue');
    uploadQueue = module.uploadQueue;

    // Clear the queue
    uploadQueue.clearQueue();
  });

  describe('Queue Management', () => {
    it('should add items to queue when queueForLater is called', async () => {
      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Verify queue was updated
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(1);
      expect(status.items[0].sessionId).toBe('session-123');
      expect(status.items[0].stitchedAudioPath).toBe('/path/to/stitched.mp3');
      expect(status.items[0].totalDuration).toBe(300);
    });
  });

  describe('Queue Processing', () => {
    it('should process queue and remove items when successful', async () => {
      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      // Queue an item
      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Process queue (upload service is mocked to succeed)
      await uploadQueue.processQueue();

      // Queue should be empty after successful processing
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });

    it('should call uploadStitchedAudio with correct parameters', async () => {
      const { uploadService } = await import('../upload-service');

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      const offRecordPeriods = [{ start: 300, end: 305 }];

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        offRecordPeriods,
        605
      );

      await uploadQueue.processQueue();

      expect(uploadService.uploadStitchedAudio).toHaveBeenCalledWith(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        offRecordPeriods,
        605,
        undefined, // stitchedMicPath - not provided in test
        undefined // stitchedSystemPath - not provided in test
      );
    });
  });

  describe('Background Processing', () => {
    it('should process queued uploads automatically', async () => {
      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Clear mock calls from queueForLater
      vi.clearAllMocks();

      await uploadQueue.processQueue();

      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });
  });

  describe('Max Retries', () => {
    it('should remove items from queue after max retries exceeded', async () => {
      const { uploadService } = await import('../upload-service');

      // Mock upload to fail
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'Upload failed',
      });

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Process queue multiple times to exceed max retries
      await uploadQueue.processQueue();
      await uploadQueue.processQueue();
      await uploadQueue.processQueue();
      await uploadQueue.processQueue(); // 4th attempt, should remove

      // Queue should be empty (item removed after max retries)
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });

    it('should cleanup local file when max retries exceeded', async () => {
      const { uploadService } = await import('../upload-service');

      // Mock upload to fail with retryable error
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Process queue 4 times to exceed max retries
      await uploadQueue.processQueue();
      await uploadQueue.processQueue();
      await uploadQueue.processQueue();
      await uploadQueue.processQueue();

      // Verify file cleanup was called
      expect(mockUnlink).toHaveBeenCalledWith('/path/to/stitched.mp3');
      expect(mockUnlink).toHaveBeenCalledTimes(1);

      // Verify item was removed from queue
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });
  });

  describe('Validation Error Handling', () => {
    it('should detect validation error for minimum duration requirement', async () => {
      const { uploadService } = await import('../upload-service');

      // Mock upload to fail with validation error
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error:
          'Audio file duration (0.17s) is below the minimum requirement of 5 seconds',
      });

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Process queue once
      await uploadQueue.processQueue();

      // Verify item was immediately removed (no retries)
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);

      // Verify file cleanup was called
      expect(mockUnlink).toHaveBeenCalledWith('/path/to/stitched.mp3');
    });

    it('should detect validation error for duration and minimum keywords', async () => {
      const { uploadService } = await import('../upload-service');

      // Mock upload to fail with validation error using different wording
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'Meeting duration does not meet minimum requirements',
      });

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-456',
        '/path/to/another-stitched.mp3',
        metadata,
        [],
        150
      );

      await uploadQueue.processQueue();

      // Verify immediate removal
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);

      // Verify file cleanup
      expect(mockUnlink).toHaveBeenCalledWith('/path/to/another-stitched.mp3');
    });

    it('should cleanup file on validation error without retrying', async () => {
      const { uploadService } = await import('../upload-service');

      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'File is below the minimum requirement',
      });

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-789',
        '/path/to/validation-fail.mp3',
        metadata,
        [],
        100
      );

      // Process once - should immediately cleanup and remove
      await uploadQueue.processQueue();

      // File cleanup should be called immediately
      expect(mockUnlink).toHaveBeenCalledWith('/path/to/validation-fail.mp3');
      expect(mockUnlink).toHaveBeenCalledTimes(1);

      // Process again - should not retry (queue empty)
      await uploadQueue.processQueue();
      expect(mockUnlink).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should NOT detect non-validation errors as validation errors', async () => {
      const { uploadService } = await import('../upload-service');

      // Mock retryable error (network, auth, etc.)
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'Network timeout',
      });

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-retry',
        '/path/to/retryable.mp3',
        metadata,
        [],
        500
      );

      // Process once
      await uploadQueue.processQueue();

      // Should NOT cleanup file yet (retryable error)
      expect(mockUnlink).not.toHaveBeenCalled();

      // Item should still be in queue for retry
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(1);
      expect(status.items[0].retries).toBe(1);
    });
  });

  describe('File Cleanup Error Handling', () => {
    it('should ignore ENOENT errors during cleanup (file already deleted)', async () => {
      const { uploadService } = await import('../upload-service');

      // Mock validation error
      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'Audio file is below the minimum requirement',
      });

      // Mock unlink to throw ENOENT (file doesn't exist)
      const enoentError = new Error('ENOENT: no such file or directory');
      (enoentError as NodeJS.ErrnoException).code = 'ENOENT';
      mockUnlink.mockRejectedValue(enoentError);

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-enoent',
        '/path/to/missing.mp3',
        metadata,
        [],
        200
      );

      // Should not throw despite ENOENT error
      await expect(uploadQueue.processQueue()).resolves.not.toThrow();

      // Verify unlink was called
      expect(mockUnlink).toHaveBeenCalledWith('/path/to/missing.mp3');

      // Item should be removed from queue despite cleanup "failure"
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });

    it('should log but not throw on other cleanup errors', async () => {
      const { uploadService } = await import('../upload-service');

      vi.mocked(uploadService.uploadStitchedAudio).mockResolvedValue({
        success: false,
        error: 'File is below the minimum requirement',
      });

      // Mock unlink to throw permission error
      const permError = new Error('EPERM: operation not permitted');
      (permError as NodeJS.ErrnoException).code = 'EPERM';
      mockUnlink.mockRejectedValue(permError);

      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-perm',
        '/path/to/locked.mp3',
        metadata,
        [],
        250
      );

      // Should not throw despite permission error
      await expect(uploadQueue.processQueue()).resolves.not.toThrow();

      // Item should still be removed from queue
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });

    it('should continue processing queue even if cleanup fails', async () => {
      const { uploadService } = await import('../upload-service');

      // First item: validation error with cleanup failure
      vi.mocked(uploadService.uploadStitchedAudio)
        .mockResolvedValueOnce({
          success: false,
          error: 'File is below the minimum requirement',
        })
        // Second item: success
        .mockResolvedValueOnce({
          success: true,
          meetingId: 'meeting-success',
        });

      mockUnlink.mockRejectedValueOnce(new Error('Cleanup failed'));

      const metadata1: MeetingMetadata = {
        title: 'Test Meeting 1',
        platform: 'zoom',
        url: 'https://zoom.us/test1',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window 1',
        appName: 'Zoom',
        filename: 'test1.mp3',
      };

      const metadata2: MeetingMetadata = {
        title: 'Test Meeting 2',
        platform: 'zoom',
        url: 'https://zoom.us/test2',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window 2',
        appName: 'Zoom',
        filename: 'test2.mp3',
      };

      await uploadQueue.queueForLater(
        'session-fail',
        '/path/to/fail.mp3',
        metadata1,
        [],
        100
      );

      await uploadQueue.queueForLater(
        'session-success',
        '/path/to/success.mp3',
        metadata2,
        [],
        600
      );

      // Process queue - should handle both items
      await uploadQueue.processQueue();

      // Both items should be removed (first failed cleanup, second succeeded)
      const status = uploadQueue.getQueueStatus();
      expect(status.count).toBe(0);
    });
  });

  describe('Date Deserialization', () => {
    it('should deserialize Date objects from stored queue', async () => {
      // Create metadata with Date objects
      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date('2025-01-15T10:00:00Z'),
        endTime: new Date('2025-01-15T11:00:00Z'),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      // Queue the item
      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      // Get the queued item
      const status = uploadQueue.getQueueStatus();
      const queuedItem = status.items[0];

      // Verify dates are Date objects (not strings)
      expect(queuedItem.metadata.startTime).toBeInstanceOf(Date);
      expect(queuedItem.metadata.endTime).toBeInstanceOf(Date);
      expect(queuedItem.queuedAt).toBeInstanceOf(Date);

      // Verify toISOString() works
      expect(() => queuedItem.metadata.startTime.toISOString()).not.toThrow();
      expect(queuedItem.metadata.startTime.toISOString()).toBe(
        '2025-01-15T10:00:00.000Z'
      );
    });

    it('should handle missing endTime gracefully', async () => {
      const metadata: MeetingMetadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date('2025-01-15T10:00:00Z'),
        // No endTime
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      await uploadQueue.queueForLater(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      const status = uploadQueue.getQueueStatus();
      const queuedItem = status.items[0];

      expect(queuedItem.metadata.endTime).toBeUndefined();
      expect(queuedItem.metadata.startTime).toBeInstanceOf(Date);
    });
  });
});
