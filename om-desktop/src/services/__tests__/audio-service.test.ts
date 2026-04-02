import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioService, AudioSegment } from '../audio-service';
import fs from 'node:fs';

// Mock dependencies
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-om'),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

vi.mock('../../lib/ffmpeg', () => ({
  execFFmpeg: vi.fn(),
}));

describe('AudioService', () => {
  let audioService: AudioService;
  let execFFmpegMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Get the mocked execFFmpeg
    const { execFFmpeg } = await import('../../lib/ffmpeg');
    execFFmpegMock = execFFmpeg as ReturnType<typeof vi.fn>;

    // Set up default mock implementations
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
      size: 1024 * 1024 * 10,
    }); // 10MB
    execFFmpegMock.mockResolvedValue({ stdout: '', stderr: '' });

    audioService = new AudioService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractAudio', () => {
    it('should extract audio from video file successfully', async () => {
      const videoPath = '/tmp/test.mov';
      const expectedAudioPath = '/tmp/test.mp3';

      const result = await audioService.extractAudio(videoPath);

      expect(result.success).toBe(true);
      expect(result.audioPath).toBe(expectedAudioPath);
      expect(execFFmpegMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-i',
          videoPath,
          '-vn',
          '-acodec',
          'libmp3lame',
          '-q:a',
          '2',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-y',
          expectedAudioPath,
        ])
      );
    });

    it('should fail if video file does not exist', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await audioService.extractAudio('/tmp/missing.mov');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(execFFmpegMock).not.toHaveBeenCalled();
    });

    it('should fail if audio file is not created', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // Video exists
        .mockReturnValueOnce(false); // Audio not created

      const result = await audioService.extractAudio('/tmp/test.mov');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not created');
    });

    it('should handle FFmpeg errors gracefully', async () => {
      execFFmpegMock.mockRejectedValue(new Error('FFmpeg encoding failed'));

      const result = await audioService.extractAudio('/tmp/test.mov');

      expect(result.success).toBe(false);
      expect(result.error).toContain('FFmpeg encoding failed');
    });
  });

  describe('extractAudioFromSegments', () => {
    it('should extract audio from multiple segments', async () => {
      const videoPaths = ['/tmp/seg1.mov', '/tmp/seg2.mov', '/tmp/seg3.mov'];

      const results = await audioService.extractAudioFromSegments(videoPaths);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      // Each segment extracts 3 files (mic, system, mixed) = 3 segments * 3 files = 9 calls
      expect(execFFmpegMock).toHaveBeenCalledTimes(9);
    });

    it('should continue processing even if some segments fail', async () => {
      const videoPaths = ['/tmp/seg1.mov', '/tmp/seg2.mov', '/tmp/seg3.mov'];

      // Make second extraction fail
      // Each segment now extracts 3 files (mic, system, mixed)
      execFFmpegMock
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // seg1 mic success
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // seg1 system success
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // seg1 mixed success
        .mockRejectedValueOnce(new Error('Encoding failed')) // seg2 mic fail (causes whole segment to fail)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // seg3 mic success
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // seg3 system success
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // seg3 mixed success

      const results = await audioService.extractAudioFromSegments(videoPaths);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should return empty array for empty input', async () => {
      const results = await audioService.extractAudioFromSegments([]);

      expect(results).toHaveLength(0);
      expect(execFFmpegMock).not.toHaveBeenCalled();
    });
  });

  describe('stitchAudio', () => {
    it('should stitch multiple audio segments successfully', async () => {
      const segments: AudioSegment[] = [
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date('2025-01-01T10:00:00Z'),
          endTime: new Date('2025-01-01T10:05:00Z'),
          durationSeconds: 300,
        },
        {
          segmentNumber: 2,
          audioPath: '/tmp/seg2.mp3',
          startTime: new Date('2025-01-01T10:10:00Z'),
          endTime: new Date('2025-01-01T10:15:00Z'),
          durationSeconds: 300,
        },
      ];

      const sessionId = 'test-session-123';

      const result = await audioService.stitchAudio(segments, sessionId);

      expect(result.success).toBe(true);
      expect(result.stitchedPath).toContain(`stitched-${sessionId}.mp3`);
      expect(result.totalDuration).toBe(605); // 300 + 5 + 300
      expect(result.offRecordPeriods).toHaveLength(1);
      expect(result.offRecordPeriods?.[0]).toEqual({ start: 300, end: 305 });

      // Verify concat list was written
      expect(fs.writeFileSync).toHaveBeenCalled();

      // Verify FFmpeg concat was called
      expect(execFFmpegMock).toHaveBeenCalledWith(
        expect.arrayContaining(['-f', 'concat', '-safe', '0'])
      );
    });

    it('should handle single segment (no silence)', async () => {
      const segments: AudioSegment[] = [
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date('2025-01-01T10:00:00Z'),
          endTime: new Date('2025-01-01T10:05:00Z'),
          durationSeconds: 300,
        },
      ];

      const result = await audioService.stitchAudio(segments, 'test-session');

      expect(result.success).toBe(true);
      expect(result.totalDuration).toBe(300);
      expect(result.offRecordPeriods).toHaveLength(0);
    });

    it('should fail with empty segments array', async () => {
      const result = await audioService.stitchAudio([], 'test-session');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No segments');
      expect(execFFmpegMock).not.toHaveBeenCalled();
    });

    it('should sort segments by segment number', async () => {
      const segments: AudioSegment[] = [
        {
          segmentNumber: 3,
          audioPath: '/tmp/seg3.mp3',
          startTime: new Date('2025-01-01T10:20:00Z'),
          endTime: new Date('2025-01-01T10:25:00Z'),
          durationSeconds: 300,
        },
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date('2025-01-01T10:00:00Z'),
          endTime: new Date('2025-01-01T10:05:00Z'),
          durationSeconds: 300,
        },
        {
          segmentNumber: 2,
          audioPath: '/tmp/seg2.mp3',
          startTime: new Date('2025-01-01T10:10:00Z'),
          endTime: new Date('2025-01-01T10:15:00Z'),
          durationSeconds: 300,
        },
      ];

      const result = await audioService.stitchAudio(segments, 'test-session');

      expect(result.success).toBe(true);
      expect(result.segments?.[0].segmentNumber).toBe(1);
      expect(result.segments?.[1].segmentNumber).toBe(2);
      expect(result.segments?.[2].segmentNumber).toBe(3);
    });

    it('should create silence file if it does not exist', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // Temp dir exists (for ensureTempDir())
        .mockReturnValueOnce(false) // Silence doesn't exist
        .mockReturnValue(true); // Other files exist

      const segments: AudioSegment[] = [
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date(),
          endTime: new Date(),
          durationSeconds: 300,
        },
        {
          segmentNumber: 2,
          audioPath: '/tmp/seg2.mp3',
          startTime: new Date(),
          endTime: new Date(),
          durationSeconds: 300,
        },
      ];

      await audioService.stitchAudio(segments, 'test-session');

      // Should call execFFmpeg twice: once for silence, once for concat
      expect(execFFmpegMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=44100:cl=stereo',
        ])
      );
    });

    it('should handle custom silence gap duration', async () => {
      const segments: AudioSegment[] = [
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date(),
          endTime: new Date(),
          durationSeconds: 300,
        },
        {
          segmentNumber: 2,
          audioPath: '/tmp/seg2.mp3',
          startTime: new Date(),
          endTime: new Date(),
          durationSeconds: 300,
        },
      ];

      const customGap = 10;
      const result = await audioService.stitchAudio(
        segments,
        'test-session',
        customGap
      );

      expect(result.success).toBe(true);
      expect(result.totalDuration).toBe(610); // 300 + 10 + 300
      expect(result.offRecordPeriods?.[0]).toEqual({ start: 300, end: 310 });
    });

    it('should fail if stitched file is not created', async () => {
      // Mock to return false for the final stitched file check
      const mockExistsSync = vi.fn();
      mockExistsSync.mockImplementation((path: string) => {
        // Return false only for the stitched file
        if (path.includes('stitched-')) {
          return false;
        }
        return true; // All other files exist
      });
      (fs.existsSync as ReturnType<typeof vi.fn>) = mockExistsSync;

      const segments: AudioSegment[] = [
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date(),
          endTime: new Date(),
          durationSeconds: 300,
        },
      ];

      const result = await audioService.stitchAudio(segments, 'test-session');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not created');
    });

    it('should handle FFmpeg failure gracefully', async () => {
      execFFmpegMock.mockRejectedValue(new Error('Concat failed'));

      const segments: AudioSegment[] = [
        {
          segmentNumber: 1,
          audioPath: '/tmp/seg1.mp3',
          startTime: new Date(),
          endTime: new Date(),
          durationSeconds: 300,
        },
      ];

      const result = await audioService.stitchAudio(segments, 'test-session');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Concat failed');
    });
  });

  describe('cleanup', () => {
    it('should delete existing files', async () => {
      const files = ['/tmp/file1.mp3', '/tmp/file2.mp3', '/tmp/file3.mp3'];

      await audioService.cleanup(files);

      expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file1.mp3');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file2.mp3');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file3.mp3');
    });

    it('should skip non-existent files', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // file1 exists
        .mockReturnValueOnce(false) // file2 doesn't exist
        .mockReturnValueOnce(true); // file3 exists

      const files = ['/tmp/file1.mp3', '/tmp/file2.mp3', '/tmp/file3.mp3'];

      await audioService.cleanup(files);

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file1.mp3');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file3.mp3');
      expect(fs.unlinkSync).not.toHaveBeenCalledWith('/tmp/file2.mp3');
    });

    it('should continue cleanup even if one deletion fails', async () => {
      (fs.unlinkSync as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        }) // file1 fails
        .mockImplementationOnce(() => {}); // file2 succeeds

      const files = ['/tmp/file1.mp3', '/tmp/file2.mp3'];

      await audioService.cleanup(files);

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should handle empty array', async () => {
      await audioService.cleanup([]);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
