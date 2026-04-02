import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { execFFmpeg } from '../lib/ffmpeg';
import { config } from '../lib/config';

/**
 * Default silence gap duration (in seconds) inserted between on-record segments
 */
export const DEFAULT_SILENCE_GAP_SECONDS = 5;

/**
 * Result of audio extraction
 */
export interface AudioExtractionResult {
  success: boolean;
  audioPath?: string;
  micAudioPath?: string;
  systemAudioPath?: string;
  error?: string;
}

/**
 * Audio segment for stitching
 */
export interface AudioSegment {
  segmentNumber: number;
  audioPath: string;
  micAudioPath?: string;
  systemAudioPath?: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

/**
 * Result of audio stitching
 */
export interface AudioStitchResult {
  success: boolean;
  stitchedPath?: string;
  stitchedMicPath?: string;
  stitchedSystemPath?: string;
  totalDuration?: number;
  segments?: AudioSegment[];
  offRecordPeriods?: Array<{ start: number; end: number }>;
  error?: string;
}

/**
 * AudioService - Handles audio extraction and stitching for meeting recordings
 */
export class AudioService {
  private readonly tempDir: string;
  private tempDirInitialized = false;

  constructor() {
    // Use app's temp directory for audio processing
    // Handle case where app might not be fully initialized (e.g., in tests)
    try {
      this.tempDir = path.join(app.getPath('temp'), 'om-audio');
    } catch {
      // Fallback for test environments
      this.tempDir = path.join('/tmp', 'om-audio');
    }
  }

  /**
   * Ensure temp directory exists (lazy initialization)
   */
  private ensureTempDir(): void {
    if (!this.tempDirInitialized) {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
      }
      this.tempDirInitialized = true;
    }
  }

