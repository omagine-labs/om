# Event Taxonomy (AARRR Framework)

Complete reference for all analytics events tracked in the application.

## Overview

This document defines the standardized event taxonomy using the **AARRR (Pirate Metrics) framework**:

- **Acquisition** - How users find us (signups, referrals)
- **Activation** - Users getting initial value (first meeting recorded)
- **Retention** - Ongoing product usage (dashboard views, uploads)
- **Revenue** - Monetization (subscriptions, payments)
- **Referral** - Users bringing in new users

All events are logged to:

1. **PostHog** - Product analytics, funnels, session replay
2. **Supabase `user_event_log` table** - SQL-queryable event stream

## Using Events

```typescript
import { trackEvent, AcquisitionEvents } from '@/lib/analytics';

// Track an event
trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, {
  method: 'email',
});
```

See the "Adding New Events" section in [Analytics Documentation](./analytics.md) for implementation instructions.

---

## Acquisition Events

Events related to user acquisition and signup.

### `signup_completed`

**When to track**: User successfully completes registration

**Required properties**:

- `method` (string): Authentication method - `'email'`, `'google'`, or `'microsoft'`

**Example**:

```typescript
import { trackEvent, AcquisitionEvents } from '@/lib/analytics';

trackEvent(AcquisitionEvents.SIGNUP_COMPLETED, {
  method: 'email',
});
```

**Location**:

- Email signup: `frontend/lib/auth.ts:38`
- OAuth signup: `frontend/app/auth/callback/route.ts:55-61` (tracked when OAuth callback completes for new users)

---

### `signup_source`

**When to track**: Track where the user came from (UTM parameters, referrals)

**Required properties**:

- `source` (string): Referral source (e.g., 'google', 'twitter', 'friend')

**Optional properties**:

- `campaign` (string): Campaign identifier (e.g., 'summer_2024')
- `medium` (string): Medium (e.g., 'organic', 'paid', 'social')

**Example**:

```typescript
trackEvent(AcquisitionEvents.SIGNUP_SOURCE, {
  source: 'google',
  campaign: 'product_launch',
  medium: 'paid',
});
```

**Location**:

- UTM capture: `frontend/app/signup/page.tsx:18-31` and `frontend/app/login/page.tsx:18-31`
- Email signup tracking: `frontend/lib/auth.ts:43-56`
- OAuth signup tracking: `frontend/hooks/useSignupSourceTracking.ts` (called from dashboard)

**Note**: UTM parameters are captured on **both** signup and login pages, stored in localStorage, and tracked when the user completes signup. This prevents attribution loss when users land on the wrong page first.

---

### `oauth_login_attempt`

**When to track**: User clicks OAuth login button (before redirect)

**Required properties**:

- `provider` (string): OAuth provider - `'google'` or `'microsoft'`

**Example**:

```typescript
trackEvent(AcquisitionEvents.OAUTH_LOGIN_ATTEMPT, {
  provider: 'google',
});
```

**Location**: `frontend/lib/auth.ts:117, 149`

---

### `oauth_callback_error`

**When to track**: OAuth callback fails with an error

**Required properties**:

- `error` (string): Error message

**Optional properties**:

- `provider` (string): OAuth provider - `'google'` or `'microsoft'` (if available)

**Example**:

```typescript
trackEvent(AcquisitionEvents.OAUTH_CALLBACK_ERROR, {
  error: 'OAuth exchange failed',
  provider: 'google',
});
```

**Location**: Not tracked server-side (no user session on error). OAuth errors are logged to console for debugging.

**Note**: This event is defined but not currently tracked because OAuth errors occur before a user session is established, making it impossible to log to the user_event_log table. Errors are logged to the server console instead.

---

### `desktop_auth`

**When to track**: User successfully authenticates from the desktop app via magic link

**Required properties**:

- `source` (string): Authentication source - always `'desktop'`
- `intent` (string): User's intent for authentication (e.g., `'subscribe'`, `'unknown'`)

**Example**:

```typescript
trackEvent(AcquisitionEvents.DESKTOP_AUTH, {
  source: 'desktop',
  intent: 'subscribe',
});
```

