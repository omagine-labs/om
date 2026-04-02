/**
 * Unit tests for CancelSubscriptionCard component
 * Tests cancel/reactivate UI, confirmation dialogs, and button interactions
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelSubscriptionCard } from '@/components/subscription/CancelSubscriptionCard';
import { createMockSubscription } from '../../../utils/mock-subscription';

describe('CancelSubscriptionCard', () => {
  const mockOnCancel = jest.fn();
  const mockOnReactivate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Active subscription (not canceled)', () => {
    it('should show cancel subscription section when not canceled', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: false,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      expect(
        screen.getByRole('heading', { name: /cancel subscription/i })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /continue to have access until the end of your billing period/i
        )
      ).toBeInTheDocument();
    });

    it('should show cancel button when not canceled', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: false,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton).not.toBeDisabled();
    });

    it('should show confirmation dialog when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: false,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Are you sure you want to cancel/i)
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: /yes, cancel/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /keep subscription/i })
      ).toBeInTheDocument();
    });

    it('should call onCancel handler when "Yes, Cancel" is clicked', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: false,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      // Click cancel button to show confirmation
      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      await user.click(cancelButton);

      // Click "Yes, Cancel" to confirm
      const confirmButton = await screen.findByRole('button', {
        name: /yes, cancel/i,
      });
      await user.click(confirmButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('should hide confirmation dialog when "Keep Subscription" is clicked', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: false,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      // Show confirmation dialog
      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      await user.click(cancelButton);

      // Click "Keep Subscription" to dismiss
      const keepButton = await screen.findByRole('button', {
        name: /keep subscription/i,
      });
      await user.click(keepButton);

      // Confirmation dialog should be hidden
      await waitFor(() => {
        expect(
          screen.queryByText(/Are you sure you want to cancel/i)
        ).not.toBeInTheDocument();
      });

      // Original cancel button should be back
      expect(
        screen.getByRole('button', { name: /cancel subscription/i })
      ).toBeInTheDocument();
    });

    it('should disable buttons and show loading text when actionLoading is true', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: false,
      });

      const { rerender } = render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      // Show confirmation dialog
      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      await user.click(cancelButton);

      // Rerender with loading state
      rerender(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={false}
          actionLoading={true}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      const confirmButton = screen.getByRole('button', {
        name: /processing/i,
      });
      const keepButton = screen.getByRole('button', {
        name: /keep subscription/i,
      });

      expect(confirmButton).toBeDisabled();
      expect(confirmButton).toHaveTextContent('Processing...');
      expect(keepButton).toBeDisabled();
    });
  });

  describe('Canceled subscription', () => {
    it('should show canceled subscription section when isCanceled is true', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2024-12-31').toISOString(),
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={true}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      expect(screen.getByText('Subscription Canceled')).toBeInTheDocument();
      expect(
        screen.getByText(/Your subscription will end on/i)
      ).toBeInTheDocument();
    });

    it('should display formatted cancellation date', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2024-12-31T12:00:00.000Z', // Use noon UTC to avoid timezone issues
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={true}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      // Should show formatted date (formatSubscriptionDate formats as "December 31, 2024")
      expect(screen.getByText(/december.*31.*2024/i)).toBeInTheDocument();
    });

    it('should show reactivate button when canceled', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={true}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      const reactivateButton = screen.getByRole('button', {
        name: /reactivate subscription/i,
      });
      expect(reactivateButton).toBeInTheDocument();
      expect(reactivateButton).not.toBeDisabled();
    });

    it('should call onReactivate handler when reactivate button is clicked', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={true}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      const reactivateButton = screen.getByRole('button', {
        name: /reactivate subscription/i,
      });
      await user.click(reactivateButton);

      expect(mockOnReactivate).toHaveBeenCalledTimes(1);
    });

    it('should disable reactivate button and show loading text when actionLoading is true', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={true}
          actionLoading={true}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      const reactivateButton = screen.getByRole('button', {
        name: /processing/i,
      });
      expect(reactivateButton).toBeDisabled();
      expect(reactivateButton).toHaveTextContent('Processing...');
    });

    it('should not show cancel button when subscription is canceled', () => {
      const subscription = createMockSubscription({
        cancelAtPeriodEnd: true,
      });

      render(
        <CancelSubscriptionCard
          subscription={subscription}
          isCanceled={true}
          actionLoading={false}
          onCancel={mockOnCancel}
          onReactivate={mockOnReactivate}
        />
      );

      expect(
        screen.queryByRole('button', { name: /cancel subscription/i })
      ).not.toBeInTheDocument();
    });
  });
});
