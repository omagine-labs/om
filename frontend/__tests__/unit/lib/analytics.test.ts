import { trackEvent, identifyUser, resetAnalytics } from '@/lib/analytics';
import {
  AcquisitionEvents,
  ActivationEvents,
  EngagementEvents,
  TechEvents,
} from '@/types/analytics';
import * as posthog from '@/lib/posthog';
import * as supabaseModule from '@/lib/supabase';

// Mock PostHog
jest.mock('@/lib/posthog', () => ({
  analytics: {
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

describe('analytics', () => {
  let mockSupabaseClient: any;
  let mockInsert: jest.Mock;
  let mockFrom: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Clear all mocks
    jest.clearAllMocks();

    // Setup Supabase mock (after clearing mocks)
    mockInsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom = jest.fn().mockReturnValue({
      insert: mockInsert,
    });

    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      from: mockFrom,
    };

    (supabaseModule.createClient as jest.Mock).mockReturnValue(
      mockSupabaseClient
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('trackEvent()', () => {
    it('should log to PostHog for anonymous users', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await trackEvent(EngagementEvents.DASHBOARD_VIEWED, {
        meeting_count: 5,
      });

      expect(posthog.analytics.capture).toHaveBeenCalledWith(
        'dashboard_viewed',
        { meeting_count: 5 }
      );
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should log to both PostHog and Supabase for authenticated users', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, { method: 'email' });

      expect(posthog.analytics.capture).toHaveBeenCalledWith(
        'signup_completed',
        { method: 'email' }
      );
      expect(mockFrom).toHaveBeenCalledWith('user_event_log');
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'user-123',
        event_name: 'signup_completed',
        payload: { method: 'email' },
      });
    });

    it('should handle events with no properties', async () => {
      const mockUser = { id: 'user-123' };
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await trackEvent(EngagementEvents.DASHBOARD_VIEWED);

      expect(posthog.analytics.capture).toHaveBeenCalledWith(
        'dashboard_viewed',
        undefined
      );
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'user-123',
        event_name: 'dashboard_viewed',
        payload: null,
      });
    });

    it('should handle Supabase insert errors gracefully', async () => {
      const mockUser = { id: 'user-123' };
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      mockInsert.mockResolvedValue({
        error: { message: 'Database error' },
      });

      await expect(
        trackEvent(EngagementEvents.DASHBOARD_VIEWED)
      ).resolves.not.toThrow();

      expect(posthog.analytics.capture).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Analytics] Failed to log event to database'),
        expect.any(Object)
      );
    });

    it('should handle Supabase auth errors gracefully', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Auth error')
      );

      await expect(
        trackEvent(EngagementEvents.DASHBOARD_VIEWED)
      ).resolves.not.toThrow();

      expect(posthog.analytics.capture).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Analytics] Error logging to database'),
        expect.any(Error)
      );
    });

    it('should handle PostHog errors gracefully', async () => {
      (posthog.analytics.capture as jest.Mock).mockImplementation(() => {
        throw new Error('PostHog error');
      });

      await expect(
        trackEvent(EngagementEvents.DASHBOARD_VIEWED)
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Analytics] Error in trackEvent'),
        expect.any(Error)
      );
    });

    it('should warn about unknown events in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await trackEvent('unknown_event_name' as any);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Analytics] Unknown event: "unknown_event_name"'
        )
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not warn about known events in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await trackEvent(EngagementEvents.DASHBOARD_VIEWED);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('should track meeting analyzed events with correct properties', async () => {
      await trackEvent(EngagementEvents.MEETING_ANALYZED, {
        source: 'upload',
        meeting_id: 'meeting-123',
        processing_time_seconds: 45,
      });

      expect(posthog.analytics.capture).toHaveBeenCalledWith(
        'meeting_analyzed',
        {
          source: 'upload',
          meeting_id: 'meeting-123',
          processing_time_seconds: 45,
        }
      );
    });

    it('should track calendar connection events', async () => {
      await trackEvent(ActivationEvents.CALENDAR_CONNECTED, {
        provider: 'google',
        has_refresh_token: true,
      });

      expect(posthog.analytics.capture).toHaveBeenCalledWith(
        'calendar_connected',
        {
          provider: 'google',
          has_refresh_token: true,
        }
      );
    });
  });

  describe('identifyUser()', () => {
    it('should proxy to PostHog identify', () => {
      identifyUser('user-123', {
        email: 'test@example.com',
        full_name: 'Test User',
      });

      expect(posthog.analytics.identify).toHaveBeenCalledWith('user-123', {
        email: 'test@example.com',
        full_name: 'Test User',
      });
    });

    it('should work with minimal properties', () => {
      identifyUser('user-456', { email: 'user@example.com' });

      expect(posthog.analytics.identify).toHaveBeenCalledWith('user-456', {
        email: 'user@example.com',
      });
    });

    it('should work without properties', () => {
      identifyUser('user-789');

      expect(posthog.analytics.identify).toHaveBeenCalledWith(
        'user-789',
        undefined
      );
    });
  });

  describe('resetAnalytics()', () => {
    it('should proxy to PostHog reset', () => {
      resetAnalytics();

      expect(posthog.analytics.reset).toHaveBeenCalled();
    });
  });

  describe('Event taxonomy validation', () => {
    it('should accept all Acquisition events', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, { method: 'email' });
      await trackEvent(AcquisitionEvents.OAUTH_LOGIN_ATTEMPT, {
        provider: 'google',
      });

      expect(posthog.analytics.capture).toHaveBeenCalledTimes(2);
    });

    it('should accept all Activation events', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await trackEvent(ActivationEvents.USER_LOGGED_IN, { method: 'email' });
      await trackEvent(ActivationEvents.CALENDAR_CONNECTED, {
        provider: 'google',
        has_refresh_token: true,
      });

      expect(posthog.analytics.capture).toHaveBeenCalledTimes(2);
    });

    it('should accept all Engagement events', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await trackEvent(EngagementEvents.DASHBOARD_VIEWED);
      await trackEvent(EngagementEvents.ANALYSIS_VIEWED, {
        meeting_id: 'meeting-123',
      });
      await trackEvent(EngagementEvents.MEETING_ANALYZED, {
        source: 'upload',
        meeting_id: 'meeting-123',
      });

      expect(posthog.analytics.capture).toHaveBeenCalledTimes(3);
    });
  });

  describe('Tech event logging', () => {
    it('should log upload failures to PostHog', async () => {
      await trackEvent(TechEvents.UPLOAD_FAILED, {
        file_type: 'video/webm',
        file_size: 5000000,
        error: 'Network timeout',
      });

      expect(posthog.analytics.capture).toHaveBeenCalledWith('upload_failed', {
        file_type: 'video/webm',
        file_size: 5000000,
        error: 'Network timeout',
      });
    });
  });
});
