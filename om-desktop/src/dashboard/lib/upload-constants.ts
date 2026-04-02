/**
 * Constants for file upload validation
 * Shared across frontend and API routes
 */

// Maximum file size: 1GB
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB in bytes
export const MAX_FILE_SIZE_MB = 1024;

// Minimum recording duration: 60 seconds
export const MIN_RECORDING_DURATION_SECONDS = 60;

// Supported video MIME types
export const VIDEO_MIME_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
} as const;

// Supported audio MIME types
export const AUDIO_MIME_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/mp4': ['.m4a'],
  'audio/x-m4a': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/flac': ['.flac'],
  'audio/ogg': ['.ogg'],
} as const;

// Combined MIME types
export const SUPPORTED_MIME_TYPES = {
  ...VIDEO_MIME_TYPES,
  ...AUDIO_MIME_TYPES,
} as const;

// All supported file extensions
export const SUPPORTED_EXTENSIONS = [
  // Video
  '.mp4',
  '.mov',
  '.webm',
  '.avi',
  '.mkv',
  // Audio
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
] as const;

// User-friendly format descriptions
export const FORMAT_DESCRIPTIONS = {
  video: 'MP4, MOV, WebM, AVI, MKV',
  audio: 'MP3, WAV, M4A, AAC, FLAC, OGG',
  all: 'MP4, MOV, WebM, AVI, MKV, MP3, WAV, M4A, AAC, FLAC, OGG',
} as const;

/**
 * Validates if a file is within the size limit
 */
export function isFileSizeValid(sizeInBytes: number): boolean {
  return sizeInBytes > 0 && sizeInBytes <= MAX_FILE_SIZE;
}

/**
 * Validates if a MIME type is supported
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return mimeType in SUPPORTED_MIME_TYPES;
}

/**
 * Validates if a file extension is supported
 */
export function isExtensionSupported(filename: string): boolean {
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!extension) return false;
  return SUPPORTED_EXTENSIONS.includes(
    extension as (typeof SUPPORTED_EXTENSIONS)[number]
  );
}

/**
 * Gets the file extension from a filename
 */
export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Determines if a file is video or audio based on MIME type
 */
export function getFileType(mimeType: string): 'video' | 'audio' | 'unknown' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'unknown';
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Comprehensive file validation
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidationResult {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check file size
  if (!isFileSizeValid(file.size)) {
    return {
      valid: false,
      error: `File size must be less than ${MAX_FILE_SIZE_MB}MB. Your file is ${formatFileSize(file.size)}.`,
    };
  }

  // Check MIME type
  if (!isMimeTypeSupported(file.type)) {
    return {
      valid: false,
      error: `Unsupported file format. Supported formats: ${FORMAT_DESCRIPTIONS.all}`,
    };
  }

  // Check file extension as backup
  if (!isExtensionSupported(file.name)) {
    return {
      valid: false,
      error: `Unsupported file extension. Supported formats: ${FORMAT_DESCRIPTIONS.all}`,
    };
  }

  return { valid: true };
}

/**
 * Calculates duration in seconds from ISO timestamp strings
 */
export function calculateDurationSeconds(
  startTime: string,
  endTime: string
): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.floor((end - start) / 1000);
}

/**
 * Validates if a recording duration meets minimum requirements
 */
export function isDurationValid(durationSeconds: number): boolean {
  return durationSeconds >= MIN_RECORDING_DURATION_SECONDS;
}
