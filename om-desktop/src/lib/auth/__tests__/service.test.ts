import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies before importing the module
const mockOnAuthStateChange = vi.fn();
const mockStartAutoRefresh = vi.fn();
const mockStopAutoRefresh = vi.fn();
const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      startAutoRefresh: mockStartAutoRefresh,
      stopAutoRefresh: mockStopAutoRefresh,
      getSession: mockGetSession,
      setSession: mockSetSession,
      signOut: mockSignOut,
      verifyOtp: mockVerifyOtp,
    },
  })),
}));

const mockAppOn = vi.fn();
const mockPowerMonitorOn = vi.fn();
vi.mock('electron', () => ({
  app: {
    on: mockAppOn,
  },
  powerMonitor: {
    on: mockPowerMonitorOn,
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
}));

vi.mock('@sentry/electron/main', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('../../config', () => ({
  config: {
    supabase: {
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
    },
  },
}));

vi.mock('../persistence', () => ({
  sessionPersistence: {
    load: vi.fn(() => null),
    save: vi.fn(),
    clear: vi.fn(),
    isRememberMeEnabled: vi.fn(() => false),
  },
}));

vi.mock('../../update-app-version', () => ({
  updateUserAppVersion: vi.fn().mockResolvedValue(undefined),
}));

describe('AuthService', () => {
  let authService: typeof import('../service').authService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset module to get fresh instance
    vi.resetModules();

    // Re-import to get fresh singleton
    const module = await import('../service');
    authService = module.authService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with loading state', () => {
      expect(authService.getState()).toBe('loading');
    });

    it('should initialize with null user', () => {
      expect(authService.getUser()).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set up auth state listener', async () => {
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: {} } });

      await authService.initialize();

      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    it('should set up focus-based refresh handlers', async () => {
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: {} } });

      await authService.initialize();

      // Should register browser-window-focus and browser-window-blur
      expect(mockAppOn).toHaveBeenCalledWith(
        'browser-window-focus',
        expect.any(Function)
      );
      expect(mockAppOn).toHaveBeenCalledWith(
        'browser-window-blur',
        expect.any(Function)
      );
    });

    it('should set up power monitor handlers', async () => {
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: {} } });

      await authService.initialize();

      expect(mockPowerMonitorOn).toHaveBeenCalledWith(
        'suspend',
        expect.any(Function)
      );
      expect(mockPowerMonitorOn).toHaveBeenCalledWith(
        'resume',
        expect.any(Function)
      );
    });

    it('should only initialize once', async () => {
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: {} } });

      await authService.initialize();
      await authService.initialize();

      // Should only call onAuthStateChange once
      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it('should set state to unauthenticated if no saved session', async () => {
      mockOnAuthStateChange.mockReturnValue({ data: { subscription: {} } });

      await authService.initialize();

      expect(authService.getState()).toBe('unauthenticated');
    });
  });

  describe('getSession', () => {
    it('should return session from Supabase', async () => {
      const mockSession = {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        user: { id: 'user-1', email: 'test@example.com' },
      };
      mockGetSession.mockResolvedValue({ data: { session: mockSession } });

      const session = await authService.getSession();

      expect(session).toEqual(mockSession);
    });

    it('should return null when no session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const session = await authService.getSession();

      expect(session).toBeNull();
    });
  });

  describe('signOut', () => {
    it('should call Supabase signOut with local scope', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      await authService.signOut();

      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    });
  });

  describe('verifyMagicLink', () => {
    it('should return success on valid token', async () => {
      mockVerifyOtp.mockResolvedValue({ data: {}, error: null });

      const result = await authService.verifyMagicLink('valid-token-hash');

      expect(result).toEqual({ success: true });
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        token_hash: 'valid-token-hash',
        type: 'magiclink',
      });
    });

    it('should return error on invalid token', async () => {
      mockVerifyOtp.mockResolvedValue({
        data: null,
        error: { message: 'Invalid or expired token' },
      });

      const result = await authService.verifyMagicLink('invalid-token');

      expect(result).toEqual({
        success: false,
        error: 'Invalid or expired token',
      });
    });
  });

  describe('onStateChange', () => {
    it('should allow subscribing to state changes', () => {
      const callback = vi.fn();
      const unsubscribe = authService.onStateChange(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribing', () => {
      const callback = vi.fn();
      const unsubscribe = authService.onStateChange(callback);

      unsubscribe();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getClient', () => {
    it('should return Supabase client', () => {
      const client = authService.getClient();

      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
    });
  });
});
