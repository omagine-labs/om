# Analytics

Dual-logging analytics system using PostHog and Supabase for comprehensive user behavior tracking.

---

## Overview

The application uses a **dual-logging architecture** that tracks events to both:

1. **PostHog** - Product analytics platform for funnels, session replay, and behavioral insights
2. **Supabase `user_event_log` table** - SQL-queryable event stream for custom reporting and analysis

This approach provides the best of both worlds:

- PostHog's powerful analytics UI and session replay
- Supabase's SQL flexibility for custom queries and reports

Events follow the **AARRR (Pirate Metrics) framework**: Acquisition, Activation, Retention, Revenue, Referral.

---

## Configuration

### Environment Variables

Add to `frontend/.env.local`:

```bash
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_api_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

**Getting Your API Key**:

1. Sign up or log in to [PostHog](https://posthog.com/)
2. Go to Project Settings
3. Copy your Project API Key

### PostHog Settings

**Configuration** (`frontend/lib/posthog.ts`):

- Person Profiles: `identified_only` (only creates profiles for logged-in users)
- Page View Tracking: Automatic
- Page Leave Tracking: Enabled
- Debug Mode: Enabled in development, disabled in production

---

## Architecture

### Core Files

1. **frontend/lib/analytics.ts** - Unified tracking helper (dual-logging)
2. **frontend/types/analytics.ts** - Event taxonomy and TypeScript types
3. **frontend/lib/posthog.ts** - PostHog analytics singleton class
4. **frontend/components/PostHogProvider.tsx** - React provider component
5. **frontend/app/layout.tsx** - Root layout with PostHogProvider

### Dual-Logging Flow

```
User Action
    ↓
trackEvent(eventName, properties)
    ↓
    ├─→ PostHog.capture() ────→ PostHog Cloud
    │   (Always succeeds)
    │
    └─→ Supabase Insert ───────→ user_event_log table
        (If authenticated)
```

### Analytics API

The unified `trackEvent()` function (`frontend/lib/analytics.ts`) provides:

- **trackEvent(eventName, properties)** - Track events to both PostHog and Supabase
- **identifyUser(userId, properties)** - Identify users and set their properties
- **resetAnalytics()** - Reset on logout (clears user identity)
- **setUserProperties(properties)** - Update user properties

**Key Features**:

- Type-safe event tracking with TypeScript
- Automatic dual-logging to PostHog + Supabase
- Graceful error handling (analytics failures don't break app)
- Development-mode validation (warns about unknown events)
- Works for anonymous and authenticated users

---

## Tracked Events

**See [Event Taxonomy](./event-taxonomy.md) for the complete reference of all events.**

Events are organized using the AARRR framework:

### Quick Reference

| Category        | Events                                                       | Purpose                                     |
| --------------- | ------------------------------------------------------------ | ------------------------------------------- |
| **Acquisition** | `signup_completed`, `signup_source`, `oauth_login_attempt`   | User acquisition and signup                 |
| **Activation**  | `first_meeting_recorded`, `user_logged_in`                   | Users experiencing core value               |
| **Engagement**  | `dashboard_viewed`, `analysis_viewed`, `meeting_analyzed`    | Ongoing product usage and retention signals |
| **Revenue**     | `subscription_created`, `payment_succeeded`, `plan_selected` | Monetization events                         |
| **Tech Health** | `upload_failed`                                              | Debugging and operational monitoring        |

### Currently Implemented Events

See [Event Taxonomy](./event-taxonomy.md) for the complete list of all events, including:

- Event properties and types
- When to track each event
- Implementation locations and code references
- Usage examples and best practices

The taxonomy is organized by AARRR framework and is the single source of truth for all analytics events.

---

## User Identification

Users are identified on signup and login with the following properties:

```typescript
{
  userId: string;        // Supabase Auth user ID
  email?: string;        // User email
  full_name?: string;    // User's full name
  created_at?: string;   // Account creation timestamp
}
```

User identification is reset on logout.

**Implementation**: `frontend/lib/auth.ts`

---

## Usage

### Tracking Events

Use the `trackEvent()` helper for type-safe event tracking:

```typescript
import { trackEvent, EngagementEvents } from '@/lib/analytics';

