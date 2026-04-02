import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to define mocks that are referenced in vi.mock factories
const { mockVerifyMagicLink, mockNotificationShow, mockShellOpenExternal } =
  vi.hoisted(() => ({
    mockVerifyMagicLink: vi.fn(),
    mockNotificationShow: vi.fn(),
    mockShellOpenExternal: vi.fn(),
  }));

// Mock dependencies
vi.mock('electron', () => ({
  Notification: class MockNotification {
    constructor(
      public options: { title: string; body: string; silent?: boolean }
    ) {}
    show() {
      mockNotificationShow(this.options);
    }
  },
  shell: {
    openExternal: mockShellOpenExternal,
  },
}));

vi.mock('@sentry/electron/main', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('../service', () => ({
  authService: {
    verifyMagicLink: mockVerifyMagicLink,
  },
}));

vi.mock('../../config', () => ({
  config: {
    webApp: {
      url: 'https://test.example.com',
    },
  },
}));

// Import after mocks
import { handleDeepLink } from '../deep-links';

describe('handleDeepLink', () => {
  const mockMenuBarService = {
    updateAuthState: vi.fn().mockResolvedValue(undefined),
    openDashboard: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('magic link handling', () => {
    it('should verify magic link with token from query params', async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true });

      await handleDeepLink(
        'om://auth/magiclink?token=test-token-hash&email=test@example.com',
        mockMenuBarService as any
      );

      expect(mockVerifyMagicLink).toHaveBeenCalledWith('test-token-hash');
    });

    it('should verify magic link with token from hash params', async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true });

      await handleDeepLink(
        'om://auth/magiclink#token=test-token-hash&email=test@example.com',
        mockMenuBarService as any
      );

      expect(mockVerifyMagicLink).toHaveBeenCalledWith('test-token-hash');
    });

    it('should show success notification on successful verification', async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true });

      await handleDeepLink(
        'om://auth/magiclink?token=test-token&email=user@test.com',
        mockMenuBarService as any
      );

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Signed In',
          body: 'Welcome, user@test.com',
        })
      );
    });

    it('should update menu bar state on success', async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true });

      await handleDeepLink(
        'om://auth/magiclink?token=test-token&email=user@test.com',
        mockMenuBarService as any
      );

      expect(mockMenuBarService.updateAuthState).toHaveBeenCalled();
    });

    it('should open dashboard on success', async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true });

      await handleDeepLink(
        'om://auth/magiclink?token=test-token&email=user@test.com',
        mockMenuBarService as any
      );

      expect(mockMenuBarService.openDashboard).toHaveBeenCalled();
    });

    it('should open dashboard via shell if no menu bar service', async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true });

      await handleDeepLink(
        'om://auth/magiclink?token=test-token&email=user@test.com',
        null
      );

      expect(mockShellOpenExternal).toHaveBeenCalledWith(
        'https://test.example.com/dashboard'
      );
    });

    it('should show error notification on failed verification', async () => {
      mockVerifyMagicLink.mockResolvedValue({
        success: false,
        error: 'Token expired',
      });

      await handleDeepLink(
        'om://auth/magiclink?token=expired-token&email=user@test.com',
        mockMenuBarService as any
      );

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign In Failed',
          body: 'Token expired',
        })
      );
    });

    it('should show error when token is missing', async () => {
      await handleDeepLink(
        'om://auth/magiclink?email=user@test.com',
        mockMenuBarService as any
      );

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign In Failed',
          body: 'Invalid authentication link.',
        })
      );
      expect(mockVerifyMagicLink).not.toHaveBeenCalled();
    });
  });

  describe('unknown routes', () => {
    it('should log warning for unknown routes', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleDeepLink('om://unknown/route', mockMenuBarService as any);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DeepLink] Unknown route:',
        'unknown/route'
      );
      consoleSpy.mockRestore();
    });

    it('should not show notification for unknown routes', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleDeepLink('om://unknown/route', mockMenuBarService as any);

      expect(mockNotificationShow).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle malformed URLs gracefully', async () => {
      await handleDeepLink('not-a-valid-url', mockMenuBarService as any);

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign In Failed',
          body: 'Authentication failed. Please try again.',
        })
      );
    });

    it('should handle empty URL', async () => {
      await handleDeepLink('', mockMenuBarService as any);

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign In Failed',
        })
      );
    });
  });
});
