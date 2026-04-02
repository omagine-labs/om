# Stripe Integration

Complete guide to Stripe subscription billing integration.

See `frontend/app/api/subscriptions/README.md` for complete API documentation.

---

## Overview

Meeting Intelligence uses Stripe for subscription billing.

**Features**:

- Two plan types: monthly and annual billing
- 14-day free trial (one-time per user)
- Plan changes with proration
- Cancellation at period end
- Account deletion
- Coupon code support

**Configuration**: Product IDs, Price IDs, and coupon codes are configured in Stripe Dashboard and referenced via environment variables in the codebase.

---

## Configuration

### API Keys

**Environment Variables** (`frontend/.env.local`):

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Get keys from: [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys)

---

## Local Development

### Starting Stripe CLI

Stripe CLI runs automatically in Docker when you start services:

```bash
npm start  # Stripe webhook forwarder starts automatically
```

### Get Webhook Secret (First Time)

After starting services, get the webhook signing secret from Docker logs:

```bash
docker logs stripe-webhook-forwarder 2>&1 | grep 'whsec_'
```

Add to `frontend/.env.local`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Then restart the frontend to load the new secret.

### Verify Setup

1. Open http://localhost:3000
2. Create test subscription using test card: `4242 4242 4242 4242`
3. Check webhook events: `docker logs -f stripe-webhook-forwarder`
4. Verify `subscriptions` table in Supabase Studio (http://localhost:54323)

### Test Cards

| Card Number         | Behavior           |
| ------------------- | ------------------ |
| 4242 4242 4242 4242 | Success            |
| 4000 0000 0000 0002 | Declined           |
| 4000 0025 0000 3155 | Requires 3D Secure |

**Expiry**: Any future date  
**CVC**: Any 3 digits  
**ZIP**: Any 5 digits

---

## Subscription Flow

### Creating Subscriptions

**Option 1: Checkout Session** (Recommended):

```typescript
POST /api/subscriptions/checkout-session
{
  "planType": "monthly",
  "successUrl": "https://your-app.com/success",
  "cancelUrl": "https://your-app.com/cancel",
  "couponCode": "YOUR_COUPON_ID"  // Optional
}
```

Returns Stripe Checkout URL to redirect user to.

**Option 2: Direct API**:

```typescript
POST /api/subscriptions/create
{
  "planType": "annual",
  "applyTrial": true,
  "couponCode": "YOUR_COUPON_ID"  // Optional
}
```

Returns subscription object with optional `clientSecret` for payment confirmation.

### Managing Subscriptions

**Get Current Subscription**:

```typescript
GET / api / subscriptions / current;
```

**Change Plan**:

```typescript
PATCH /api/subscriptions/change-plan
{
  "newPlanType": "annual"
}
```

Stripe automatically prorates the change.

**Cancel Subscription**:

```typescript
POST / api / subscriptions / cancel;
```

Cancels at end of current billing period (user retains access until then).

**Reactivate Subscription**:

```typescript
POST / api / subscriptions / reactivate;
```

Only works if subscription is scheduled for cancellation but period hasn't ended.

---

## Webhook Events

Webhook endpoint: `POST /api/webhooks/stripe`

**Subscription Events**:

- `checkout.session.completed` - Creates subscription after checkout
- `customer.subscription.created` - Syncs new subscription
- `customer.subscription.updated` - Updates status, dates, plan changes
- `customer.subscription.deleted` - Marks subscription as canceled
- `customer.subscription.trial_will_end` - **Sends trial ending email** (3 days before trial ends)

**Payment Events**:

- `invoice.payment_succeeded` - Records successful payment
- `invoice.payment_failed` - Records failed payment, updates status to past_due

**Security**: All webhook requests are verified using `stripe.webhooks.constructEvent()` with the webhook signing secret.

**Idempotency**: Webhook handler checks for existing records before inserting to prevent duplicate processing.

**Nullable Fields**: Handler gracefully processes subscriptions with undefined/null period fields (setup intents, trials, incomplete subscriptions).

---

## Intercom Integration

Stripe webhooks update Intercom user attributes in real-time to keep subscription and trial state accurate for email targeting.

**Implementation**: `frontend/app/api/webhooks/stripe/route.ts`

**Webhooks that update Intercom**:

- `customer.subscription.created` → Set initial subscription/trial state
- `customer.subscription.updated` → Update state on changes (trial → paid, plan upgrade, etc.)
- `customer.subscription.deleted` → Clear subscription state
- `customer.subscription.trial_will_end` → Set trial ending flags (3 days before)

**Why real-time updates?**

- Prevents incorrect emails (e.g., "trial ending" sent to paying customers)
- Ensures email targeting uses current subscription state
- No need to wait for user login to refresh attributes

**Email Configuration**: See `docs/intercom.md` for complete integration details and all attributes synced.

---

## Database Schema

### subscriptions Table

Stores Stripe subscription data synced via webhooks.

**Key Columns**:

- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Stripe subscription ID
- `plan_type` - `monthly` or `annual`
- `status` - `trialing`, `active`, `canceled`, `past_due`, etc.
- `trial_start`, `trial_end` - Trial period timestamps
- `current_period_start`, `current_period_end` - Billing period
- `cancel_at_period_end` - Whether subscription will cancel

### payment_history Table

Immutable audit log of all payment attempts.

**Key Columns**:

- `stripe_invoice_id` - Stripe invoice ID
- `amount` - Amount in cents
- `status` - `succeeded`, `failed`, `pending`
- `payment_date` - Timestamp of payment

---

## Rate Limiting

All subscription endpoints have rate limiting to prevent abuse:

| Endpoint               | Limit       | Window     |
| ---------------------- | ----------- | ---------- |
| GET /current           | 30 requests | 5 minutes  |
| POST /checkout-session | 10 requests | 5 minutes  |
| POST /create           | 5 requests  | 10 minutes |
| PATCH /change-plan     | 5 requests  | 10 minutes |
| POST /cancel           | 5 requests  | 10 minutes |
| POST /reactivate       | 5 requests  | 10 minutes |

**Rate Limit Response** (429):

```json
{
  "error": "Too many requests. Please try again later.",
  "retryAfter": 120
}
```

Headers include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After`.

---

## Troubleshooting

### Webhook signature verification failed

**Cause**: Incorrect `STRIPE_WEBHOOK_SECRET` or raw body not used

**Solution**:

1. Check `STRIPE_WEBHOOK_SECRET` matches Docker logs
2. Ensure raw body is used (not parsed JSON)
3. Use Stripe CLI for local testing

### User already has an active subscription

**Cause**: Attempting to create duplicate subscription

**Solution**:

- Cancel existing subscription first
- Or use change-plan endpoint instead

### Payment requires authentication

**Cause**: Card requires 3D Secure verification

**Solution**:

- Use test card: `4000 0025 0000 3155`
- Frontend must handle 3D Secure with Stripe.js
- Check `clientSecret` in response

---

## Resources

- [Stripe Dashboard (Test Mode)](https://dashboard.stripe.com/test/dashboard)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Subscription API Docs](../frontend/app/api/subscriptions/README.md)
