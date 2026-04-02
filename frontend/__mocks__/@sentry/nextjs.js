// Mock for @sentry/nextjs in Jest tests
module.exports = {
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  init: jest.fn(),
  withSentryConfig: jest.fn((config) => config),
};
