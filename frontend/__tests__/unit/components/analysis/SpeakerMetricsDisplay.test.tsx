/**
 * Unit tests for SpeakerMetricsDisplay component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SpeakerMetricsDisplay } from '@/components/analysis/SpeakerMetricsDisplay';

describe('SpeakerMetricsDisplay', () => {
  const mockFormatDuration = jest.fn((seconds) => `${seconds}s`);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Metrics Mode', () => {
    const basicMetrics = {
      talkTimeSeconds: 120,
      wordCount: 250,
      talkTimePercentage: 60,
    };

    it('renders basic metrics correctly', () => {
      render(
        <SpeakerMetricsDisplay
          basicMetrics={basicMetrics}
          formatDuration={mockFormatDuration}
        />
      );

      expect(screen.getByText('Talk Time')).toBeInTheDocument();
      expect(screen.getByText('Word Count')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
    });

    it('calls formatDuration for talk time', () => {
      render(
        <SpeakerMetricsDisplay
          basicMetrics={basicMetrics}
          formatDuration={mockFormatDuration}
        />
      );

      expect(mockFormatDuration).toHaveBeenCalledWith(120);
    });

    it('displays talk time percentage in progress bar', () => {
      const { container } = render(
        <SpeakerMetricsDisplay
          basicMetrics={basicMetrics}
          formatDuration={mockFormatDuration}
        />
      );

      const progressBar = container.querySelector('[style*="width: 60%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('displays percentage label', () => {
      render(
        <SpeakerMetricsDisplay
          basicMetrics={basicMetrics}
          formatDuration={mockFormatDuration}
        />
      );

      expect(screen.getByText('60.0%')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('renders nothing when no metrics provided', () => {
      const { container } = render(
        <SpeakerMetricsDisplay formatDuration={mockFormatDuration} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('handles zero talk time percentage', () => {
      const metrics = {
        talkTimeSeconds: 0,
        wordCount: 0,
        talkTimePercentage: 0,
      };

      render(
        <SpeakerMetricsDisplay
          basicMetrics={metrics}
          formatDuration={mockFormatDuration}
        />
      );

      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('handles 100% talk time percentage', () => {
      const metrics = {
        talkTimeSeconds: 300,
        wordCount: 500,
        talkTimePercentage: 100,
      };

      render(
        <SpeakerMetricsDisplay
          basicMetrics={metrics}
          formatDuration={mockFormatDuration}
        />
      );

      expect(screen.getByText('100.0%')).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('applies correct width for basic metrics', () => {
      const { container } = render(
        <SpeakerMetricsDisplay
          basicMetrics={{
            talkTimeSeconds: 120,
            wordCount: 250,
            talkTimePercentage: 45,
          }}
          formatDuration={mockFormatDuration}
        />
      );

      const progressBar = container.querySelector('[style*="width: 45%"]');
      expect(progressBar).toBeInTheDocument();
    });
  });
});
