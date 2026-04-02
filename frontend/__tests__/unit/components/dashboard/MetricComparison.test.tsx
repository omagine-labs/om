/**
 * MetricComparison Component Tests
 *
 * Unit tests for the MetricComparisonDisplay component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MetricComparisonDisplay } from '@/components/dashboard/metrics/MetricComparison';
import type { MetricComparison } from '@/types/dashboard';

describe('MetricComparisonDisplay', () => {
  it('should render baseline value', () => {
    const comparison: MetricComparison = {
      currentValue: 45.5,
      baselineValue: 50.0,
      percentageChange: -9.0,
      direction: 'down',
      status: 'good',
    };

    render(<MetricComparisonDisplay comparison={comparison} />);

    expect(screen.getByText(/Baseline:/)).toBeInTheDocument();
    expect(screen.getByText(/50.0/)).toBeInTheDocument();
  });

  it('should render positive percentage change with plus sign', () => {
    const comparison: MetricComparison = {
      currentValue: 55.0,
      baselineValue: 50.0,
      percentageChange: 10.0,
      direction: 'up',
      status: 'warning',
    };

    render(<MetricComparisonDisplay comparison={comparison} />);

    expect(screen.getByText('+10.0%')).toBeInTheDocument();
  });

  it('should render negative percentage change without extra minus', () => {
    const comparison: MetricComparison = {
      currentValue: 45.0,
      baselineValue: 50.0,
      percentageChange: -10.0,
      direction: 'down',
      status: 'good',
    };

    render(<MetricComparisonDisplay comparison={comparison} />);

    expect(screen.getByText('-10.0%')).toBeInTheDocument();
  });

  it('should show up arrow for upward direction', () => {
    const comparison: MetricComparison = {
      currentValue: 55.0,
      baselineValue: 50.0,
      percentageChange: 10.0,
      direction: 'up',
      status: 'warning',
    };

    render(<MetricComparisonDisplay comparison={comparison} />);

    const arrow = screen.getByLabelText('Increased');
    expect(arrow).toBeInTheDocument();
  });

  it('should show down arrow for downward direction', () => {
    const comparison: MetricComparison = {
      currentValue: 45.0,
      baselineValue: 50.0,
      percentageChange: -10.0,
      direction: 'down',
      status: 'good',
    };

    render(<MetricComparisonDisplay comparison={comparison} />);

    const arrow = screen.getByLabelText('Decreased');
    expect(arrow).toBeInTheDocument();
  });

  it('should not show arrow for neutral direction', () => {
    const comparison: MetricComparison = {
      currentValue: 50.0,
      baselineValue: 50.0,
      percentageChange: 0.5, // < 1% is neutral
      direction: 'neutral',
      status: 'good',
    };

    render(<MetricComparisonDisplay comparison={comparison} />);

    expect(screen.queryByLabelText('Increased')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Decreased')).not.toBeInTheDocument();
  });

  it('should apply green colors for good status', () => {
    const comparison: MetricComparison = {
      currentValue: 45.0,
      baselineValue: 50.0,
      percentageChange: -10.0,
      direction: 'down',
      status: 'good',
    };

    const { container } = render(
      <MetricComparisonDisplay comparison={comparison} />
    );

    const changeIndicator = container.querySelector('.bg-green-50');
    expect(changeIndicator).toBeInTheDocument();
  });

  it('should apply yellow colors for warning status', () => {
    const comparison: MetricComparison = {
      currentValue: 55.0,
      baselineValue: 50.0,
      percentageChange: 10.0,
      direction: 'up',
      status: 'warning',
    };

    const { container } = render(
      <MetricComparisonDisplay comparison={comparison} />
    );

    const changeIndicator = container.querySelector('.bg-yellow-50');
    expect(changeIndicator).toBeInTheDocument();
  });

  it('should apply red colors for alert status', () => {
    const comparison: MetricComparison = {
      currentValue: 70.0,
      baselineValue: 50.0,
      percentageChange: 40.0,
      direction: 'up',
      status: 'alert',
    };

    const { container } = render(
      <MetricComparisonDisplay comparison={comparison} />
    );

    const changeIndicator = container.querySelector('.bg-red-50');
    expect(changeIndicator).toBeInTheDocument();
  });
});