**Location**: `frontend/hooks/useDesktopAuth.ts:111-114`

**Flow**:

1. Desktop app redirects to web app with auth tokens in URL params
2. Web app auto-logs in the user via `setSession()`
3. Event is tracked to measure desktop app acquisition
4. User is redirected based on intent (e.g., to paywall for subscription)
5. After successful payment, user is redirected back to desktop app via hash fragment:
   - Format: `om://auth/success#access_token=xxx&refresh_token=yyy&expires_at=timestamp`
   - Hash fragments are more secure (not sent to servers, not in server logs)

**Note**: This event tracks users who authenticate through the desktop application, allowing us to measure desktop app adoption and conversion rates.

---

## Activation Events

Events indicating users are experiencing the core value proposition.

### `first_meeting_recorded`

**When to track**: User's first processing job completes successfully

**Required properties**:

- `source` (string): How meeting was added - `'upload'`

**Example**:

```typescript
// Tracked automatically on backend when first job completes
// Backend logs to user_event_log table
{
  source: 'upload';
}
```

**Location**: `python-backend/app/services/orchestrator.py:180-197` (backend tracking)

---

### `weekly_roundup_viewed`

**When to track**: User views their weekly meeting roundup

**Required properties**:

- `week` (string): ISO week identifier (e.g., '2024-W15')
- `meeting_count` (number): Number of meetings in the roundup

**Example**:

```typescript
trackEvent(ActivationEvents.WEEKLY_ROUNDUP_VIEWED, {
  week: '2024-W15',
  meeting_count: 8,
});
```

**Location**: Not yet implemented - add when weekly roundup feature is built

---

### `user_logged_in`

**When to track**: User successfully logs in

**Required properties**:

- `method` (string): Login method - `'email'`, `'google'`, or `'microsoft'`

**Example**:

```typescript
trackEvent(ActivationEvents.USER_LOGGED_IN, {
  method: 'email',
});
```

**Location**:

- Email login: `frontend/lib/auth.ts:80`
- OAuth login: `frontend/app/auth/callback/route.ts:64-70` (tracked when OAuth callback completes for existing users)

---

## Engagement Events

Events related to ongoing product usage and user engagement. These are key signals for measuring retention and active usage.

### `dashboard_viewed`

**When to track**: User views the main dashboard page

**Optional properties**:

- `meeting_count` (number): Number of meetings visible on dashboard

**Example**:

```typescript
trackEvent(EngagementEvents.DASHBOARD_VIEWED, {
  meeting_count: 12,
});
```

**Location**: `frontend/app/(auth)/dashboard/page.tsx:40`

**Note**: This is a core retention signal - indicates user returning to the app.

---

### `analysis_viewed`

**When to track**: User opens the analysis panel for a specific meeting

**Required properties**:

- `meeting_id` (string): Meeting identifier

**Example**:

```typescript
trackEvent(EngagementEvents.ANALYSIS_VIEWED, {
  meeting_id: 'abc123',
});
```

**Location**: `frontend/components/AnalysisPanel.tsx:97`

**Note**: Indicates value realization - user viewing insights from their meeting.

---

### `meeting_analyzed`

**When to track**: Every time a meeting analysis completes successfully (backend event)

**Required properties**:

- `source` (string): How the meeting was added - `'upload'`
- `meeting_id` (string): Meeting identifier

**Optional properties**:

- `processing_time_seconds` (number): Time taken to analyze the meeting

**Example**:

```typescript
// Tracked automatically on backend when job completes
// Backend logs to user_event_log table
{
  source: 'upload',
  meeting_id: 'abc123'
}
```

**Location**: `python-backend/app/services/orchestrator.py:181-203` (backend tracking)

**Note**: This event tracks EVERY analyzed meeting (unlike `first_meeting_recorded` which only fires once). Use this for engagement metrics like "meetings analyzed per week" and user activity tiers (light/active/power users).

---

## Tech Health Events

Events for debugging and technical monitoring. These are NOT part of AARRR metrics but useful for operational monitoring.

### `upload_failed`

