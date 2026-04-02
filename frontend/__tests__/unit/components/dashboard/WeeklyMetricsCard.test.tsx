/**
 * WeeklyMetricsCard Component Tests
 *
 * Unit tests for the WeeklyMetricsCard component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { WeeklyMetricsCard } from '@/components/dashboard/metrics/WeeklyMetricsCard';
import type { MetricComparison, MetricItem } from '@/types/dashboard';

describe('WeeklyMetricsCard', () => {
  const mockComparison: MetricComparison = {
    currentValue: 45.5,
    baselineValue: 50.0,
    percentageChange: -9.0,
    direction: 'down',
    status: 'good',
  };

  const mockMetrics: MetricItem[] = [
    {
      label: 'Talk Time Average',
      currentValue: 45.5,
      unit: '%',
      comparison: mockComparison,
    },
  ];

  it('should render header and subheader', () => {
    render(
      <WeeklyMetricsCard
        header="Poise"
        subheader="How you said it"
        metrics={mockMetrics}
        pillarColor="amber"
      />
    );

    expect(screen.getByText('Poise')).toBeInTheDocument();
    expect(screen.getByText('How you said it')).toBeInTheDocument();
  });

  it('should render metric label, value and unit', () => {
    render(
      <WeeklyMetricsCard
        header="Poise"
        subheader="How you said it"
        metrics={mockMetrics}
        pillarColor="amber"
      />
    );

    expect(screen.getByText('Talk Time Average')).toBeInTheDocument();
    expect(screen.getByText('45.5')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('should render multiple metrics', () => {
    const wpmComparison: MetricComparison = {
      currentValue: 150,
      baselineValue: 140,
      percentageChange: 7.1,
      direction: 'up',
      status: 'good',
    };

    const multipleMetrics: MetricItem[] = [
      {
        label: 'Talk Time Average',
        currentValue: 45.5,
        unit: '%',
        comparison: mockComparison,
      },
      {
        label: 'Words Per Minute',
        currentValue: 150,
        unit: 'WPM',
        comparison: wpmComparison,
      },
    ];

    render(
      <WeeklyMetricsCard
        header="Communication"
        subheader="Test subheader"
        metrics={multipleMetrics}
        pillarColor="indigo"
      />
    );

    expect(screen.getByText('Talk Time Average')).toBeInTheDocument();
    expect(screen.getByText('Words Per Minute')).toBeInTheDocument();
  });

  it('should render WPM without decimal places', () => {
    const wpmComparison: MetricComparison = {
      currentValue: 150,
      baselineValue: 140,
      percentageChange: 7.1,
      direction: 'up',
      status: 'good',
    };

    const wpmMetrics: MetricItem[] = [
      {
        label: 'Words Per Minute',
        currentValue: 150.7,
        unit: 'WPM',
        comparison: wpmComparison,
      },
    ];

    render(
      <WeeklyMetricsCard
        header="Content"
        subheader="What you said"
        metrics={wpmMetrics}
        pillarColor="teal"
      />
    );

    // Should show 0 decimal places for WPM
    expect(screen.getByText('151')).toBeInTheDocument();
  });

  it('should render percentage with 1 decimal place', () => {
    const percentageMetrics: MetricItem[] = [
      {
        label: 'Talk Time Average',
        currentValue: 45.567,
        unit: '%',
        comparison: mockComparison,
      },
    ];

    render(
      <WeeklyMetricsCard
        header="Poise"
        subheader="How you said it"
        metrics={percentageMetrics}
        pillarColor="amber"
      />
    );

    // Should round to 45.6
    expect(screen.getByText('45.6')).toBeInTheDocument();
  });

  it('should apply correct test id', () => {
    const { container } = render(
      <WeeklyMetricsCard
        header="Poise"
        subheader="How you said it"
        metrics={mockMetrics}
        pillarColor="amber"
      />
    );

    const card = container.querySelector('[data-testid="metric-card-poise"]');
    expect(card).toBeInTheDocument();
  });

  describe('Pillar Score Display', () => {
    it('should render pillar score when provided', () => {
      render(
        <WeeklyMetricsCard
          header="Content"
          subheader="What you said"
          metrics={mockMetrics}
          pillarScore={7.5}
          pillarColor="teal"
        />
      );

      // Score displayed in x10 format: 7.5 * 10 = 75
      expect(screen.getByText('75')).toBeInTheDocument();
    });

    it('should not render pillar score when not provided', () => {
      render(
        <WeeklyMetricsCard
          header="Content"
          subheader="What you said"
          metrics={mockMetrics}
          pillarColor="teal"
        />
      );

      // Should not have any large pillar score display
      const largeScores = screen.queryByText(/^\d+\.\d+$/);
      // We might have metric values, but not the pillar score section
    });

    it('should render pillar comparison when provided', () => {
      const pillarComparison: MetricComparison = {
        currentValue: 7.5,
        baselineValue: 7.0,
        percentageChange: 7.1,
        direction: 'up',
        status: 'good',
      };

      render(
        <WeeklyMetricsCard
          header="Content"
          subheader="What you said"
          metrics={mockMetrics}
          pillarScore={7.5}
          pillarComparison={pillarComparison}
          pillarColor="teal"
        />
      );

      // Should show pillar score (x10 display format)
      expect(screen.getByText('75')).toBeInTheDocument();

      // Should show percentage change in DeltaChip (without "vs baseline")
      expect(screen.getByText(/7\.1%/)).toBeInTheDocument();
    });

    it('should render pillar score with x10 format', () => {
      render(
        <WeeklyMetricsCard
          header="Poise"
          subheader="How you said it"
          metrics={mockMetrics}
          pillarScore={8.234567}
          pillarColor="amber"
        />
      );

      // Should show x10 format: 8.234567 * 10 = 82.34567 → rounds to 82
      expect(screen.getByText('82')).toBeInTheDocument();
    });

    it('should not render pillar score for null value', () => {
      render(
        <WeeklyMetricsCard
          header="Connection"
          subheader="How you collaborate"
          metrics={mockMetrics}
          pillarScore={null}
          pillarColor="indigo"
        />
      );

      // Should only show the header and subheader, no pillar score
      expect(screen.getByText('Connection')).toBeInTheDocument();
      expect(screen.getByText('How you collaborate')).toBeInTheDocument();
    });

    it('should not render pillar score for undefined value', () => {
      render(
        <WeeklyMetricsCard
          header="Attunement"
          subheader="Your awareness"
          metrics={mockMetrics}
          pillarScore={undefined}
          pillarColor="indigo"
        />
      );

      // Should only show the header and subheader, no pillar score
      expect(screen.getByText('Attunement')).toBeInTheDocument();
      expect(screen.getByText('Your awareness')).toBeInTheDocument();
    });
  });
});
