# Subscription Management API

Complete API documentation for subscription management endpoints.

**Implementation:** Stripe subscription management
**Stripe Mode:** Test/Sandbox
**Authentication:** Required for all endpoints (except webhook)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Error Handling](#error-handling)
5. [Endpoints](#endpoints)
   - [GET /api/subscriptions/current](#get-apisubscriptionscurrent)
   - [POST /api/subscriptions/checkout-session](#post-apisubscriptionscheckout-session)
   - [POST /api/subscriptions/create](#post-apisubscriptionscreate)
   - [PATCH /api/subscriptions/change-plan](#patch-apisubscriptionschange-plan)
   - [POST /api/subscriptions/cancel](#post-apisubscriptionscancel)
   - [POST /api/subscriptions/reactivate](#post-apisubscriptionsreactivate)
   - [DELETE /api/subscriptions/delete-account](#delete-apisubscriptionsdelete-account)
   - [POST /api/webhooks/stripe](#post-apiwebhooksstripe)
6. [Webhook Events](#webhook-events)
7. [Testing](#testing)
8. [Environment Variables](#environment-variables)

---

## Overview

This API provides complete subscription lifecycle management using Stripe:

- **Subscription Plans:** Monthly ($20/month) and Annual ($180/year with 25% savings)
- **Trial Period:** 14 days (one-time per user)
- **Internal Coupon:** 100% off forever for team members (`YOUR_COUPON_ID`)
- **Payment Method:** Stripe Checkout or direct subscription creation
- **Features:** Plan changes with proration, cancellation at period end, reactivation, account deletion

**Architecture:**

- Frontend → Stripe (via API endpoints) → Supabase Database
- Webhooks keep database in sync with Stripe events
- RLS policies ensure users can only access their own data

---

## Authentication

All endpoints (except webhook) require authentication via Supabase session cookie.

**Authenticated requests automatically include:**

- User ID from session (`auth.uid()`)
- RLS policies enforce data isolation

**Unauthenticated requests return:**

```json
{
  "success": false,
  "error": {
    "message": "Unauthorized",
    "code": "UNAUTHORIZED"
  }
}
```

**Status Code:** 401

---

## Rate Limiting

All subscription endpoints are protected with per-user rate limiting to prevent abuse and ensure fair usage.

### Rate Limits by Endpoint

| Endpoint                 | Limit       | Window     | Use Case                       |
| ------------------------ | ----------- | ---------- | ------------------------------ |
| `GET /current`           | 30 requests | 5 minutes  | Frequent status checks         |
| `POST /checkout-session` | 10 requests | 5 minutes  | Creating checkout sessions     |
| `POST /create`           | 5 requests  | 10 minutes | Direct subscription creation   |
| `PATCH /change-plan`     | 5 requests  | 10 minutes | Plan changes                   |
| `POST /cancel`           | 5 requests  | 10 minutes | Subscription cancellation      |
| `POST /reactivate`       | 5 requests  | 10 minutes | Reactivating subscription      |
| `DELETE /delete-account` | 3 requests  | 10 minutes | Account deletion (destructive) |

### Response Headers

When a request is rate-limited, the following headers are returned:

- `X-RateLimit-Limit`: Maximum requests allowed in the window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets

### Rate Limit Exceeded Response

When the rate limit is exceeded, the API returns a `429 Too Many Requests` response:

```json
{
  "error": "Too many requests. Please try again later.",
  "retryAfter": 120
}
```

The `Retry-After` header indicates how many seconds to wait before retrying.

### Implementation Details

Rate limiting is implemented using an in-memory sliding window algorithm:

- **Scope**: Per user (based on authenticated user ID)
- **Storage**: In-memory (resets on server restart)
- **Algorithm**: Sliding window with automatic cleanup
- **Cleanup**: Every 5 minutes to prevent memory leaks

### Testing Rate Limits

To test rate limiting locally:

```bash
# Make rapid requests to trigger rate limit
for i in {1..15}; do
  curl http://localhost:3000/api/subscriptions/current \
    -H "Cookie: sb-access-token=..." \
    -i
done
```

### Production Considerations

For production environments with multiple server instances, consider:

- Migrating to Redis-based rate limiting for shared state
- Implementing distributed rate limiting across instances
- Adding IP-based rate limiting as an additional layer

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

**Common Error Codes:**

- `UNAUTHORIZED` (401) - User not authenticated
- `INVALID_REQUEST` (400) - Invalid JSON or missing fields
- `INVALID_PLAN` (400) - Invalid plan type
- `DUPLICATE_SUBSCRIPTION` (409) - User already has active subscription
- `SUBSCRIPTION_NOT_FOUND` (404) - No subscription found
- `SUBSCRIPTION_NOT_ACTIVE` (400) - Subscription not in active/trialing state
- `SAME_PLAN` (400) - Attempting to change to current plan
- `ALREADY_CANCELED` (409) - Subscription already scheduled for cancellation
- `NOT_CANCELED` (409) - Subscription not scheduled for cancellation (cannot reactivate)
- `FORBIDDEN_OPERATION` (403) - Operation not allowed in current state
- `STRIPE_API_ERROR` (500) - Stripe API call failed
- `INTERNAL_ERROR` (500) - Unexpected server error

---

## Endpoints

### GET /api/subscriptions/current

Get the authenticated user's current subscription details.

**Method:** GET
**Auth:** Required
**Rate Limit:** 30 requests per 5 minutes

**Request:**

```bash
curl https://your-domain.com/api/subscriptions/current \
  -H "Cookie: sb-access-token=..."
```

**Success Response (200):**

```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "status": "active",
    "planType": "monthly",
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx",
    "stripePriceId": "price_xxx",
    "trialStart": "2025-01-01T00:00:00.000Z",
    "trialEnd": "2025-01-15T00:00:00.000Z",
    "currentPeriodStart": "2025-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2025-02-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "canceledAt": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**No Subscription (404):**

```json
{
  "success": false,
  "error": {
    "message": "No subscription found for this user",
    "code": "SUBSCRIPTION_NOT_FOUND"
  }
}
```

**Subscription Statuses:**

- `trialing` - In 14-day trial period
- `active` - Active paid subscription
- `canceled` - Canceled (access ended)
- `past_due` - Payment failed, retrying
- `incomplete` - Initial payment incomplete
- `incomplete_expired` - Initial payment failed
- `unpaid` - Final payment failure

---

### POST /api/subscriptions/checkout-session

Create a Stripe Checkout Session for subscription purchase.

**Method:** POST
**Auth:** Required
**Rate Limit:** 10 requests per 5 minutes

**Request:**

```bash
curl -X POST https://your-domain.com/api/subscriptions/checkout-session \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{
    "planType": "monthly",
    "successUrl": "https://your-app.com/success",
    "cancelUrl": "https://your-app.com/cancel",
    "couponCode": "YOUR_COUPON_ID"
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| planType | string | Yes | `"monthly"` or `"annual"` |
| successUrl | string | Yes | Redirect URL on success |
| cancelUrl | string | Yes | Redirect URL on cancel |
| couponCode | string | No | Coupon code for internal team |

**Success Response (201):**

```json
{
  "success": true,
  "sessionId": "cs_xxx",
  "url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "trialEligible": true
}
```

**Error - Already Subscribed (409):**

```json
{
  "success": false,
  "error": {
    "message": "User already has an active subscription",
    "code": "DUPLICATE_SUBSCRIPTION"
  }
}
```

**Usage:**

1. Call endpoint to get checkout URL
2. Redirect user to `url`
3. User completes payment in Stripe Checkout
4. Stripe redirects to `successUrl` or `cancelUrl`
5. Webhook creates subscription record in database

---

### POST /api/subscriptions/create

Create a subscription directly via API (without Checkout Session).

**Method:** POST
**Auth:** Required
**Rate Limit:** 5 requests per 10 minutes

**Request:**

```bash
curl -X POST https://your-domain.com/api/subscriptions/create \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{
    "planType": "annual",
    "applyTrial": true,
    "couponCode": "YOUR_COUPON_ID"
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| planType | string | Yes | `"monthly"` or `"annual"` |
| applyTrial | boolean | No | Apply 14-day trial if eligible (default: true) |
| couponCode | string | No | Coupon code |

**Success Response (201):**

```json
{
  "success": true,
  "subscription": {
    "id": "sub_xxx",
    "status": "trialing",
    "planType": "annual",
    "trialStart": "2025-01-01T00:00:00.000Z",
    "trialEnd": "2025-01-15T00:00:00.000Z",
    "currentPeriodEnd": "2026-01-01T00:00:00.000Z",
    "clientSecret": "pi_xxx_secret_xxx"
  }
}
```

**Usage:**

- If `clientSecret` is returned, frontend must confirm payment with Stripe.js
- With 100% off coupon, no payment needed (clientSecret will be null)
- Trial users won't be charged until trial ends

---

### PATCH /api/subscriptions/change-plan

Change subscription plan between monthly and annual.

**Method:** PATCH
**Auth:** Required
**Rate Limit:** 5 requests per 10 minutes

**Request:**

```bash
curl -X PATCH https://your-domain.com/api/subscriptions/change-plan \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{
    "newPlanType": "annual"
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| newPlanType | string | Yes | `"monthly"` or `"annual"` |

**Success Response (200):**

```json
{
  "success": true,
  "subscription": {
    "id": "sub_xxx",
    "status": "active",
    "planType": "annual",
    "currentPeriodStart": "2025-01-15T00:00:00.000Z",
    "currentPeriodEnd": "2026-01-15T00:00:00.000Z"
  }
}
```

**Error - Same Plan (400):**

```json
{
  "success": false,
  "error": {
    "message": "Subscription is already on annual plan",
    "code": "SAME_PLAN"
  }
}
```

**Proration:**

- Stripe automatically calculates proration
- Upgrade (monthly → annual): Charges prorated difference
- Downgrade (annual → monthly): Credits prorated difference
- Changes take effect immediately

---

### POST /api/subscriptions/cancel

Cancel subscription at the end of the current billing period.

**Method:** POST
**Auth:** Required
**Rate Limit:** 5 requests per 10 minutes

**Request:**

```bash
curl -X POST https://your-domain.com/api/subscriptions/cancel \
  -H "Cookie: sb-access-token=..."
```

**Request Body:** None

**Success Response (200):**

```json
{
  "success": true,
  "subscription": {
    "id": "sub_xxx",
    "cancelAtPeriodEnd": true,
    "canceledAt": "2025-01-15T12:00:00.000Z",
    "accessUntil": "2025-02-01T00:00:00.000Z"
  }
}
```

**Error - Already Canceled (409):**

```json
{
  "success": false,
  "error": {
    "message": "Subscription is already scheduled for cancellation",
    "code": "ALREADY_CANCELED"
  }
}
```

**Behavior:**

- Subscription remains active until `currentPeriodEnd`
- User retains full access until period ends
- No refund for remaining time
- Can be reactivated before period ends

---

### POST /api/subscriptions/reactivate

Reactivate a canceled subscription before period ends.

**Method:** POST
**Auth:** Required
**Rate Limit:** 5 requests per 10 minutes

**Request:**

```bash
curl -X POST https://your-domain.com/api/subscriptions/reactivate \
  -H "Cookie: sb-access-token=..."
```

**Request Body:** None

**Success Response (200):**

```json
{
  "success": true,
  "subscription": {
    "id": "sub_xxx",
    "status": "active",
    "cancelAtPeriodEnd": false,
    "currentPeriodEnd": "2025-02-01T00:00:00.000Z"
  }
}
```

**Error - Not Canceled (409):**

```json
{
  "success": false,
  "error": {
    "message": "Subscription is not scheduled for cancellation",
    "code": "NOT_CANCELED"
  }
}
```

**Error - Period Ended (403):**

```json
{
  "success": false,
  "error": {
    "message": "Subscription period has already ended. Cannot reactivate.",
    "code": "FORBIDDEN_OPERATION"
  }
}
```

---

### DELETE /api/subscriptions/delete-account

Permanently delete user account and all data.

**Method:** DELETE
**Auth:** Required
**Rate Limit:** 3 requests per 10 minutes (very restrictive)

**Request:**

```bash
curl -X DELETE https://your-domain.com/api/subscriptions/delete-account \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{
    "confirmationToken": "DELETE"
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| confirmationToken | string | Yes | Must be exactly `"DELETE"` |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Account and all data deleted successfully"
}
```

**Error - Invalid Token (400):**

```json
{
  "success": false,
  "error": {
    "message": "Invalid confirmation token. Must be exactly \"DELETE\" to confirm account deletion.",
    "code": "INVALID_CONFIRMATION"
  }
}
```

**What Gets Deleted:**

1. Stripe subscription (canceled immediately)
2. Stripe customer
3. Database records (CASCADE deletes):
   - `payment_history`
   - `subscriptions`
   - `meeting_analysis`
   - `processing_jobs`
   - `oauth_tokens`
   - `users`
4. Supabase Auth user

⚠️ **WARNING:** This operation is permanent and cannot be undone!

---

### POST /api/webhooks/stripe

Stripe webhook handler for subscription lifecycle events.

**Method:** POST
**Auth:** Signature verification (no session required)
**Rate Limit:** None (Stripe manages retries)

**Webhook URL:** `https://your-domain.com/api/webhooks/stripe`

**Handled Events:**

**Subscription Events:**

- `checkout.session.completed` - Creates subscription after successful checkout
- `customer.subscription.created` - Syncs new subscription
- `customer.subscription.updated` - Updates status, dates, plan changes
- `customer.subscription.deleted` - Marks subscription as canceled
- `customer.subscription.trial_will_end` - Logs notification (3 days before trial ends)

**Payment Events:**

- `invoice.payment_succeeded` - Records successful payment, updates status to active
- `invoice.payment_failed` - Records failed payment, updates status to past_due
- `payment_intent.succeeded` - Logs successful payment intent
- `payment_intent.payment_failed` - Logs failed payment intent

**Customer Events:**

- `customer.created` - Logs customer creation
- `customer.updated` - Logs customer updates
- `customer.deleted` - Logs customer deletion

**Security:**

- Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
- Rejects requests with invalid signatures (400)

**Idempotency:**

- Checks existing records before inserting
- Safe to receive duplicate events

**Response:**

```json
{ "received": true }
```

**Status Code:** 200 (always, even on processing errors, to acknowledge receipt)

---

## Webhook Events

Complete list of webhook events handled by `/api/webhooks/stripe`:

| Event                                | Description                    | Database Updates                                    |
| ------------------------------------ | ------------------------------ | --------------------------------------------------- |
| checkout.session.completed           | User completed Stripe Checkout | Creates subscription record                         |
| customer.subscription.created        | Subscription created           | Upserts subscription                                |
| customer.subscription.updated        | Subscription modified          | Updates subscription status/dates                   |
| customer.subscription.deleted        | Subscription canceled          | Sets status to canceled, updates user flags         |
| customer.subscription.trial_will_end | Trial ending in 3 days         | Logs notification (TODO: send email)                |
| invoice.payment_succeeded            | Payment succeeded              | Inserts payment_history, updates status to active   |
| invoice.payment_failed               | Payment failed                 | Inserts payment_history, updates status to past_due |
| payment_intent.succeeded             | Lower-level payment success    | Logs event                                          |
| payment_intent.payment_failed        | Lower-level payment failure    | Logs event                                          |
| customer.created                     | Customer created in Stripe     | Logs event                                          |
| customer.updated                     | Customer details updated       | Logs event                                          |
| customer.deleted                     | Customer deleted               | Logs event                                          |

**Database Tables Updated:**

- `subscriptions` - Main subscription data
- `payment_history` - Immutable payment audit log
- `users` - Subscription flags (`has_active_subscription`, `subscription_status`, `trial_used`)

---

## Testing

### Local Testing with Stripe CLI

1. **Install Stripe CLI:**

   ```bash
   brew install stripe/stripe-cli/stripe
   ```

2. **Login to Stripe:**

   ```bash
   stripe login
   ```

3. **Forward webhooks to localhost:**

   ```bash
   stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
   ```

4. **Copy webhook signing secret:**
   - Stripe CLI will output: `whsec_xxx`
   - Add to `frontend/.env.local`:
     ```bash
     STRIPE_WEBHOOK_SECRET=whsec_xxx
     ```

5. **Trigger test events:**
   ```bash
   stripe trigger checkout.session.completed
   stripe trigger invoice.payment_succeeded
   stripe trigger customer.subscription.updated
   ```

### Test Cards

Use these card numbers in test mode:

| Card Number         | Behavior                |
| ------------------- | ----------------------- |
| 4242 4242 4242 4242 | Success                 |
| 4000 0000 0000 0002 | Declined                |
| 4000 0025 0000 3155 | Requires authentication |

**Expiry:** Any future date
**CVC:** Any 3 digits
**ZIP:** Any 5 digits

### Manual Testing Checklist

- [ ] Create subscription via Checkout Session
- [ ] Create subscription via API
- [ ] View current subscription
- [ ] Change plan (monthly → annual)
- [ ] Change plan (annual → monthly)
- [ ] Cancel subscription
- [ ] Reactivate subscription
- [ ] Test trial eligibility (should only work once per user)
- [ ] Test coupon code application
- [ ] Simulate payment failure (webhook)
- [ ] Delete account

---

## Environment Variables

### Frontend (`frontend/.env.local`)

```bash
# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Vercel (Production)

Add these secrets in Vercel project settings:

- `STRIPE_SECRET_KEY` (sensitive)
- `STRIPE_WEBHOOK_SECRET` (sensitive)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (public)

**Update webhook URL in Stripe Dashboard:**

- Development: `http://localhost:3000/api/webhooks/stripe`
- Production: `https://your-vercel-domain.com/api/webhooks/stripe`

---

## Troubleshooting

### Common Issues

**"Webhook signature verification failed"**

- Check `STRIPE_WEBHOOK_SECRET` is correct
- Ensure raw body is used (not parsed JSON)
- Use Stripe CLI for local testing

**"User already has an active subscription"**

- Check database: `select * from subscriptions where user_id = 'xxx'`
- Cancel existing subscription before creating new one
- Or use change-plan endpoint instead

**"No subscription found"**

- Webhook may not have fired yet (check Stripe Dashboard → Webhooks)
- Check database: `select * from subscriptions where stripe_subscription_id = 'xxx'`
- Manually trigger webhook with Stripe CLI

**"Rate limit exceeded"**

- Wait for rate limit window to expire
- Check `Retry-After` header for seconds remaining
- Implement exponential backoff on frontend

**"Payment requires authentication"**

- Use test card: `4000 0025 0000 3155`
- Frontend must handle 3D Secure with Stripe.js
- Check `clientSecret` in response

### Logs

**Backend logs** (webhook processing):

```bash
# Vercel logs
vercel logs --follow

# Or check Vercel dashboard → Deployments → Logs
```

**Stripe logs** (webhook delivery):

- Stripe Dashboard → Developers → Webhooks → Your webhook → Logs

**Database logs** (subscription records):

```sql
-- View subscriptions
SELECT * FROM subscriptions WHERE user_id = 'xxx';

-- View payment history
SELECT * FROM payment_history WHERE user_id = 'xxx' ORDER BY payment_date DESC;

-- View user flags
SELECT id, email, has_active_subscription, subscription_status, trial_used
FROM users WHERE id = 'xxx';
```

---

## Support

For issues or questions:

- **Backend Issues:** Check Vercel logs and Supabase dashboard
- **Stripe Issues:** Check Stripe Dashboard → Events and Webhooks
- **Database Issues:** Check Supabase → Table Editor and Logs
- **Frontend Issues:** Check browser console and network tab

**Stripe Documentation:**

- [Subscriptions Guide](https://stripe.com/docs/billing/subscriptions/overview)
- [Webhooks Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Testing Guide](https://stripe.com/docs/testing)
