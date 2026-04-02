/**
 * Unit tests for SpeakerAssignmentControls component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpeakerAssignmentControls } from '@/components/analysis/SpeakerAssignmentControls';

describe('SpeakerAssignmentControls', () => {
  const mockOnAssignToMe = jest.fn();
  const mockOnStartEditing = jest.fn();
  const mockOnStartEditingExisting = jest.fn();
  const mockOnNameChange = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  const defaultProps = {
    isMe: false,
    isAssigned: false,
    isEditing: false,
    isAssigning: false,
    customName: '',
    displayName: 'SPEAKER_00',
    onAssignToMe: mockOnAssignToMe,
    onStartEditing: mockOnStartEditing,
    onStartEditingExisting: mockOnStartEditingExisting,
    onNameChange: mockOnNameChange,
    onSave: mockOnSave,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Unassigned Speaker', () => {
    it('shows "This is me" button for unassigned speaker', () => {
      render(<SpeakerAssignmentControls {...defaultProps} />);
      expect(screen.getByText('This is me')).toBeInTheDocument();
    });

    it('shows "Assign name" button for unassigned speaker', () => {
      render(<SpeakerAssignmentControls {...defaultProps} />);
      expect(screen.getByText('Assign name')).toBeInTheDocument();
    });

    it('calls onAssignToMe when "This is me" is clicked', () => {
      render(<SpeakerAssignmentControls {...defaultProps} />);
      fireEvent.click(screen.getByText('This is me'));
      expect(mockOnAssignToMe).toHaveBeenCalledTimes(1);
    });

    it('calls onStartEditing when "Assign name" is clicked', () => {
      render(<SpeakerAssignmentControls {...defaultProps} />);
      fireEvent.click(screen.getByText('Assign name'));
      expect(mockOnStartEditing).toHaveBeenCalledTimes(1);
    });

    it('disables buttons when assigning', () => {
      render(
        <SpeakerAssignmentControls {...defaultProps} isAssigning={true} />
      );

      const assignButton = screen.getByText('Assigning...');
      const nameButton = screen.getByText('Assign name');

      expect(assignButton).toBeDisabled();
      expect(nameButton).toBeDisabled();
    });
  });

  describe('Assigned Speaker (Not Me)', () => {
    it('does not show "This is me" button for assigned speaker', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isAssigned={true}
          displayName="John Doe"
        />
      );
      expect(screen.queryByText('This is me')).not.toBeInTheDocument();
    });

    it('shows "Edit name" button for assigned speaker', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isAssigned={true}
          displayName="John Doe"
        />
      );
      expect(screen.getByText('Edit name')).toBeInTheDocument();
    });

    it('calls onStartEditingExisting when "Edit name" is clicked', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isAssigned={true}
          displayName="John Doe"
        />
      );
      fireEvent.click(screen.getByText('Edit name'));
      expect(mockOnStartEditingExisting).toHaveBeenCalledTimes(1);
    });
  });

  describe('Current User Speaker', () => {
    it('does not show assignment buttons when speaker is me', () => {
      render(<SpeakerAssignmentControls {...defaultProps} isMe={true} />);
      expect(screen.queryByText('This is me')).not.toBeInTheDocument();
      expect(screen.queryByText('Assign name')).not.toBeInTheDocument();
    });
  });

  describe('Editing Mode', () => {
    it('shows input field when editing', () => {
      render(<SpeakerAssignmentControls {...defaultProps} isEditing={true} />);
      expect(
        screen.getByPlaceholderText('e.g., John Smith')
      ).toBeInTheDocument();
    });

    it('shows save and cancel buttons when editing', () => {
      render(<SpeakerAssignmentControls {...defaultProps} isEditing={true} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('calls onNameChange when input value changes', () => {
      render(<SpeakerAssignmentControls {...defaultProps} isEditing={true} />);
      const input = screen.getByPlaceholderText('e.g., John Smith');
      fireEvent.change(input, { target: { value: 'New Name' } });
      expect(mockOnNameChange).toHaveBeenCalledWith('New Name');
    });

    it('calls onSave when save button is clicked', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName="New Name"
        />
      );
      fireEvent.click(screen.getByText('Save'));
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(<SpeakerAssignmentControls {...defaultProps} isEditing={true} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('disables save button when custom name is empty', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName=""
        />
      );
      const saveButton = screen.getByText('Save');
      expect(saveButton).toBeDisabled();
    });

    it('enables save button when custom name is provided', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName="New Name"
        />
      );
      const saveButton = screen.getByText('Save');
      expect(saveButton).not.toBeDisabled();
    });

    it('disables save button when assigning', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          isAssigning={true}
          customName="New Name"
        />
      );
      const saveButton = screen.getByText('Save');
      expect(saveButton).toBeDisabled();
    });

    it('displays custom name value in input', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName="Test Name"
        />
      );
      const input = screen.getByPlaceholderText(
        'e.g., John Smith'
      ) as HTMLInputElement;
      expect(input.value).toBe('Test Name');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('calls onSave when Enter key is pressed', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName="New Name"
        />
      );
      const input = screen.getByPlaceholderText('e.g., John Smith');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('calls onSave when Enter is pressed even with empty name (validation in hook)', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName=""
        />
      );
      const input = screen.getByPlaceholderText('e.g., John Smith');
      fireEvent.keyDown(input, { key: 'Enter' });
      // Component calls onSave, the hook handles empty name validation
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Escape key is pressed', () => {
      render(<SpeakerAssignmentControls {...defaultProps} isEditing={true} />);
      const input = screen.getByPlaceholderText('e.g., John Smith');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('does not trigger shortcuts for other keys', () => {
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName="Test"
        />
      );
      const input = screen.getByPlaceholderText('e.g., John Smith');
      fireEvent.keyDown(input, { key: 'a' });
      expect(mockOnSave).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  describe('Visual States', () => {
    it('applies correct styling to buttons', () => {
      render(<SpeakerAssignmentControls {...defaultProps} />);
      const assignButton = screen.getByText('This is me');
      expect(assignButton.className).toContain('bg-blue-600');
    });

    it('shows loading state when assigning', () => {
      render(
        <SpeakerAssignmentControls {...defaultProps} isAssigning={true} />
      );
      const assignButton = screen.getByText('Assigning...');
      expect(assignButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long custom names', () => {
      const longName = 'A'.repeat(100);
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName={longName}
        />
      );
      const input = screen.getByPlaceholderText(
        'e.g., John Smith'
      ) as HTMLInputElement;
      expect(input.value).toBe(longName);
    });

    it('handles special characters in custom name', () => {
      const specialName = '@#$%^&*()';
      render(
        <SpeakerAssignmentControls
          {...defaultProps}
          isEditing={true}
          customName={specialName}
        />
      );
      const input = screen.getByPlaceholderText(
        'e.g., John Smith'
      ) as HTMLInputElement;
      expect(input.value).toBe(specialName);
    });

    it('handles rapid state changes', () => {
      const { rerender } = render(
        <SpeakerAssignmentControls {...defaultProps} isEditing={false} />
      );

      rerender(
        <SpeakerAssignmentControls {...defaultProps} isEditing={true} />
      );
      expect(
        screen.getByPlaceholderText('e.g., John Smith')
      ).toBeInTheDocument();

      rerender(
        <SpeakerAssignmentControls {...defaultProps} isEditing={false} />
      );
      expect(
        screen.queryByPlaceholderText('e.g., John Smith')
      ).not.toBeInTheDocument();
    });
  });
});
