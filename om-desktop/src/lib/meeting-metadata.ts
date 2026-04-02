import type { MeetingWindow } from '../types/electron';

/**
 * Metadata extracted from a meeting window
 */
export interface MeetingMetadata {
  title: string;
  platform: 'zoom' | 'meet' | 'teams' | 'slack' | 'manual';
  windowTitle: string;
  appName: string;
  url?: string;
  meetingCode?: string;
  startTime: Date;
  endTime?: Date;
  fileSizeMB?: number;
  durationSeconds?: number;
  filename?: string;
  displayId?: number; // For manual recordings of screens
}

/**
 * Extract title from Zoom window
 * Patterns:
 * - "Zoom Meeting" → "Zoom Meeting"
 * - "Zoom Meeting - Team Standup" → "Team Standup"
 * - "Zoom - Team Standup" → "Team Standup"
 */
function extractZoomTitle(windowTitle: string): string {
  const patterns = [
    /Zoom Meeting - (.+)/,
    /Zoom - (.+)/,
    /(.+) - Zoom Meeting/,
  ];

  for (const pattern of patterns) {
    const match = windowTitle.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return 'Zoom Meeting';
}

/**
 * Extract title from Google Meet window
 * Patterns:
 * - "Meet - abc-defg-hij" → "Google Meet (abc-defg-hij)"
 * - "Meet - Team Standup" → "Team Standup"
 * - "Team Standup - Google Meet" → "Team Standup"
 * - "Team Standup - Meet" → "Team Standup"
 */
function extractMeetTitle(windowTitle: string, _url?: string): string {
  // Remove emojis and extra whitespace for matching
  const cleanTitle = windowTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

  // Pattern 1: "Title - Meet" or "Title - Google Meet" (title comes first)
  const titleFirstMatch = cleanTitle.match(/^(.+?) - (?:Google )?Meet$/);
  if (titleFirstMatch && titleFirstMatch[1]) {
    const title = titleFirstMatch[1].trim();
    // Exclude the meeting code pattern
    if (!title.match(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)) {
      return title;
    }
  }

  // Pattern 2: "Meet - Title" (meet comes first)
  const meetFirstMatch = cleanTitle.match(/^(?:Google )?Meet - (.+)$/);
  if (meetFirstMatch && meetFirstMatch[1]) {
    const title = meetFirstMatch[1].trim();
    // Check if it's a meeting code
    if (title.match(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)) {
      return `Google Meet (${title})`;
    }
    // Otherwise it's a meeting name
    return title;
  }

  return 'Google Meet';
}

/**
 * Extract title from Microsoft Teams window
 * Patterns:
 * - "Microsoft Teams Meeting | Team Standup" → "Team Standup"
 * - "Team Standup | Microsoft Teams" → "Team Standup"
 * - "Microsoft Teams - Meeting" → "Teams Meeting"
 */
function extractTeamsTitle(windowTitle: string): string {
  const pipeMatch = windowTitle.match(/(?:Microsoft Teams Meeting ?\|) (.+)/);
  if (pipeMatch && pipeMatch[1]) {
    return pipeMatch[1].trim();
  }

  const reversePipeMatch = windowTitle.match(/(.+) \| Microsoft Teams/);
  if (reversePipeMatch && reversePipeMatch[1]) {
    return reversePipeMatch[1].trim();
  }

  return 'Teams Meeting';
}

/**
 * Extract title from Slack window
 * Patterns:
 * - "Slack | #engineering huddle" → "#engineering huddle"
 * - "Huddle - #general" → "#general huddle"
 * - "Huddle: #general - Chip - Slack" → "#general huddle"
 * - "Slack Call" → "Slack Huddle"
 */
function extractSlackTitle(windowTitle: string): string {
  // Remove emojis for matching
  const cleanTitle = windowTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

  // Pattern 1: "Huddle: #channel"
  const huddleColonMatch = cleanTitle.match(/Huddle:\s*(#[a-z0-9-]+)/i);
  if (huddleColonMatch && huddleColonMatch[1]) {
    return `${huddleColonMatch[1]} huddle`;
  }

  // Pattern 2: "Slack | #channel" or "Huddle - #channel"
  const channelMatch = cleanTitle.match(
    /(?:Slack \||Huddle -)\s*(#[a-z0-9-]+)/i
  );
  if (channelMatch && channelMatch[1]) {
    return cleanTitle.includes('huddle')
      ? `${channelMatch[1]} huddle`
      : channelMatch[1];
  }

  if (cleanTitle.includes('Huddle')) {
    return 'Slack Huddle';
  }

  return 'Slack Call';
}

/**
 * Remove browser name artifacts and clean up title
 */
function cleanMeetingTitle(title: string): string {
  return title
    .replace(/\s*-\s*Google Chrome$/i, '')
    .replace(/\s*-\s*Brave$/i, '')
    .replace(/\s*-\s*Safari$/i, '')
    .replace(/\s*\(.*?\)\s*$/, '') // Remove trailing parentheticals
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract meeting metadata from a detected window
 */
export function extractMeetingMetadata(
  window: MeetingWindow,
  startTime: Date = new Date()
): MeetingMetadata {
  let title: string;
  let meetingCode: string | undefined;

  switch (window.platform) {
    case 'zoom':
      title = extractZoomTitle(window.windowTitle);
      break;

    case 'meet': {
      title = extractMeetTitle(window.windowTitle, window.url);
      // Extract meeting code from URL (validate scheme for security)
      if (window.url) {
        try {
          const urlObj = new URL(window.url);
          if (['http:', 'https:'].includes(urlObj.protocol)) {
            const codeMatch = urlObj.href.match(
              /meet\.google\.com\/([a-z-]{3,})/
            );
            if (codeMatch?.[1]) {
              const code = codeMatch[1];
              // Ensure proper Google Meet format (minimum 2 hyphens: xxx-xxxx-xxx)
              const hyphenCount = (code.match(/-/g) || []).length;
              if (hyphenCount >= 2) {
                meetingCode = code;
              }
            }
          }
        } catch {
          // Invalid URL, skip meeting code extraction
        }
      }
      break;
    }

    case 'teams':
      title = extractTeamsTitle(window.windowTitle);
      break;

    case 'slack':
      title = extractSlackTitle(window.windowTitle);
      break;

    default:
      title = 'Unknown Meeting';
  }

  // Clean up the title
  title = cleanMeetingTitle(title);

  return {
    title,
    platform: window.platform,
    windowTitle: window.windowTitle,
    appName: window.appName,
    url: window.url,
    meetingCode,
    startTime,
  };
}

/**
 * Format duration in seconds to human-readable string
 * Examples:
 * - 45 → "45s"
 * - 90 → "1m 30s"
 * - 3665 → "1h 1m"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format file size in bytes to human-readable string
 * Examples:
 * - 512000 → "500 KB"
 * - 5242880 → "5 MB"
 * - 5368709120 → "5.0 GB"
 */
export function formatFileSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;

  if (mb < 1) {
    return `${Math.round(bytes / 1024)} KB`;
  } else if (mb < 1000) {
    return `${Math.round(mb)} MB`;
  } else {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
}

/**
 * Get the ffprobe binary path
 * Resolves correctly in both development (Vite) and packaged apps
 *
 * The issue: When Vite bundles @ffprobe-installer/ffprobe, __dirname points to
 * .vite/build/ instead of node_modules, breaking path resolution.
 *
 * Solution: Manually resolve the path from app root in all cases.
 */
async function getFfprobePath(): Promise<string | undefined> {
  try {
    const { app } = await import('electron');
    const path = await import('path');
    const fs = await import('fs');

    const platform = process.platform;
    const arch = process.arch;
    const target = `${platform}-${arch}`;
    const binary = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

    let basePath: string;

    if (app.isPackaged) {
      // In packaged apps, unpacked binaries are in app.asar.unpacked
      const appPath = app.getAppPath();
      basePath = appPath.replace('app.asar', 'app.asar.unpacked');
    } else {
      // In development, go from app path (which is project root) to node_modules
      basePath = app.getAppPath();
    }

    // Try multiple possible locations
    const possiblePaths = [
      // Standard npm3+ flat structure (most common)
      path.join(basePath, 'node_modules', '@ffprobe-installer', target, binary),
      // Nested in get-video-duration's node_modules
      path.join(
        basePath,
        'node_modules',
        'get-video-duration',
        'node_modules',
        '@ffprobe-installer',
        target,
        binary
      ),
      // Alternative flat structure
      path.join(
        basePath,
        'node_modules',
        `@ffprobe-installer-${target}`,
        binary
      ),
    ];

    for (const ffprobePath of possiblePaths) {
      if (fs.existsSync(ffprobePath)) {
        console.log(`[MeetingMetadata] Using ffprobe at: ${ffprobePath}`);
        return ffprobePath;
      }
    }

    console.warn(
      '[MeetingMetadata] Could not find ffprobe binary, tried:',
      possiblePaths
    );
    return undefined;
  } catch (error) {
    console.error('[MeetingMetadata] Error resolving ffprobe path:', error);
    return undefined;
  }
}

/**
 * Extract actual video duration from file metadata
 * Uses get-video-duration library (which uses ffprobe internally)
 * Returns duration in seconds (rounded to nearest integer)
 *
 * @param filePath - Absolute path to the video file
 * @returns Duration in seconds, or null if extraction fails
 */
export async function extractVideoDuration(
  filePath: string
): Promise<number | null> {
  try {
    const { getVideoDurationInSeconds } = await import('get-video-duration');
    const ffprobePath = await getFfprobePath();
    const duration = await getVideoDurationInSeconds(filePath, ffprobePath);

    // Round to nearest integer (API expects integer seconds)
    return Math.round(duration);
  } catch (error) {
    console.error('[MeetingMetadata] Failed to extract video duration:', error);
    return null;
  }
}
