import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractVideoDuration,
  formatDuration,
  formatFileSize,
} from '../meeting-metadata';

// Mock electron module
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/Users/test/om-desktop',
  },
}));

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  default: {
    join: (...args: string[]) => args.join('/'),
  },
  join: (...args: string[]) => args.join('/'),
}));

// Mock get-video-duration
vi.mock('get-video-duration', () => ({
  getVideoDurationInSeconds: vi.fn(),
}));

describe('meeting-metadata', () => {
  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(formatDuration(45)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(125)).toBe('2m 5s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3665)).toBe('1h 1m');
      expect(formatDuration(7200)).toBe('2h 0m');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0s');
    });
  });

  describe('formatFileSize', () => {
    it('should format kilobytes', () => {
      expect(formatFileSize(512000)).toBe('500 KB');
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(5242880)).toBe('5 MB');
      expect(formatFileSize(10485760)).toBe('10 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(5368709120)).toBe('5.0 GB');
      expect(formatFileSize(10737418240)).toBe('10.0 GB');
    });

    it('should handle zero', () => {
      expect(formatFileSize(0)).toBe('0 KB');
    });
  });

  describe('extractVideoDuration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should extract and round video duration', async () => {
      const { getVideoDurationInSeconds } = await import('get-video-duration');
      vi.mocked(getVideoDurationInSeconds).mockResolvedValue(123.456);

      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const duration = await extractVideoDuration('/path/to/video.mov');

      expect(duration).toBe(123);
      expect(getVideoDurationInSeconds).toHaveBeenCalledWith(
        '/path/to/video.mov',
        expect.any(String) // ffprobe path
      );
    });

    it('should return null on error', async () => {
      const { getVideoDurationInSeconds } = await import('get-video-duration');
      vi.mocked(getVideoDurationInSeconds).mockRejectedValue(
        new Error('ffprobe error')
      );

      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const duration = await extractVideoDuration('/path/to/video.mov');

      expect(duration).toBeNull();
    });

    it('should pass custom ffprobe path in development', async () => {
      const { getVideoDurationInSeconds } = await import('get-video-duration');
      vi.mocked(getVideoDurationInSeconds).mockResolvedValue(60.0);

      const fs = await import('fs');
      // Simulate ffprobe found at first path
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await extractVideoDuration('/path/to/video.mov');

      // Should have been called with custom path
      expect(getVideoDurationInSeconds).toHaveBeenCalledWith(
        '/path/to/video.mov',
        expect.stringContaining('node_modules')
      );
    });

    it('should resolve ffprobe path from app root', async () => {
      const { getVideoDurationInSeconds } = await import('get-video-duration');
      vi.mocked(getVideoDurationInSeconds).mockResolvedValue(90.0);

      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await extractVideoDuration('/path/to/video.mov');

      // Should resolve path from app.getAppPath() (not __dirname)
      const callArgs = vi.mocked(getVideoDurationInSeconds).mock.calls[0];
      const ffprobePath = callArgs[1];

      // Verify path starts with app path and includes node_modules
      expect(ffprobePath).toBeTruthy();
      expect(ffprobePath).toContain('/Users/test/om-desktop');
      expect(ffprobePath).toContain('node_modules');
    });

    it('should try multiple ffprobe paths', async () => {
      const { getVideoDurationInSeconds } = await import('get-video-duration');
      vi.mocked(getVideoDurationInSeconds).mockResolvedValue(45.0);

      const fs = await import('fs');
      let callCount = 0;
      vi.mocked(fs.existsSync).mockImplementation(() => {
        callCount++;
        // First path doesn't exist, second path exists
        return callCount > 1;
      });

      await extractVideoDuration('/path/to/video.mov');

      // Should have tried multiple paths
      expect(fs.existsSync).toHaveBeenCalledTimes(2);
    });

    it('should handle case when ffprobe is not found', async () => {
      const { getVideoDurationInSeconds } = await import('get-video-duration');
      vi.mocked(getVideoDurationInSeconds).mockResolvedValue(30.0);

      const fs = await import('fs');
      // No ffprobe path exists
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await extractVideoDuration('/path/to/video.mov');

      // Should call with undefined (fallback to default ffprobe resolution)
      expect(getVideoDurationInSeconds).toHaveBeenCalledWith(
        '/path/to/video.mov',
        undefined
      );
    });
  });
});