**When to track**: File upload fails

**Required properties**:

- `file_type` (string): File MIME type
- `file_size` (number): File size in bytes
- `error` (string): Error message

**Example**:

```typescript
trackEvent(TechEvents.UPLOAD_FAILED, {
  file_type: 'video/mp4',
  file_size: 15728640,
  error: 'Network error',
});
```

**Location**: `frontend/hooks/useFileUpload.ts:144`

**Note**: Use for debugging upload issues. Not included in AARRR dashboards.

---

## Revenue Events

Events related to monetization, subscriptions, and payments.

### `pricing_viewed`

**When to track**: User views the pricing page

**Optional properties**:

- `source` (string): Where they came from (e.g., 'dashboard', 'marketing_site')

**Example**:

```typescript
trackEvent(RevenueEvents.PRICING_VIEWED, {
  source: 'dashboard',
});
```

**Location**: Not yet implemented - add when pricing page is created

---

### `plan_selected`

**When to track**: User clicks on a specific pricing plan

**Required properties**:

- `plan_id` (string): Plan identifier (e.g., 'pro', 'enterprise')
- `interval` (string): Billing interval - `'monthly'` or `'yearly'`
- `amount_cents` (number): Price in cents

**Example**:

```typescript
trackEvent(RevenueEvents.PLAN_SELECTED, {
  plan_id: 'pro',
  interval: 'monthly',
  amount_cents: 2900,
});
```

**Location**: Not yet implemented - add when pricing page is created

---

### `checkout_started`

**When to track**: User initiates Stripe checkout flow

**Required properties**:

- `plan_id` (string): Plan identifier
- `interval` (string): Billing interval - `'monthly'` or `'yearly'`

**Example**:

```typescript
trackEvent(RevenueEvents.CHECKOUT_STARTED, {
  plan_id: 'pro',
  interval: 'monthly',
});
```

**Location**: Not yet implemented - add when Stripe checkout is initiated

---

### `subscription_created`

**When to track**: Stripe webhook confirms new subscription created

**Required properties**:

- `subscription_id` (string): Stripe subscription ID
- `plan_id` (string): Plan identifier
- `interval` (string): Billing interval - `'monthly'` or `'yearly'`
- `amount_cents` (number): Amount in cents

**Example**:

```typescript
// Tracked automatically by Stripe webhook (backend server-side)
// Event logged to user_event_log table
{
  subscription_id: 'sub_123abc',
  plan_id: 'monthly',
  interval: 'monthly',
  amount_cents: 2900
}
```

**Location**: `frontend/app/api/webhooks/stripe/route.ts:215-220` (backend Stripe webhook handler)

---

### `subscription_upgraded`

**When to track**: User upgrades their subscription plan

**Required properties**:

- `subscription_id` (string): Stripe subscription ID
- `from_plan` (string): Previous plan
- `to_plan` (string): New plan

**Example**:

```typescript
// Tracked automatically by Stripe webhook (backend server-side)
// Event logged to user_event_log table
{
  subscription_id: 'sub_123abc',
  from_plan: 'monthly',
  to_plan: 'annual'
}
```

**Location**: `frontend/app/api/webhooks/stripe/route.ts:276-284` (backend Stripe webhook handler)

---

### `subscription_downgraded`

**When to track**: User downgrades their subscription plan

**Required properties**:

- `subscription_id` (string): Stripe subscription ID
- `from_plan` (string): Previous plan
- `to_plan` (string): New plan

**Example**:

```typescript
// Tracked automatically by Stripe webhook (backend server-side)
// Event logged to user_event_log table
{
  subscription_id: 'sub_123abc',
  from_plan: 'annual',
  to_plan: 'monthly'
}
```

**Location**: `frontend/app/api/webhooks/stripe/route.ts:276-284` (backend Stripe webhook handler)

---

### `subscription_canceled`

**When to track**: User cancels their subscription

**Required properties**:

- `subscription_id` (string): Stripe subscription ID
- `plan_id` (string): Plan being canceled

**Optional properties**:

- `reason` (string): Cancellation reason if provided

**Example**:

