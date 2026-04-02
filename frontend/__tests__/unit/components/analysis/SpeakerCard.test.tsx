/**
 * Unit tests for SpeakerCard component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpeakerCard } from '@/components/analysis/SpeakerCard';

// Mock child components
jest.mock('@/components/analysis/SpeakerAssignmentControls', () => ({
  SpeakerAssignmentControls: ({ onAssignToMe, onStartEditing }: any) => (
    <div data-testid="assignment-controls">
      <button onClick={onAssignToMe}>Assign to me</button>
      <button onClick={onStartEditing}>Edit name</button>
    </div>
  ),
}));

jest.mock('@/components/analysis/SpeakerMetricsDisplay', () => ({
  SpeakerMetricsDisplay: ({ basicMetrics }: any) => (
    <div data-testid="metrics-display">
      {basicMetrics && <span>Basic metrics</span>}
    </div>
  ),
}));

describe('SpeakerCard', () => {
  const mockOnAssignToMe = jest.fn();
  const mockOnStartEditing = jest.fn();
  const mockOnStartEditingExisting = jest.fn();
  const mockOnNameChange = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const mockFormatDuration = jest.fn((seconds) => `${seconds}s`);

  const defaultProps = {
    displayName: 'John Doe',
    isMe: false,
    isAssigned: false,
    isEditing: false,
    isAssigning: false,
    customName: '',
    onAssignToMe: mockOnAssignToMe,
    onStartEditing: mockOnStartEditing,
    onStartEditingExisting: mockOnStartEditingExisting,
    onNameChange: mockOnNameChange,
    onSave: mockOnSave,
    onCancel: mockOnCancel,
    formatDuration: mockFormatDuration,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Display Name', () => {
    it('renders speaker display name', () => {
      render(<SpeakerCard {...defaultProps} />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('displays "You" badge when speaker is current user', () => {
      render(<SpeakerCard {...defaultProps} isMe={true} displayName="You" />);
      expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    });
  });

  describe('Styling', () => {
    it('applies green styling when speaker is current user', () => {
      const { container } = render(
        <SpeakerCard {...defaultProps} isMe={true} />
      );
      const card = container.querySelector('.bg-green-50');
      expect(card).toBeInTheDocument();
    });

    it('applies default styling when speaker is not current user', () => {
      const { container } = render(
        <SpeakerCard {...defaultProps} isMe={false} />
      );
      const card = container.querySelector('.bg-gray-50');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Basic Metrics', () => {
    const basicMetrics = {
      talkTimeSeconds: 120,
      wordCount: 200,
      talkTimePercentage: 60,
    };

    it('renders basic metrics when provided', () => {
      render(<SpeakerCard {...defaultProps} basicMetrics={basicMetrics} />);
      expect(screen.getByText('Basic metrics')).toBeInTheDocument();
    });
  });

  describe('Assignment Controls Integration', () => {
    it('renders assignment controls', () => {
      render(<SpeakerCard {...defaultProps} />);
      expect(screen.getByTestId('assignment-controls')).toBeInTheDocument();
    });

    it('passes correct props to assignment controls', () => {
      render(
        <SpeakerCard
          {...defaultProps}
          isMe={true}
          isAssigned={true}
          isEditing={true}
          customName="Test Name"
        />
      );
      expect(screen.getByTestId('assignment-controls')).toBeInTheDocument();
    });
  });

  describe('Metrics Display Integration', () => {
    it('renders metrics display', () => {
      const basicMetrics = {
        talkTimeSeconds: 120,
        wordCount: 200,
        talkTimePercentage: 60,
      };

      render(<SpeakerCard {...defaultProps} basicMetrics={basicMetrics} />);
      expect(screen.getByTestId('metrics-display')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty display name', () => {
      render(<SpeakerCard {...defaultProps} displayName="" />);
      expect(screen.getByTestId('assignment-controls')).toBeInTheDocument();
    });

    it('renders without any metrics', () => {
      render(<SpeakerCard {...defaultProps} />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByTestId('assignment-controls')).toBeInTheDocument();
    });
  });
});
