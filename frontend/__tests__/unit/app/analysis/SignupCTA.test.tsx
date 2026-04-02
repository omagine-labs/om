/**
 * @jest-environment jsdom
 *
 * SignupCTA Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SignupCTA } from '@/app/analysis/[meetingId]/components/SignupCTA';

describe('SignupCTA', () => {
  const signupUrl =
    '/signup?email=test@example.com&meeting_id=meeting-123&speaker=SPEAKER_A';

  describe('Sticky Banner', () => {
    it('should show signup CTA in sticky banner when no speaker selected', () => {
      render(
        <SignupCTA
          selectedSpeaker={null}
          signupUrl={signupUrl}
          isSticky={true}
        />
      );

      expect(
        screen.getByText(/Sign up to save this analysis and access it anytime/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Create Free Account')).toBeInTheDocument();
    });

    it('should show celebration message when speaker is selected', () => {
      render(
        <SignupCTA
          selectedSpeaker="SPEAKER_A"
          signupUrl={signupUrl}
          isSticky={true}
        />
      );

      expect(screen.getByText(/Great!/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Now sign up to save your personalized insights/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Save My Insights')).toBeInTheDocument();
    });

    it('should link to signup URL', () => {
      render(
        <SignupCTA
          selectedSpeaker="SPEAKER_A"
          signupUrl={signupUrl}
          isSticky={true}
        />
      );

      const link = screen.getByText('Save My Insights');
      expect(link.closest('a')).toHaveAttribute('href', signupUrl);
    });
  });

  describe('Bottom Card', () => {
    it('should show signup CTA in card format', () => {
      render(
        <SignupCTA
          selectedSpeaker={null}
          signupUrl={signupUrl}
          isSticky={false}
        />
      );

      expect(
        screen.getByText(/Want to access this analysis anytime\?/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Create a free account to save your analysis and track your communication metrics over time\./i
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Create Free Account')).toBeInTheDocument();
    });

    it('should link to signup URL in card format', () => {
      render(
        <SignupCTA
          selectedSpeaker={null}
          signupUrl={signupUrl}
          isSticky={false}
        />
      );

      const link = screen.getByText('Create Free Account');
      expect(link.closest('a')).toHaveAttribute('href', signupUrl);
    });
  });
});