// Track an event (logs to both PostHog and Supabase)
trackEvent(EngagementEvents.DASHBOARD_VIEWED, {
  meeting_count: 12,
});
```

**Benefits**:

- TypeScript autocomplete for event names and properties
- Automatic dual-logging to PostHog + Supabase
- Development-mode validation

### Identifying Users

```typescript
import { identifyUser } from '@/lib/analytics';

// Identify a user (automatically done on login)
identifyUser(userId, {
  email: 'user@example.com',
  full_name: 'Jane Doe',
  created_at: user.created_at,
});
```

### Resetting on Logout

```typescript
import { resetAnalytics } from '@/lib/analytics';

// Reset analytics (automatically done on logout)
resetAnalytics();
```

### Querying Events from Supabase

Since events are also logged to Supabase, you can run SQL queries:

```sql
-- Get all upload events for the current user
SELECT event_name, payload, created_at
FROM user_event_log
WHERE user_id = auth.uid()
  AND event_name LIKE 'upload_%'
ORDER BY created_at DESC;

-- Calculate upload success rate
SELECT
  COUNT(*) FILTER (WHERE event_name = 'upload_completed') as successful,
  COUNT(*) FILTER (WHERE event_name = 'upload_failed') as failed
FROM user_event_log
WHERE user_id = auth.uid();
```

---

## Privacy & Compliance

### Person Profiles

PostHog is configured with `person_profiles: 'identified_only'`, which means:

- Anonymous visitors are tracked as events only
- User profiles are only created after `identify()` is called
- This reduces costs and respects user privacy

### Do Not Track (DNT)

PostHog respects browser DNT settings by default.

### Data Collection

**Automatically collected**:

- Page views (URLs)
- Page leave events
- Session duration

**Manually tracked**:

- User authentication events
- Upload lifecycle events
- Feature usage events
- Recording deletions

---

## Adding New Events

### Step-by-Step Guide

#### 1. Define the Event in the Taxonomy

**File**: `frontend/types/analytics.ts`

Add your event to the appropriate AARRR category enum:

```typescript
export enum RetentionEvents {
  // ... existing events
  MEETING_EXPORTED = 'meeting_exported', // ← Add your event
}
```

#### 2. Create the Properties Interface

Define the required and optional properties:

```typescript
export interface MeetingExportedProperties {
  /** Meeting identifier */
  meeting_id: string;
  /** Export format */
  format: 'pdf' | 'docx' | 'txt';
  /** Whether summary was included */
  include_summary: boolean;
  /** Optional: file size if known */
  file_size_bytes?: number;
}
```

#### 3. Add to the AnalyticsEvent Union Type

```typescript
export type AnalyticsEvent =
  // ... existing events
  {
    name: RetentionEvents.MEETING_EXPORTED;
    properties: MeetingExportedProperties;
  };
```

#### 4. Track the Event

```typescript
import { trackEvent, RetentionEvents } from '@/lib/analytics';