```typescript
// Tracked automatically by Stripe webhook (backend server-side)
// Event logged to user_event_log table
{
  subscription_id: 'sub_123abc',
  plan_id: 'monthly',
  reason: 'Too expensive'  // if provided
}
```

**Location**: `frontend/app/api/webhooks/stripe/route.ts:335-339` (backend Stripe webhook handler)

---

### `payment_succeeded`

**When to track**: Stripe payment succeeds

**Required properties**:

- `payment_id` (string): Stripe payment intent ID
- `amount_cents` (number): Amount in cents

**Example**:

```typescript
// Tracked automatically by Stripe webhook (backend server-side)
// Event logged to user_event_log table
{
  payment_id: 'pi_123abc',
  amount_cents: 2900
}
```

**Location**: `frontend/app/api/webhooks/stripe/route.ts:527-534` (backend Stripe webhook handler)

---

### `payment_failed`

**When to track**: Stripe payment fails

**Required properties**:

- `error` (string): Error message

**Optional properties**:

- `payment_id` (string): Stripe payment intent ID if available

**Example**:

```typescript
// Tracked automatically by Stripe webhook (backend server-side)
// Event logged to user_event_log table
{
  payment_id: 'pi_123abc',
  error: 'Insufficient funds'
}
```

**Location**: `frontend/app/api/webhooks/stripe/route.ts:608-614` (backend Stripe webhook handler)

---

## Monitoring Events

Events for tracking anonymous upload system health, fraud prevention, and capacity management. These events are used for team alerts and daily digests.

**Implementation**: `supabase/functions/create-anonymous-meeting/index.ts` and `supabase/functions/_shared/analytics.ts`

### `anon_upload_succeeded`

**When to track**: Anonymous meeting upload succeeds

**Required properties**:

- `email` (string): User's email (normalized)
- `file_size` (number): File size in bytes
- `file_type` (string): File extension (e.g., 'mp4', 'webm', 'mp3')
- `ip_hash` (string): Hashed IP address for privacy (first 16 chars of SHA-256)

**Example**:

```typescript
// Tracked automatically by create-anonymous-meeting Edge Function
{
  email: 'user@example.com',
  file_size: 52428800,  // 50 MB
  file_type: 'mp4',
  ip_hash: 'a1b2c3d4e5f6g7h8'
}
```

**Location**: `supabase/functions/create-anonymous-meeting/index.ts:554-561`

---

### `anon_upload_failed`

**When to track**: Anonymous meeting upload fails

**Required properties**:

- `error` (string): Error message

**Optional properties**:

- `email` (string): User's email if available
- `file_size` (number): File size in bytes if available
- `file_type` (string): File extension if available
- `ip_hash` (string): Hashed IP address if available

**Example**:

```typescript
// Tracked automatically by create-anonymous-meeting Edge Function
{
  email: 'user@example.com',
  error: 'Storage bucket unavailable',
  file_size: 52428800,
  file_type: 'mp4',
  ip_hash: 'a1b2c3d4e5f6g7h8'
}
```

**Location**: `supabase/functions/create-anonymous-meeting/index.ts:579-590`

---

### `anon_upload_capacity_warning`

**When to track**: Monthly capacity reaches 90%+ usage

**Required properties**:

- `current_count` (number): Current number of uploads this month
- `max_capacity` (number): Maximum allowed uploads per month (500)
- `percentage_used` (number): Percentage of capacity used

**Example**:

```typescript
// Tracked automatically by create-anonymous-meeting Edge Function
{
  current_count: 452,
  max_capacity: 500,
  percentage_used: 90
}
```

**Alert Trigger**: Team receives real-time alert when this event is tracked

**Location**: `supabase/functions/create-anonymous-meeting/index.ts:264-277`

---

### `anon_upload_rate_limited`

**When to track**: User hits rate limit (per-email, per-IP, or distributed abuse)

**Required properties**:

- `email` (string): User's email
- `limit_type` (string): Type of rate limit - `'per_email'`, `'per_ip'`, or `'distributed_abuse'`
- `current_count` (number): Current count that triggered the limit
- `max_allowed` (number): Maximum allowed count
- `ip_hash` (string): Hashed IP address

