import { app } from 'electron';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

/**
 * Get path to bundled FFmpeg binary
 * Supports both arm64 (Apple Silicon) and x86_64 (Intel) architectures
 */
export function getFFmpegPath(): string {
  const arch = process.arch; // 'arm64' or 'x64'
  const binaryName = arch === 'arm64' ? 'ffmpeg-arm64' : 'ffmpeg-x86_64';

  if (app.isPackaged) {
    // Production: resources/bin/
    return path.join(process.resourcesPath, 'bin', binaryName);
  } else {
    // Development: om-desktop/resources/bin/
    // __dirname is dist-electron, so go up one level to om-desktop/
    return path.join(__dirname, '..', 'resources', 'bin', binaryName);
  }
}

/**
 * Execute FFmpeg command with bundled binary
 * @param args - FFmpeg command arguments
 * @returns Promise with stdout and stderr
 */
export async function execFFmpeg(
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const ffmpegPath = getFFmpegPath();

  // Sanitize args for logging (hide full file paths)
  const sanitizedArgs = args.map((arg) => {
    // Keep flags and options visible
    if (arg.startsWith('-')) {
      return arg;
    }
    // Hide file paths (show only filename)
    if (arg.includes('/')) {
      const parts = arg.split('/');
      return `.../${parts[parts.length - 1]}`;
    }
    return arg;
  });

  console.log(
    '[FFmpeg] Executing:',
    path.basename(ffmpegPath),
    sanitizedArgs.join(' ')
  );
  return execFilePromise(ffmpegPath, args);
}

/**
 * Check if FFmpeg binary exists and is executable
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    const ffmpegPath = getFFmpegPath();
    const { stdout } = await execFilePromise(ffmpegPath, ['-version']);
    console.log('[FFmpeg] Version check passed:', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    console.error('[FFmpeg] Not available:', error);
    return false;
  }
}