async function handleExport(meetingId: string, format: 'pdf' | 'docx' | 'txt') {
  // ... export logic

  trackEvent(RetentionEvents.MEETING_EXPORTED, {
    meeting_id: meetingId,
    format,
    include_summary: true,
  });
}
```

#### 5. Document the Event

Add your event to `docs/event-taxonomy.md` with:

- When to track
- Required/optional properties
- Usage examples
- Implementation location

### Common Patterns

**Client-Side (Fire-and-Forget)**:

```typescript
function handleClick() {
  // Don't await - let it track in background
  trackEvent(RetentionEvents.BUTTON_CLICKED, { button_id: 'export' });
  performAction();
}
```

**Server-Side (Await)**:

```typescript
export async function POST(request: Request) {
  const result = await processData();

  // Await to ensure event is logged
  await trackEvent(RetentionEvents.DATA_PROCESSED, {
    record_count: result.count,
  });

  return NextResponse.json({ success: true });
}
```

**Error Tracking**:

```typescript
try {
  await uploadFile(file);
  trackEvent(RetentionEvents.UPLOAD_COMPLETED, {
    /* ... */
  });
} catch (error) {
  trackEvent(RetentionEvents.UPLOAD_FAILED, {
    error: error.message,
  });
  throw error;
}
```

### Best Practices

**✅ DO**:

- Use descriptive event names (`meeting_exported` not `export`)
- Include context in properties
- Follow `snake_case` naming
- Document immediately when adding events
- Use TypeScript types
- Track both success and failure cases

**❌ DON'T**:

- Track PII (passwords, API keys, sensitive data)
- Use magic strings (import enums instead)
- Block UI with `await` in event handlers
- Over-track (focus on meaningful actions)
- Skip type definitions

### Implementation Checklist

- [ ] Event added to enum in `frontend/types/analytics.ts`
- [ ] Properties interface defined with JSDoc
- [ ] Event added to `AnalyticsEvent` union type
- [ ] `trackEvent()` called in appropriate location
- [ ] Event documented in `docs/event-taxonomy.md`
- [ ] Tested in development (console logs visible)
- [ ] Verified in PostHog Live Events
- [ ] Verified in Supabase `user_event_log` table

---

## Testing

### Local Development

1. Set `NEXT_PUBLIC_POSTHOG_KEY` in `.env.local`
2. Start dev server: `npm run dev`
3. Open browser console to see debug logs
4. Perform actions that trigger events
5. Check PostHog dashboard: Activity → Live Events

### Verifying Events

**Browser Console**: Debug logs (development mode)

```
[PostHog] Initialized successfully
[PostHog] User identified: user-id-123
[PostHog] Event captured: user_logged_in { method: 'email' }
```

**PostHog Dashboard**:

- Go to Activity → Live Events
- Filter by event name or user
- View event properties

---

## Troubleshooting

### Events Not Appearing in PostHog

**Check**:

1. Console shows `[PostHog]` logs in development
2. `NEXT_PUBLIC_POSTHOG_KEY` is set in `.env.local`
3. PostHog initialized: "PostHog initialized successfully" in console
4. Looking at correct environment in PostHog dashboard
5. Ad blocker not blocking PostHog requests

### Events Not Appearing in Supabase

**Check**:

1. Console shows `[Analytics]` logs or errors
2. User is authenticated (`supabase.auth.getUser()` returns user)
3. RLS policies on `user_event_log` allow inserts
4. Query directly: `SELECT * FROM user_event_log ORDER BY created_at DESC LIMIT 10`

### TypeScript Errors

If you see "Type 'X' is not assignable to type 'AnalyticsEvent'":

1. Verify event added to appropriate enum
2. Verify properties interface defined
3. Verify event added to `AnalyticsEvent` union type
4. Restart TypeScript server: `Cmd+Shift+P` → "Restart TypeScript Server"

### Unknown Event Warnings

Development mode warns about events not in taxonomy:

```
[Analytics] Unknown event: "usr_signed_up". This event is not in the AARRR taxonomy.
Please add it to frontend/types/analytics.ts or check for typos.
```

**Fix**: Use correct enum value or add event to taxonomy

---

## Best Practices

1. **Use descriptive event names** - Use snake_case: `user_signed_up`, not `User Signup`
2. **Include context** - Add properties that help understand user behavior
3. **Respect privacy** - Only track necessary events and data
4. **Test in development** - Verify events before deploying
5. **Document new events** - Update this file when adding tracking
6. **Use identified_only mode** - Reduces costs and respects privacy

---

## Database Schema

Events are stored in the `user_event_log` table in Supabase:

```sql
CREATE TABLE user_event_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_user_event_log_user_id ON user_event_log(user_id);
CREATE INDEX idx_user_event_log_event_name ON user_event_log(event_name);
CREATE INDEX idx_user_event_log_created_at ON user_event_log(created_at);
CREATE INDEX idx_user_event_log_user_created ON user_event_log(user_id, created_at);
```

**RLS Policies**:

- Users can insert their own events
- Users can read their own events

See [Database Documentation](./database.md) for complete schema details.

---

## Resources

### Documentation

- **[Event Taxonomy](./event-taxonomy.md)** - Complete event reference (AARRR framework)
- **[Database Documentation](./database.md)** - Database schema and migrations

### External Resources

- **PostHog Dashboard**: https://app.posthog.com/
- **PostHog JS Docs**: https://posthog.com/docs/libraries/js
- **PostHog React Guide**: https://posthog.com/docs/libraries/react
- **Anonymous to Identified Users**: https://posthog.com/docs/product-analytics/identify

---
