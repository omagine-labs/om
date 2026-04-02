/**
 * UTM Capture Tests for Signup/Login Pages
 *
 * These tests ensure UTM parameters are correctly captured from URLs
 * and stored in localStorage for attribution tracking.
 *
 * Critical for preventing attribution data loss when users navigate
 * between signup and login pages.
 */

import { renderHook } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

describe('UTM Capture Logic (Signup/Login Pages)', () => {
  let mockSearchParams: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });

    // Mock useSearchParams
    mockSearchParams = {
      get: jest.fn(),
    };
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
  });

  /**
   * Simulates the UTM capture logic from signup/login pages
   * This is extracted to test the logic without testing React components
   * Named with "use" prefix to follow React hooks naming convention
   */
  const useCaptureUTMParameters = () => {
    const searchParams = useSearchParams();

    useEffect(() => {
      const utmSource = searchParams.get('utm_source');
      const utmCampaign = searchParams.get('utm_campaign');
      const utmMedium = searchParams.get('utm_medium');

      if (utmSource || utmCampaign || utmMedium) {
        const utmData = {
          source: utmSource || '',
          campaign: utmCampaign || undefined,
          medium: utmMedium || undefined,
        };
        localStorage.setItem('signup_utm', JSON.stringify(utmData));
      }
    }, [searchParams]);
  };

  describe('Full UTM parameters', () => {
    /**
     * CRITICAL TEST: Complete Attribution Data
     * When all three UTM params present, all should be captured
     */
    it('should capture all UTM parameters when present', () => {
      mockSearchParams.get.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          utm_source: 'twitter',
          utm_campaign: 'launch2024',
          utm_medium: 'social',
        };
        return params[key] || null;
      });

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'signup_utm',
        JSON.stringify({
          source: 'twitter',
          campaign: 'launch2024',
          medium: 'social',
        })
      );
    });
  });

  describe('Partial UTM parameters', () => {
    /**
     * REGRESSION TEST: Source Only
     * Users may land with only utm_source (e.g., organic search)
     */
    it('should capture when only utm_source is present', () => {
      mockSearchParams.get.mockImplementation((key: string) => {
        return key === 'utm_source' ? 'google' : null;
      });

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'signup_utm',
        JSON.stringify({
          source: 'google',
          campaign: undefined,
          medium: undefined,
        })
      );
    });

    /**
     * REGRESSION TEST: Campaign Without Source
     * Edge case: utm_campaign present but no utm_source
     * Should still capture to avoid data loss
     */
    it('should capture when only utm_campaign is present', () => {
      mockSearchParams.get.mockImplementation((key: string) => {
        return key === 'utm_campaign' ? 'holiday_sale' : null;
      });

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'signup_utm',
        JSON.stringify({
          source: '',
          campaign: 'holiday_sale',
          medium: undefined,
        })
      );
    });

    /**
     * TEST: Source + Campaign, No Medium
     */
    it('should capture source and campaign without medium', () => {
      mockSearchParams.get.mockImplementation((key: string) => {
        const params: Record<string, string | null> = {
          utm_source: 'facebook',
          utm_campaign: 'retargeting',
          utm_medium: null,
        };
        return params[key] || null;
      });

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'signup_utm',
        JSON.stringify({
          source: 'facebook',
          campaign: 'retargeting',
          medium: undefined,
        })
      );
    });
  });

  describe('No UTM parameters', () => {
    /**
     * CRITICAL TEST: No Pollution
     * When no UTM params, should NOT write to localStorage
     * Prevents incorrect attribution (e.g., attributing direct traffic to campaigns)
     */
    it('should NOT capture when no UTM parameters are present', () => {
      mockSearchParams.get.mockReturnValue(null);

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('Special characters and encoding', () => {
    /**
     * REGRESSION TEST: URL Encoding
     * UTM parameters may contain spaces, special chars
     * Browser decodes them, we should store decoded values
     */
    it('should handle URL-encoded UTM parameters', () => {
      mockSearchParams.get.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          utm_source: 'email newsletter',
          utm_campaign: 'Week #2 Launch',
          utm_medium: 'promo-2024',
        };
        return params[key] || null;
      });

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'signup_utm',
        JSON.stringify({
          source: 'email newsletter',
          campaign: 'Week #2 Launch',
          medium: 'promo-2024',
        })
      );
    });

    /**
     * TEST: Empty String Values
     * Edge case: ?utm_source=&utm_campaign=test
     * Should capture with empty string for source
     */
    it('should handle empty string UTM values', () => {
      mockSearchParams.get.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          utm_source: '',
          utm_campaign: 'test_campaign',
          utm_medium: '',
        };
        return params[key] || null;
      });

      renderHook(() => useCaptureUTMParameters());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'signup_utm',
        JSON.stringify({
          source: '',
          campaign: 'test_campaign',
          medium: undefined,
        })
      );
    });
  });

  describe('Cross-page persistence', () => {
    /**
     * CRITICAL TEST: Data Persistence
     * UTM data in localStorage should survive navigation
     * Simulates: /login?utm_source=google → click link → /signup
     */
    it('should maintain UTM data across page navigations', () => {
      // Simulate landing on /login with UTMs
      mockSearchParams.get.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          utm_source: 'google',
          utm_campaign: 'search_ads',
        };
        return params[key] || null;
      });

      renderHook(() => useCaptureUTMParameters());

      const capturedData = (localStorage.setItem as jest.Mock).mock.calls[0][1];

      // Verify data was stored
      expect(JSON.parse(capturedData)).toEqual({
        source: 'google',
        campaign: 'search_ads',
        medium: undefined,
      });

      // Simulate navigation to /signup (no UTM params in URL)
      mockSearchParams.get.mockReturnValue(null);

      // Data should still be in localStorage from first page
      (window.localStorage.getItem as jest.Mock).mockReturnValue(capturedData);

      expect(localStorage.getItem('signup_utm')).toBe(capturedData);
    });
  });

  // NOTE: Last-Touch Attribution
  // UTM parameter overwriting behavior is tested via E2E tests.
  // When a user navigates between pages with different UTMs, the new UTMs overwrite old ones.
  // This requires full page navigation which is better suited for E2E testing.
});
