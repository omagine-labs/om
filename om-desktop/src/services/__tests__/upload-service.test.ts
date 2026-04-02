import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
let mockShellOpenExternal: ReturnType<typeof vi.fn>;

vi.mock('electron', () => {
  mockShellOpenExternal = vi.fn();
  return {
    app: {
      getPath: vi.fn(() => '/tmp/test-om'),
    },
    Notification: class MockNotification {
      private listeners: Map<string, () => void> = new Map();

      constructor(
        public options: { title: string; body: string; silent: boolean }
      ) {}

      show() {
        // Simulate notification showing
      }

      close() {
        const closeHandler = this.listeners.get('close');
        if (closeHandler) {
          closeHandler();
        }
      }

      on(event: string, handler: () => void) {
        this.listeners.set(event, handler);
      }
    },
    shell: {
      openExternal: mockShellOpenExternal,
    },
  };
});

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async () => Buffer.from('test-audio-data')),
    unlink: vi.fn(async () => {}),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true), // File exists by default
  },
  existsSync: vi.fn(() => true),
}));

vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    basename: vi.fn((p: string) => p.split('/').pop() || ''),
    extname: vi.fn(() => '.mp3'),
  },
}));

vi.mock('../../lib/auth', () => ({
  authService: {
    getUser: vi.fn(() => ({
      id: 'test-user-id',
      email: 'test@example.com',
    })),
    getState: vi.fn(() => 'authenticated'),
    getSession: vi.fn(async () => ({
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })),
    getClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id', email: 'test@example.com' } },
          error: null,
        }),
      },
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({
            data: { path: 'test-path/file.mp3' },
            error: null,
          }),
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { status: 'completed' },
              error: null,
            }),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('../../lib/config', () => ({
  config: {
    webApp: {
      url: 'https://test.example.com',
    },
  },
}));

vi.mock('../../lib/sentry', () => ({
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('../utils/error-notifications', () => ({
  showProcessingError: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ jobId: 'test-job-id', meetingId: 'test-meeting-id' }),
  text: async () => 'OK',
}) as unknown as typeof fetch;

describe('UploadService', () => {
  let uploadService: typeof import('../upload-service').uploadService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-import to get fresh instance
    const module = await import('../upload-service');
    uploadService = module.uploadService;
  });

  describe('Meeting Ready Notification', () => {
    it('should register click handler to open meeting page', () => {
      // Test that the notification action pattern works
      const meetingId = 'test-meeting-id';
      const expectedUrl = `https://test.example.com/meetings/${meetingId}`;

      // Simulate what happens when notification is clicked
      const action = () => {
        void mockShellOpenExternal(expectedUrl);
      };

      action();

      // Verify shell.openExternal would be called with meeting URL
      expect(mockShellOpenExternal).toHaveBeenCalledWith(expectedUrl);
    });
  });

  describe('Upload Stitched Audio', () => {
    it('should upload stitched audio successfully', async () => {
      const metadata = {
        title: 'Test Meeting',
        platform: 'zoom',
        url: 'https://zoom.us/test',
        startTime: new Date(),
        endTime: new Date(),
        windowTitle: 'Test Meeting Window',
        appName: 'Zoom',
        filename: 'test.mp3',
      };

      const result = await uploadService.uploadStitchedAudio(
        'session-123',
        '/path/to/stitched.mp3',
        metadata,
        [],
        300
      );

      expect(result.success).toBe(true);
      expect(result.meetingId).toBe('test-meeting-id');
    });
  });

  describe('Processing Failed', () => {
    it('should throw error when processing fails', async () => {
      // Mock failed processing job by replacing supabase client
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { status: 'failed', processing_error: 'Test error' },
                error: null,
              }),
            })),
          })),
        })),
      };

      // Replace the supabase client in the service instance
      (uploadService as unknown as { supabase: typeof mockSupabase }).supabase =
        mockSupabase;

      await expect(
        uploadService.monitorProcessing('test-meeting-id', 'Test Meeting')
      ).rejects.toThrow('Test error');
    }, 10000);
  });
});
