import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../dashboard/App';

/**
 * App Boot Tests
 *
 * These tests verify that the app renders without crashing and shows
 * the expected sign-in UI when unauthenticated.
 */
describe('App Boot Smoke Tests', () => {
  beforeEach(() => {
    // Mock electron API to return null user (unauthenticated state)
    global.window.electronAPI = {
      auth: {
        getUser: vi.fn().mockResolvedValue(null),
      },
      checkSubscription: vi.fn().mockResolvedValue(false),
    } as any;
  });

  it('should render without crashing', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    // Wait for auth check to complete and sign-in page to render
    await waitFor(
      () => {
        expect(screen.getByText('Welcome to Om')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(
      screen.getByText('Sign in to access your meeting insights and analytics')
    ).toBeTruthy();
  });

  it('should show sign-in button', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    // Wait for sign-in button to render after auth check
    await waitFor(
      () => {
        expect(screen.getByText('Sign In')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(
      screen.getByText('This will open your browser to complete sign-in')
    ).toBeTruthy();
  });
});
