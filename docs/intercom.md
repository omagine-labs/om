# Intercom Integration

Technical documentation for Intercom integration. For configuring tours and email sequences, see [Intercom's documentation](https://www.intercom.com/help).

---

## Overview

Intercom handles:

- User identification and authentication (JWT-based)
- Product tours and in-app messaging
- Email sequences and campaigns
- Customer support chat

---

## Environment Variables

**Frontend**:

```bash
NEXT_PUBLIC_INTERCOM_APP_ID=xxx
```

**Backend** (server-side):

```bash
INTERCOM_API_TOKEN=xxx                      # For webhook → Intercom API calls
INTERCOM_IDENTITY_VERIFICATION_SECRET=xxx   # For JWT identity verification
```

Get these from: [Intercom Dashboard → Settings → Installation](https://app.intercom.com/a/apps/_/settings/web)

---

## User Identification (JWT)

Users are identified securely via JWT when they log in.

**IMPORTANT**: Intercom is **only initialized for authenticated users** (not anonymous visitors). This prevents creating duplicate contacts in Intercom - one anonymous and one identified. This is the recommended approach when using Intercom's identity verification feature.

**Implementation**:

- JWT generation: `frontend/app/api/intercom/jwt/route.ts`
- User identification: `frontend/hooks/useIntercomIdentify.ts`

**User Attributes Sent**:

```typescript
{
  // Core identity
  user_id: string,
  email: string,
  name: string,

  // Onboarding progress
  meetings_count: number,
  first_meeting_analyzed_at: string | null,  // ISO 8601 timestamp

  // Subscription status
  plan: "free" | "pro",
  is_trialing: boolean,
  trial_end_date: string,        // ISO 8601 date
  trial_days_remaining: number
}
```

**When attributes are synced**:

- **On user login** (via JWT): All attributes refreshed from database
- **Real-time** (via Stripe webhooks): Subscription and trial attributes updated instantly when:
  - Subscription created → Set initial trial state
  - Subscription updated → Update trial/plan state (e.g., trial → paid conversion)
  - Subscription deleted → Clear subscription state
  - Trial ending soon → Set trial ending flags

---

## Stripe Webhook Integration

Intercom attributes are updated in real-time via Stripe webhooks to ensure email targeting is accurate.

**Implementation**: `frontend/app/api/webhooks/stripe/route.ts`

### Subscription Lifecycle Events

**`customer.subscription.created`** and **`customer.subscription.updated`**:

```typescript
{
  plan: "free" | "pro",
  is_trialing: boolean,
  trial_end_date: string | null,
  trial_days_remaining: number | null,
  trial_ending_soon: false  // Cleared if user converts early
}
```

**`customer.subscription.deleted`**:

```typescript
{
  plan: "free",
  is_trialing: false,
  trial_end_date: null,
  trial_days_remaining: null,
  trial_ending_soon: false
}
```

### Trial Ending Reminder

**`customer.subscription.trial_will_end`** (fires 3 days before trial ends):

```typescript
{
  trial_ending_soon: true,
  trial_end_date: string,
  trial_days_remaining: number,
  plan_price: string,      // e.g., "$19.00"
  plan_currency: string    // e.g., "USD"
}
```

**Email Configuration**: Create an email series in Intercom triggered when `trial_ending_soon = true` AND `is_trialing = true`.

**Note**: If a user converts from trial to paid early, the `updated` webhook automatically clears `trial_ending_soon = false` to prevent incorrect emails.

---

## API Client

Server-side Intercom API client for updating user attributes from webhooks.

**Implementation**: `frontend/lib/intercom-api.ts`

**Functions**:

- `updateIntercomUser(userId, attributes)` - Update user custom attributes
- `trackIntercomEvent(userId, eventName, metadata)` - Track custom events

**Usage Example**:

```typescript
import { updateIntercomUser } from '@/lib/intercom-api';

await updateIntercomUser(userId, {
  meetings_count: 5,
});
```

---

## Configuring Onboarding

All onboarding configuration (tours, emails, targeting) is done in the Intercom UI.

**Resources**:

- [Product Tours](https://www.intercom.com/help/en/articles/867-product-tours-getting-started)
- [Email Series](https://www.intercom.com/help/en/articles/170-series-getting-started)
- [Custom Attributes](https://www.intercom.com/help/en/articles/179-send-custom-user-attributes-to-intercom)

**Custom Attributes**: Use the attributes listed above to target tours and emails based on user behavior.

---

## Testing

**Local Development**:

1. Verify `NEXT_PUBLIC_INTERCOM_APP_ID` is set in `.env.local`
2. Log in as a user
3. Open browser console and verify Intercom loaded
4. Check Intercom dashboard → Contacts to see user and attributes

**Webhook Testing**:

1. Use Stripe CLI to trigger `customer.subscription.trial_will_end`
2. Check application logs for Intercom API call
3. Verify user attributes updated in Intercom dashboard

---

## Architecture

```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ On login
       ↓
┌─────────────────────┐
│ /api/intercom/jwt   │ ← Generates JWT with user attributes
│  (Next.js API)      │
└──────┬──────────────┘
       │ JWT token
       ↓
┌─────────────┐
│  Intercom   │ ← Identifies user, applies targeting rules
│   Messenger │
└─────────────┘


┌─────────────┐
│   Stripe    │
│  (Webhook)  │
└──────┬──────┘
       │ trial_will_end
       ↓
┌─────────────────────────┐
│ /api/webhooks/stripe    │
│  (Next.js API)          │
└──────┬──────────────────┘
       │ Update attributes
       ↓
┌─────────────────────────┐
│ Intercom REST API       │ ← Updates user attributes
│  (updateIntercomUser)   │
└─────────────────────────┘
       │
       ↓
┌─────────────┐
│  Intercom   │ ← Triggers email series based on attributes
│   Series    │
└─────────────┘
```

---

## Troubleshooting

**Intercom not loading** (Frontend):

- Check `NEXT_PUBLIC_INTERCOM_APP_ID` is set
- Verify environment variable is prefixed with `NEXT_PUBLIC_`
- Check browser console for errors

**User not identified** (Frontend):

- Verify JWT route is generating token successfully
- Check `INTERCOM_IDENTITY_VERIFICATION_SECRET` is correct
- Look for JWT errors in browser console

**Attributes not updating** (Frontend):

- Check `INTERCOM_API_TOKEN` is configured in frontend
- Review webhook logs for API errors
- Verify Intercom API rate limits not exceeded
- Check user exists in Intercom (must be identified first)

**Emails not sending**:

- Verify email series is active in Intercom
- Check targeting conditions match user attributes
- Ensure user hasn't unsubscribed
- Review Intercom message logs for delivery status
