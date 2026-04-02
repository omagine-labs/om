/**
 * EmptyDashboard Component Tests
 *
 * Unit tests for the EmptyDashboard component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyDashboard } from '@/components/dashboard/states/EmptyDashboard';

describe('EmptyDashboard', () => {
  const mockOnUploadClick = jest.fn();

  beforeEach(() => {
    mockOnUploadClick.mockClear();
  });

  it('should render headline and description', () => {
    render(<EmptyDashboard onUploadClick={mockOnUploadClick} />);

    expect(
      screen.getByText(/Your insights dashboard awaits/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start recording to see your weekly insights/)
    ).toBeInTheDocument();
  });

  it('should show message about automatic detection and recording', () => {
    render(<EmptyDashboard onUploadClick={mockOnUploadClick} />);

    expect(
      screen.getByText(/automatically detects your meetings/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/start recording at any time/i)
    ).toBeInTheDocument();
  });

  it('should render upload meeting button and call callback when clicked', async () => {
    const user = userEvent.setup();
    render(<EmptyDashboard onUploadClick={mockOnUploadClick} />);

    const button = screen.getByRole('button', { name: /Upload a Meeting/i });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(mockOnUploadClick).toHaveBeenCalledTimes(1);
  });

  it('should render download app link when user does not have desktop app', () => {
    render(
      <EmptyDashboard onUploadClick={mockOnUploadClick} hasDesktopApp={false} />
    );

    const link = screen.getByRole('link', { name: /Download the App/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://omaginelabs.com/download');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('should not render download app link when user has desktop app', () => {
    render(
      <EmptyDashboard onUploadClick={mockOnUploadClick} hasDesktopApp={true} />
    );

    const link = screen.queryByRole('link', { name: /Download the App/i });
    expect(link).not.toBeInTheDocument();
  });

  it('should have proper test id', () => {
    const { container } = render(
      <EmptyDashboard onUploadClick={mockOnUploadClick} />
    );

    expect(
      container.querySelector('[data-testid="empty-dashboard"]')
    ).toBeInTheDocument();
  });
});
