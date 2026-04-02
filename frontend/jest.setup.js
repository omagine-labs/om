// Set Stripe environment variables for all tests
process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID = 'price_monthly_test';
process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID = 'price_annual_test';
process.env.NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID = 'internal_coupon';

// Set Supabase environment variables for all tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test_anon_key_for_jest';

// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfill fetch and Response for integration tests
import 'whatwg-fetch';
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill Response.json for Next.js API routes
if (!Response.json) {
  Response.json = function (data, init) {
    return new Response(JSON.stringify(data), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  };
}

// Mock NextResponse.json() for integration tests
// NextResponse is a Next.js class that extends Response
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');

  return {
    ...actual,
    NextResponse: class NextResponse extends actual.NextResponse {
      static json(data, init) {
        // Create a proper Response with JSON body
        const body = JSON.stringify(data);
        const response = new actual.NextResponse(body, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
          },
        });
        return response;
      }
    },
  };
});

// Suppress expected console errors during tests to keep output clean
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    // Suppress known noisy warnings/errors that don't affect test validity
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('Failed to fetch subscription') || // Expected errors from error handling tests
      message.includes('Error fetching upcoming invoice') || // Expected errors from invoice mock tests
      message.includes('Error fetching Stripe subscription') || // Expected errors from Stripe error tests
      message.includes('Database error fetching subscription') || // Expected errors from database error tests
      message.includes('Unexpected error') || // Expected errors from error handling tests
      message.includes('Stripe checkout session creation error') || // Expected errors from checkout session tests
      message.includes('Stripe plan change error') || // Expected errors from change-plan tests
      message.includes('Stripe subscription cancellation error') || // Expected errors from cancel tests
      message.includes('Stripe subscription reactivation error') || // Expected errors from reactivate tests
      message.includes('Stripe subscription creation error') || // Expected errors from create tests
      message.includes('Failed to update subscription in database') || // Expected database errors
      message.includes('Failed to insert subscription') || // Expected database errors
      message.includes('STRIPE_WEBHOOK_SECRET is not configured') || // Expected webhook config test
      message.includes('Webhook signature verification failed') || // Expected webhook signature tests
      message.includes('[Stripe Webhook] Error processing webhook') || // Expected webhook error handling tests
      message.includes('Missing metadata') || // Expected errors from malformed webhook tests
      message.includes('[DesktopAuth]') || // Desktop auth flow logs (validation tests)
      message.includes('Error loading dashboard') || // Expected errors from dashboard error tests
      message.includes('Error in getDashboardData') || // Expected errors from dashboard action tests
      message.includes('Error counting meetings') || // Expected errors from dashboard action tests
      message.includes('Error in getMeetingCount') || // Expected errors from dashboard action tests
      message.includes('Error fetching chart data') // Expected errors from chart data tests
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Suppress console logs during tests to keep output clean
const originalLog = console.log;
beforeAll(() => {
  console.log = (...args) => {
    // Suppress known noisy logs that don't affect test validity
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('[Stripe Webhook]') || // Webhook event logging
      message.includes('[checkout.session.completed]') || // Webhook handler logs
      message.includes('[customer.subscription.created]') || // Webhook handler logs
      message.includes('[customer.subscription.updated]') || // Webhook handler logs
      message.includes('[customer.subscription.deleted]') || // Webhook handler logs
      message.includes('[customer.subscription.trial_will_end]') || // Webhook handler logs
      message.includes('[invoice.payment_succeeded]') || // Webhook handler logs
      message.includes('[invoice.payment_failed]') || // Webhook handler logs
      message.includes('[payment_intent.succeeded]') || // Webhook handler logs
      message.includes('[payment_intent.payment_failed]') || // Webhook handler logs
      message.includes('[customer.created]') || // Webhook handler logs
      message.includes('[customer.updated]') || // Webhook handler logs
      message.includes('[customer.deleted]') || // Webhook handler logs
      message.includes('Trial ends at:') || // Webhook handler logs
      message.includes('[DesktopAuth]') || // Desktop auth flow logs (validation tests)
      message.includes('[WeeklyDashboard]') || // Dashboard navigation logs
      message.includes('[Dashboard]') // Dashboard action logs
    ) {
      return;
    }
    originalLog.call(console, ...args);
  };
});

afterAll(() => {
  console.log = originalLog;
});
