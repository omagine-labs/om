'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signUp, signInWithGoogle, signInWithMicrosoft } from '@/lib/auth';
import { useDesktopAuth, redirectToDesktop } from '@/hooks/useDesktopAuth';
import { MagicLinkHandler } from '@/components/MagicLinkHandler';
import { DesktopAuthSuccess } from '@/components/DesktopAuthSuccess';
import { createClient } from '@/lib/supabase';
import { Toast } from '@/components/ui/Toast';

// Component that uses useSearchParams must be wrapped in Suspense
function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);

  // Handle desktop app authentication
  const {
    isDesktopAuth,
    intent,
    loading: desktopAuthLoading,
    error: desktopAuthError,
    redirectedToDesktop,
  } = useDesktopAuth();

  // Detect if this is a desktop app sign-in request (query param, not hash)
  const isDesktopRequest = searchParams.get('source') === 'desktop';

  // Build login URL with claim parameters preserved
  const buildLoginUrl = () => {
    const claimParams = new URLSearchParams();
    const emailParam = searchParams.get('email');
    const meetingParam = searchParams.get('meeting_id');
    const speakerParam = searchParams.get('speaker');

    if (emailParam) claimParams.set('email', emailParam);
    if (meetingParam) claimParams.set('meeting_id', meetingParam);
    if (speakerParam) claimParams.set('speaker', speakerParam);

    return claimParams.toString()
      ? `/login?${claimParams.toString()}`
      : '/login';
  };

  // Pre-fill email from URL params (from anonymous upload flow)
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  // Capture UTM parameters on page load
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

  // Helper function to claim anonymous meetings after signup
  const claimAnonymousMeetings = async (
    userId: string,
    userEmail: string
  ): Promise<{
    success: boolean;
    meetingCount: number;
    firstMeetingId?: string;
  }> => {
    try {
      const supabase = createClient();
      const selectedSpeaker = searchParams.get('speaker');

      const { data: claimedMeetings, error } = await supabase.rpc(
        'claim_anonymous_meetings',
        {
          p_user_id: userId,
          p_email: userEmail,
          p_selected_speaker: selectedSpeaker || undefined,
        }
      );

      if (error) {
        console.error('Failed to claim anonymous meetings:', error);
        return { success: false, meetingCount: 0 };
      }

      if (claimedMeetings && claimedMeetings.length > 0) {
        return {
          success: true,
          meetingCount: claimedMeetings.length,
          firstMeetingId: claimedMeetings[0].meeting_id,
        };
      }

      return { success: true, meetingCount: 0 };
    } catch (err) {
      console.error('Error claiming anonymous meetings:', err);
      return { success: false, meetingCount: 0 };
    }
  };

  // After auth is ready, redirect to paywall if needed
  useEffect(() => {
    if (
      isDesktopAuth &&
      !desktopAuthLoading &&
      !desktopAuthError &&
      intent === 'subscribe'
    ) {
      console.log('[Signup] Auth ready, redirecting to paywall');
      router.replace('/paywall?source=desktop');
    }
  }, [isDesktopAuth, intent, desktopAuthLoading, desktopAuthError, router]);

  // If redirected to desktop, show success message and don't render the form
  if (redirectedToDesktop) {
    return <DesktopAuthSuccess />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error: signUpError } = await signUp(email, password);

      if (signUpError) {
        // Check if user already exists - redirect to login with params preserved
        const errorMsg = signUpError.message || '';
        if (
          errorMsg.toLowerCase().includes('already registered') ||
          errorMsg.toLowerCase().includes('already been registered')
        ) {
          // Build login URL with all claim parameters preserved
          const loginParams = new URLSearchParams();
          loginParams.set('email', email);

          const meetingId = searchParams.get('meeting_id');
          const speaker = searchParams.get('speaker');
          if (meetingId) loginParams.set('meeting_id', meetingId);
          if (speaker) loginParams.set('speaker', speaker);

          // Redirect to login page
          router.push(`/login?${loginParams.toString()}`);
          return;
        }

        setError(signUpError.message || 'Failed to create account');
        setLoading(false);
        return;
      }

      if (data) {
        // Check if session was created (email confirmation might be required)
        if (data.session && data.user) {
          // Try to claim anonymous meetings (non-blocking)
          const claimResult = await claimAnonymousMeetings(data.user.id, email);

          // If meetings were claimed, redirect to meeting analysis
          if (claimResult.success && claimResult.meetingCount > 0) {
            // Redirect to first meeting's analysis page immediately
            // (no toast - user expects to see their meeting)
            const redirectUrl = claimResult.firstMeetingId
              ? `/meetings/${claimResult.firstMeetingId}/analysis`
              : '/meetings';

            router.push(redirectUrl);
            router.refresh();
          } else {
            // No meetings to claim, redirect to paywall to set up subscription
            // Preserve desktop source param so redirect happens after payment
            const paywallUrl = isDesktopRequest
              ? '/paywall?source=desktop'
              : '/paywall';
            router.push(paywallUrl);
            router.refresh();
          }
        } else {
          // No session - email confirmation required
          setError(
            'Please check your email to confirm your account before logging in'
          );
          setLoading(false);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setLoading(true);

    try {
      // Store claim parameters for OAuth callback
      const meetingId = searchParams.get('meeting_id');
      const speaker = searchParams.get('speaker');
      if (meetingId || speaker || email) {
        localStorage.setItem(
          'pending_claim',
          JSON.stringify({ email, meeting_id: meetingId, speaker })
        );
      }

      // If desktop request, pass a redirect URL that includes source=desktop
      const redirectTo = isDesktopRequest
        ? `${window.location.origin}/auth/callback?source=desktop`
        : `${window.location.origin}/auth/callback`;

      const { error: googleError } = await signInWithGoogle(redirectTo);

      if (googleError) {
        setError(googleError.message || 'Failed to sign up with Google');
        setLoading(false);
        return;
      }

      // OAuth flow will redirect automatically
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleMicrosoftSignUp = async () => {
    setError('');
    setLoading(true);

    try {
      // Store claim parameters for OAuth callback
      const meetingId = searchParams.get('meeting_id');
      const speaker = searchParams.get('speaker');
      if (meetingId || speaker || email) {
        localStorage.setItem(
          'pending_claim',
          JSON.stringify({ email, meeting_id: meetingId, speaker })
        );
      }

      // If desktop request, pass a redirect URL that includes source=desktop
      const redirectTo = isDesktopRequest
        ? `${window.location.origin}/auth/callback?source=desktop`
        : `${window.location.origin}/auth/callback`;

      const { error: microsoftError } = await signInWithMicrosoft(redirectTo);

      if (microsoftError) {
        setError(microsoftError.message || 'Failed to sign up with Microsoft');
        setLoading(false);
        return;
      }

      // OAuth flow will redirect automatically
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <>
      <MagicLinkHandler />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="min-h-screen bg-teal-700 relative overflow-hidden flex items-center justify-center px-4 py-12">
        {/* ============================================
            BACKGROUND EFFECTS
            ============================================ */}

        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'url(/noise.svg)',
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
          }}
        />

        {/* Blurred emerald circle */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] bg-emerald-400 pointer-events-none opacity-70"
          style={{ top: '-440px', filter: 'blur(150px)', borderRadius: '50%' }}
        />

        {/* Blurred lime ellipse */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] bg-lime-300 pointer-events-none opacity-70"
          style={{ top: '-300px', filter: 'blur(200px)', borderRadius: '50%' }}
        />

        {/* Blinds lighting effect */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blinds.svg"
          alt=""
          className="absolute -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px]"
        />

        {/* ============================================
            MAIN CONTENT
            ============================================ */}
        <div className="relative z-10 max-w-md w-full">
          {/* ============================================
              HEADER SECTION
              ============================================ */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-6xl font-display font-semibold tracking-tighter text-white drop-shadow-lg mb-3">
              Create account
            </h1>
          </div>

          {/* ============================================
              CARD CONTAINER
              ============================================ */}
          <div
            className="bg-white rounded-2xl p-8 sm:p-10"
            style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}
          >
            {/* Desktop auth loading state */}
            {desktopAuthLoading && (
              <div className="bg-teal-50 text-teal-700 p-4 rounded-lg text-sm mb-6">
                <div className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-3"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Connecting from desktop app...
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {(error || desktopAuthError) && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
                  {error || desktopAuthError}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-base font-medium text-slate-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900 placeholder-slate-400 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-base font-medium text-slate-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900 placeholder-slate-400 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-base font-medium text-slate-700 mb-1"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900 placeholder-slate-400 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-slate-500">
                  or continue with
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleGoogleSignUp}
                type="button"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-lg bg-white text-base font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign up with Google
              </button>

              <button
                onClick={handleMicrosoftSignUp}
                type="button"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-lg bg-white text-base font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 23 23">
                  <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                Sign up with Microsoft
              </button>
            </div>

            <div className="mt-8 text-center">
              <p className="text-base text-slate-600">
                Already have an account?{' '}
                <Link
                  href={buildLoginUrl()}
                  className="text-teal-600 hover:text-teal-700 font-semibold transition-colors underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* ============================================
              FOOTER LINKS
              ============================================ */}
          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-4 text-base text-white/60">
              <Link
                href="/privacy"
                className="hover:text-white/90 transition-colors"
              >
                Privacy Policy
              </Link>
              <span>•</span>
              <Link
                href="/terms"
                className="hover:text-white/90 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Wrapper component with Suspense boundary
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-teal-700 flex items-center justify-center">
          <div className="text-white/80">Loading...</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