**Example**:

```typescript
// Per-email limit
{
  email: 'user@example.com',
  limit_type: 'per_email',
  current_count: 1,
  max_allowed: 1,
  ip_hash: 'a1b2c3d4e5f6g7h8'
}

// Per-IP limit (5 uploads per hour)
{
  email: 'user@example.com',
  limit_type: 'per_ip',
  current_count: 5,
  max_allowed: 5,
  ip_hash: 'a1b2c3d4e5f6g7h8'
}
```

**Location**: `supabase/functions/create-anonymous-meeting/index.ts:293-301` (per-IP) and `index.ts:366-374` (per-email)

---

### `anon_upload_fraud_detected`

**When to track**: Fraud pattern detected (duplicate content, invalid user-agent, etc.)

**Required properties**:

- `email` (string): User's email
- `reason` (string): Fraud detection reason - `'invalid_user_agent'`, `'duplicate_content'`, `'suspicious_pattern'`, or `'multiple_emails_from_ip'`
- `details` (string): Additional context about the fraud detection
- `ip_hash` (string): Hashed IP address

**Example**:

```typescript
// Invalid User-Agent
{
  email: 'bot@example.com',
  reason: 'invalid_user_agent',
  details: 'User-Agent: curl/7.68.0',
  ip_hash: 'a1b2c3d4e5f6g7h8'
}

// Duplicate file content
{
  email: 'user@example.com',
  reason: 'duplicate_content',
  details: 'File hash: a1b2c3d4e5f6g7h8..., previously uploaded by other@example.com',
  ip_hash: 'x1y2z3w4v5u6t7s8'
}
```

**Location**: `supabase/functions/create-anonymous-meeting/index.ts:173-180` (user-agent) and `index.ts:439-446` (duplicate)

---

### `anon_upload_ip_blocked`

**When to track**: IP blocked for distributed abuse (10+ emails from same IP)

**Required properties**:

- `ip_hash` (string): Hashed IP address that was blocked
- `email_count` (number): Number of different emails from this IP
- `max_allowed` (number): Maximum allowed emails per IP (10)

**Example**:

```typescript
// Tracked automatically by create-anonymous-meeting Edge Function
{
  ip_hash: 'a1b2c3d4e5f6g7h8',
  email_count: 12,
  max_allowed: 10
}
```

**Alert Trigger**: Team receives real-time alert when this event is tracked

**Location**: `supabase/functions/create-anonymous-meeting/index.ts:358-373`

---

## Querying Events

Events are stored in the `user_event_log` Supabase table. Example queries:

### Get all events for a user

```sql
SELECT * FROM user_event_log
WHERE user_id = auth.uid()
ORDER BY created_at DESC;
```

### Count events by type

```sql
SELECT event_name, COUNT(*)
FROM user_event_log
GROUP BY event_name
ORDER BY COUNT(*) DESC;
```

### Signup source distribution

```sql
SELECT payload->>'source' as source, COUNT(*)
FROM user_event_log
WHERE event_name = 'signup_source'
GROUP BY source;
```

### Upload success rate

```sql
SELECT
  COUNT(*) FILTER (WHERE event_name = 'upload_completed') as successful,
  COUNT(*) FILTER (WHERE event_name = 'upload_failed') as failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_name = 'upload_completed') /
    COUNT(*) FILTER (WHERE event_name IN ('upload_completed', 'upload_failed')),
    2
  ) as success_rate_pct
FROM user_event_log
WHERE event_name IN ('upload_completed', 'upload_failed');
```

---

## Validation

In development mode, the `trackEvent()` function validates event names against this taxonomy and logs warnings for unknown events:

```
[Analytics] Unknown event: "usr_signed_up". This event is not in the AARRR taxonomy.
Please add it to frontend/types/analytics.ts or check for typos.
```

This helps catch typos and ensures consistency.

---

## Related Documentation

- [Analytics Overview](./analytics.md) - PostHog integration, dual-logging architecture, and how to add new events
- [Database Schema](./database.md) - user_event_log table structure
