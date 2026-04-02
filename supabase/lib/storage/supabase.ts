import { StorageAdapter } from '../types';

export interface SupabaseStorageOptions {
  supabaseUrl: string;
  supabaseKey: string;
  bucketName: string;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private supabaseUrl: string;
  private supabaseKey: string;
  private bucketName: string;

  constructor(options: SupabaseStorageOptions) {
    this.supabaseUrl = options.supabaseUrl;
    this.supabaseKey = options.supabaseKey;
    this.bucketName = options.bucketName;
  }

  /**
   * Generates a structured storage path for user recordings
   * Format: recordings/{user_id}/{year}/{month}/{job_id}.{ext}
   */
  generateStoragePath(
    userId: string,
    jobId: string,
    originalFilename: string
  ): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Extract file extension from original filename
    const ext = originalFilename.split('.').pop() || 'mp4';

    return `recordings/${userId}/${year}/${month}/${jobId}.${ext}`;
  }

  async saveFile(
    id: string,
    buffer: Uint8Array,
    contentType: string,
    userId?: string,
    originalFilename?: string
  ): Promise<string> {
    if (!userId || !originalFilename) {
      throw new Error('User ID and original filename are required for storage');
    }

    const storagePath = this.generateStoragePath(userId, id, originalFilename);

    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${storagePath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
            'Content-Type': contentType,
            'Content-Length': buffer.length.toString(),
          },
          body: buffer,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to upload file: ${error}`);
      }

      return storagePath;
    } catch (error) {
      console.error('Error saving file to Supabase Storage:', error);
      throw error;
    }
  }

  async getFile(path: string): Promise<Uint8Array> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${path}`,
        {
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error('Error fetching file from Supabase Storage:', error);
      throw error;
    }
  }

  async getFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
    const uint8Array = await this.getFile(path);
    return uint8Array.buffer;
  }

  async deleteFile(path: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${path}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting file from Supabase Storage:', error);
      throw error;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/info/${this.bucketName}/${path}`,
        {
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
          },
        }
      );

      return response.ok;
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Get a public URL for a file (if bucket allows public access)
   */
  getPublicUrl(path: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${path}`;
  }

  /**
   * Get a signed URL for private file access
   */
  async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/sign/${this.bucketName}/${path}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expiresIn }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get signed URL: ${response.statusText}`);
      }

      const { signedURL } = await response.json();
      return `${this.supabaseUrl}${signedURL}`;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      throw error;
    }
  }

  /**
   * List files in a directory (useful for organization file management)
   */
  async listFiles(prefix: string): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/storage/v1/object/list/${this.bucketName}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prefix,
            limit: 1000,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const files = await response.json();
      return files.map((file: { name: string }) => file.name);
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  /**
   * Get storage usage for a user
   */
  async getStorageUsage(
    userId: string
  ): Promise<{ totalSizeBytes: number; fileCount: number }> {
    try {
      const files = await this.listFiles(`recordings/${userId}/`);
      let totalSizeBytes = 0;
      let fileCount = 0;

      // Note: This is a basic implementation. For production, you might want to
      // cache this information or use a more efficient method to track usage.
      for (const file of files) {
        try {
          const response = await fetch(
            `${this.supabaseUrl}/storage/v1/object/info/${this.bucketName}/${file}`,
            {
              headers: {
                Authorization: `Bearer ${this.supabaseKey}`,
              },
            }
          );

          if (response.ok) {
            const info = await response.json();
            totalSizeBytes += info.size || 0;
            fileCount++;
          }
        } catch (error) {
          // Skip files that can't be accessed
          console.warn(`Could not get info for file ${file}:`, error);
        }
      }

      return { totalSizeBytes, fileCount };
    } catch (error) {
      console.error('Error getting storage usage:', error);
      return { totalSizeBytes: 0, fileCount: 0 };
    }
  }
}