  /**
   * Get path to bundled FFprobe binary (same pattern as FFmpeg)
   */
  private getFFprobePath(): string {
    const arch = process.arch;
    const binaryName = arch === 'arm64' ? 'ffprobe-arm64' : 'ffprobe-x86_64';

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'bin', binaryName);
    } else {
      // __dirname is dist-electron, so go up one level to om-desktop/
      return path.join(__dirname, '..', 'resources', 'bin', binaryName);
    }
  }

  /**
   * Count the number of audio streams in a video file using ffprobe
   * @param videoPath - Path to video file
   * @returns Number of audio streams (defaults to 2 if detection fails)
   */
  private async countAudioStreams(videoPath: string): Promise<number> {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFilePromise = promisify(execFile);

      const ffprobePath = this.getFFprobePath();

      const { stdout } = await execFilePromise(ffprobePath, [
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        videoPath,
      ]);

      // Count lines in output (each line is an audio stream index)
      const streamCount = stdout
        .trim()
        .split('\n')
        .filter((line) => line).length;
      return streamCount > 0 ? streamCount : 2; // Default to 2 if no streams detected
    } catch (error) {
      // If ffprobe is not available or fails, default to 2 (typical case: system audio + mic)
      console.warn(
        '[AudioService] ffprobe failed, assuming 2 audio streams:',
        error
      );
      return 2;
    }
  }

  /**
   * Extract audio from video file (.mov → .mp3)
   * @param videoPath - Path to .mov file
   * @returns Path to extracted .mp3 file
   */
  async extractAudio(videoPath: string): Promise<AudioExtractionResult> {
    try {
      console.log('[AudioService] Extracting audio from:', videoPath);

      if (!fs.existsSync(videoPath)) {
        return {
          success: false,
          error: `Video file not found: ${videoPath}`,
        };
      }

      // Validate file size to prevent resource exhaustion
      const fileSizeBytes = fs.statSync(videoPath).size;
      const fileSizeMB = fileSizeBytes / 1024 / 1024;
      const maxFileSizeMB = config.recording.maxFileSizeMB;
      if (fileSizeMB > maxFileSizeMB) {
        return {
          success: false,
          error: `File too large: ${fileSizeMB.toFixed(2)}MB (max ${maxFileSizeMB}MB)`,
        };
      }

      // Generate output path (same name, .mp3 extension)
      const audioPath = videoPath.replace('.mov', '.mp3');

      // Count audio streams to determine the right approach
      const audioStreamCount = await this.countAudioStreams(videoPath);
      console.log(
        `[AudioService] File has ${audioStreamCount} audio stream(s)`
      );

      if (audioStreamCount === 0) {
        return {
          success: false,
          error: 'No audio streams found in video file',
        };
      }

      // Extract tracks separately for user identification
      let micAudioPath: string | undefined;
      let systemAudioPath: string | undefined;

      if (audioStreamCount >= 2) {
        // Extract microphone track (track 1)
        // NOTE: Native recorder adds system audio as track 0, mic audio as track 1
        micAudioPath = videoPath.replace('.mov', '_mic.mp3');
        console.log('[AudioService] Extracting mic track to:', micAudioPath);

        await execFFmpeg([
          '-i',
          videoPath,
          '-vn',
          '-map',
          '0:a:1', // Select second audio stream (mic audio)
          '-acodec',
          'libmp3lame',
          '-q:a',
          '2',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-y',
          micAudioPath,
        ]);

        // Extract system audio track (track 0)
        systemAudioPath = videoPath.replace('.mov', '_system.mp3');
        console.log(
          '[AudioService] Extracting system track to:',
          systemAudioPath
        );

        await execFFmpeg([
          '-i',
          videoPath,
          '-vn',
          '-map',
          '0:a:0', // Select first audio stream (system audio)
          '-acodec',
          'libmp3lame',
          '-q:a',
          '2',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-y',
          systemAudioPath,
        ]);

        // Create mixed audio for backwards compatibility
        console.log('[AudioService] Creating mixed audio for processing');
        await execFFmpeg([
          '-i',
          videoPath,
          '-vn',
          '-filter_complex',
          `amix=inputs=${audioStreamCount}:duration=first:dropout_transition=2`,
          '-acodec',
          'libmp3lame',
          '-q:a',
          '2',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-y',
          audioPath,
        ]);
      } else {
        // Single audio stream - just extract it
        console.log(
          '[AudioService] Single audio stream detected, extracting as mixed audio'
        );
        await execFFmpeg([
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
          audioPath,
        ]);
      }

      console.log('[AudioService] Audio extraction completed successfully');

      // Verify mixed file was created
      if (!fs.existsSync(audioPath)) {
        return {
          success: false,
          error: 'Mixed audio file was not created',
        };
      }

      // Log extracted audio sizes
      const mixedSizeMB = fs.statSync(audioPath).size / 1024 / 1024;
      console.log(
        `[AudioService] Mixed audio size: ${mixedSizeMB.toFixed(2)}MB`
      );

      if (micAudioPath && fs.existsSync(micAudioPath)) {
        const micSizeMB = fs.statSync(micAudioPath).size / 1024 / 1024;
        console.log(`[AudioService] Mic audio size: ${micSizeMB.toFixed(2)}MB`);
      }

      if (systemAudioPath && fs.existsSync(systemAudioPath)) {
        const systemSizeMB = fs.statSync(systemAudioPath).size / 1024 / 1024;
        console.log(
          `[AudioService] System audio size: ${systemSizeMB.toFixed(2)}MB`
        );
      }

      return {
        success: true,
        audioPath,
        micAudioPath,
        systemAudioPath,
      };
    } catch (error) {
      console.error('[AudioService] Audio extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract audio from multiple video segments
   * @param videoPaths - Array of .mov file paths
   * @returns Array of extracted .mp3 file paths
   */
  async extractAudioFromSegments(
    videoPaths: string[]
  ): Promise<AudioExtractionResult[]> {
    console.log(
      `[AudioService] Extracting audio from ${videoPaths.length} segments`
    );

    const results: AudioExtractionResult[] = [];

    for (let i = 0; i < videoPaths.length; i++) {
      const videoPath = videoPaths[i];
      console.log(
        `[AudioService] Processing segment ${i + 1}/${videoPaths.length}`
      );

      const result = await this.extractAudio(videoPath);
      results.push(result);

      if (!result.success) {
        console.error(
          `[AudioService] Failed to extract segment ${i + 1}:`,
          result.error
        );
        // Continue processing remaining segments
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[AudioService] Extracted ${successCount}/${videoPaths.length} segments successfully`
    );

    return results;
  }

  /**
   * Clean up temporary audio files
   * @param audioPaths - Array of audio file paths to delete
   */
  async cleanup(audioPaths: string[]): Promise<void> {
    for (const audioPath of audioPaths) {
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          console.log('[AudioService] Cleaned up:', audioPath);
        }
      } catch (error) {
        console.error('[AudioService] Cleanup error:', error);
        // Continue cleanup even if one fails
      }
    }
  }

  /**
   * Create a silence audio file
   * @param durationSeconds - Length of silence in seconds
   * @param outputPath - Where to save the silence file
   */
  private async createSilence(
    durationSeconds: number,
    outputPath: string
  ): Promise<void> {
    console.log(
      `[AudioService] Creating ${durationSeconds}s silence file:`,
      outputPath
    );

    // Generate silence using FFmpeg
    // -f lavfi: use libavfilter virtual input device
    // -i anullsrc: null audio source (silence)
    // -t: duration
    await execFFmpeg([
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=stereo`,
      '-t',
      String(durationSeconds),
      '-q:a',
      '9', // Lower quality for silence (smaller file)
      '-acodec',
      'libmp3lame',
      '-y',
      outputPath,
    ]);

    console.log('[AudioService] Silence file created');
  }

  /**
   * Stitch multiple audio segments together with silence gaps between them
   * @param segments - Array of audio segments with metadata
   * @param sessionId - Unique session identifier
   * @param silenceGapSeconds - Duration of silence between segments (default: 5 seconds for off-record placeholders)
   * @returns Stitched audio file path and metadata
   */
  async stitchAudio(
    segments: AudioSegment[],
    sessionId: string,
    silenceGapSeconds: number = DEFAULT_SILENCE_GAP_SECONDS
  ): Promise<AudioStitchResult> {
    this.ensureTempDir();

    try {
      console.log(
        `[AudioService] Stitching ${segments.length} audio segments with ${silenceGapSeconds}s gaps`
      );

      if (segments.length === 0) {
        return {
          success: false,
          error: 'No segments to stitch',
        };
      }

      // Sort segments by segment number
      const sortedSegments = [...segments].sort(
        (a, b) => a.segmentNumber - b.segmentNumber
      );

      // Create silence file
      const silencePath = path.join(
        this.tempDir,
        `silence-${silenceGapSeconds}s.mp3`
      );
      if (!fs.existsSync(silencePath)) {
        await this.createSilence(silenceGapSeconds, silencePath);
      }

      // Create concat list file for FFmpeg
      const concatListPath = path.join(this.tempDir, `concat-${sessionId}.txt`);
      const concatLines: string[] = [];

      // Track off-record periods (gaps between segments)
      const offRecordPeriods: Array<{ start: number; end: number }> = [];
      let currentOffset = 0;

      for (let i = 0; i < sortedSegments.length; i++) {
        const segment = sortedSegments[i];

        // Add segment audio
        concatLines.push(`file '${segment.audioPath}'`);
        currentOffset += segment.durationSeconds;

        // Add silence between segments (except after last segment)
        if (i < sortedSegments.length - 1) {
          concatLines.push(`file '${silencePath}'`);

          // Track this as an off-record period
          offRecordPeriods.push({
            start: currentOffset,
            end: currentOffset + silenceGapSeconds,
          });

          currentOffset += silenceGapSeconds;
        }
      }

      // Write concat list to file
      fs.writeFileSync(concatListPath, concatLines.join('\n'), 'utf-8');
      console.log('[AudioService] Concat list created:', concatListPath);

      // Output stitched file path
      const stitchedPath = path.join(this.tempDir, `stitched-${sessionId}.mp3`);

      // Stitch using FFmpeg concat
      // -f concat: use concat demuxer
      // -safe 0: allow absolute paths
      // -i: input concat list file
      // -c copy: copy streams without re-encoding (fast!)
      await execFFmpeg([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c',
        'copy',
        '-y',
        stitchedPath,
      ]);

      console.log('[AudioService] Audio stitched successfully:', stitchedPath);

      // Verify stitched file exists
      if (!fs.existsSync(stitchedPath)) {
        return {
          success: false,
          error: 'Stitched audio file was not created',
        };
      }

      const fileSizeMB = fs.statSync(stitchedPath).size / 1024 / 1024;
      console.log(
        `[AudioService] Stitched audio size: ${fileSizeMB.toFixed(2)}MB`
      );

      // Stitch mic and system tracks separately if they exist
      let stitchedMicPath: string | undefined;
      let stitchedSystemPath: string | undefined;

      const hasMicTracks = sortedSegments.some((seg) => seg.micAudioPath);
      const hasSystemTracks = sortedSegments.some((seg) => seg.systemAudioPath);

      if (hasMicTracks) {
        console.log('[AudioService] Stitching mic tracks separately...');
        const micConcatListPath = path.join(
          this.tempDir,
          `concat-mic-${sessionId}.txt`
        );
        const micConcatLines: string[] = [];

        for (let i = 0; i < sortedSegments.length; i++) {
          const segment = sortedSegments[i];
          if (segment.micAudioPath) {
            micConcatLines.push(`file '${segment.micAudioPath}'`);
            if (i < sortedSegments.length - 1) {
              micConcatLines.push(`file '${silencePath}'`);
            }
          }
        }

        fs.writeFileSync(micConcatListPath, micConcatLines.join('\n'), 'utf-8');
        stitchedMicPath = path.join(
          this.tempDir,
          `stitched-mic-${sessionId}.mp3`
        );

        await execFFmpeg([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          micConcatListPath,
          '-c',
          'copy',
          '-y',
          stitchedMicPath,
        ]);

        fs.unlinkSync(micConcatListPath);
        console.log('[AudioService] Mic track stitched:', stitchedMicPath);
      }

      if (hasSystemTracks) {
        console.log('[AudioService] Stitching system tracks separately...');
        const systemConcatListPath = path.join(
          this.tempDir,
          `concat-system-${sessionId}.txt`
        );
        const systemConcatLines: string[] = [];

        for (let i = 0; i < sortedSegments.length; i++) {
          const segment = sortedSegments[i];
          if (segment.systemAudioPath) {
            systemConcatLines.push(`file '${segment.systemAudioPath}'`);
            if (i < sortedSegments.length - 1) {
              systemConcatLines.push(`file '${silencePath}'`);
            }
          }
        }

        fs.writeFileSync(
          systemConcatListPath,
          systemConcatLines.join('\n'),
          'utf-8'
        );
        stitchedSystemPath = path.join(
          this.tempDir,
          `stitched-system-${sessionId}.mp3`
        );

        await execFFmpeg([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          systemConcatListPath,
          '-c',
          'copy',
          '-y',
          stitchedSystemPath,
        ]);

        fs.unlinkSync(systemConcatListPath);
        console.log(
          '[AudioService] System track stitched:',
          stitchedSystemPath
        );
      }

      // Calculate total duration
      const totalDuration = currentOffset;

      // Cleanup concat list
      fs.unlinkSync(concatListPath);

      return {
        success: true,
        stitchedPath,
        stitchedMicPath,
        stitchedSystemPath,
        totalDuration,
        segments: sortedSegments,
        offRecordPeriods,
      };
    } catch (error) {
      console.error('[AudioService] Audio stitching failed:', error);
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
export const audioService = new AudioService();
