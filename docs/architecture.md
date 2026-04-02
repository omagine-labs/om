# Architecture

System architecture and component interaction for Meeting Intelligence Assistant.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Processing Pipeline](#processing-pipeline)
- [Communication Metrics](#communication-metrics)
- [Desktop Authentication](#desktop-authentication)
- [Anonymous Upload & Claim Flow](#anonymous-upload--claim-flow)
- [Security Architecture](#security-architecture)

---

## Overview

Meeting Intelligence Assistant is a multi-tenant SaaS platform that processes video/audio recordings to generate AI-powered communication insights and behavioral analysis.

**Core Value Proposition**: Upload a meeting recording → automatically generate transcript, summary, communication metrics, and behavioral insights.

### Key Design Principles

1. **Frontend-Supabase-Python** - Clear separation of concerns
2. **Serverless & Scalable** - Cloud Run scales to zero, Supabase handles multi-tenancy
3. **Security First** - RLS policies, no service role keys in frontend
4. **Provider Pattern** - Swappable AI and transcription providers

---

## Technology Stack

| Layer                | Technology                           | Purpose                                 |
| -------------------- | ------------------------------------ | --------------------------------------- |
| **Frontend**         | Next.js 15.5 (App Router) + React 19 | UI and user interactions                |
| **Styling**          | Tailwind CSS                         | Utility-first CSS framework             |
| **Database**         | Supabase (PostgreSQL)                | Auth, database, storage, Edge Functions |
| **Backend**          | FastAPI (Python 3.11+)               | CPU/GPU-intensive processing            |
| **Deployment**       | Google Cloud Run                     | Serverless Python containers            |
| **AI Models**        | Google Gemini / OpenAI / Anthropic   | Analysis and summarization              |
| **Transcription**    | AssemblyAI                           | Speech-to-text with diarization         |
| **Payments**         | Stripe                               | Subscription billing                    |
| **Analytics**        | PostHog                              | Product analytics                       |
| **Customer Support** | Intercom                             | Messaging, tours, support chat          |

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  - File uploads to Supabase Storage                         │
│  - UI interactions and display                              │
│  - Communicates directly with Supabase                      │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                   Supabase Layer                             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │  PostgreSQL  │ │   Storage    │ │  Edge Functions    │  │
│  │  (with RLS)  │ │   (Files)    │ │  (Middleware)      │  │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
│                            │                                 │
│                            │ Database Trigger                │
│                            ▼                                 │
│                  process-meeting (Edge Function)             │
│                  - Generates signed URL                      │
│                  - Calls Python backend                      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Python Backend (FastAPI on Cloud Run)           │
│  - Downloads file via signed URL                            │
│  - Transcription with AssemblyAI                            │
│  - Speaker diarization                                       │
│  - AI analysis with Gemini/OpenAI                           │
│  - Calculate communication metrics                           │
│  - Save results to database                                  │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Layers

**1. Frontend (Next.js)** - UI and user interactions

- Location: `frontend/`
- Handles: File uploads to Supabase Storage, UI interactions
- Communicates directly with Supabase (Storage and Database)

**2. Supabase Edge Functions** - Middleware layer

- Location: `supabase/functions/`
- Handles: Orchestrating processing workflows, generating signed URLs
- Automatically triggered by database triggers (using pg_net extension)
- Secured with Supabase anon key

**3. Python Backend (FastAPI)** - CPU/GPU-intensive processing

- Location: `python-backend/`
- Deployed to: Google Cloud Run (serverless containers)
- Handles: Audio transcription with AssemblyAI API, speaker diarization, AI analysis
- Secured with API key authentication (only Edge Functions can call it)
- Exposes REST API at Cloud Run URL

**Key Principle**: Frontend never communicates directly with Python backend. All orchestration happens through Edge Functions.

---

## Data Flow

### 1. Upload Flow

```
User → Frontend → Supabase Storage
         │
         ▼
    Create processing_job
    status: 'uploading' → 'pending'
         │
         ▼
    Database trigger fires
```

**Steps**:

1. Frontend uploads file directly to Supabase Storage
2. Creates `processing_job` with `status: 'uploading'`
3. File saved to Supabase Storage at `recordings/{user_id}/{year}/{month}/{job_id}.mp4`
4. Status updated to `pending`
5. Database trigger automatically fires

### 1b. Anonymous Upload Flow (Marketing Website)

```
Marketing Website → Edge Function: create-anonymous-meeting
         │
         ▼
    Validate & normalize email (server-side)
         │
         ▼
    Check beta user status
         │
         ▼
    Check monthly cap (500/month) & rate limit (1 per email)
         │
         ▼
    Create meeting record (owned by guest user)
         │
         ▼
    Create anonymous_uploads tracking record
         │
         ▼
    Create high-priority processing_job
         │
         ▼
    Database trigger fires → Fast-track processing
```

**Steps**:

1. Marketing website uploads file to `anonymous-recordings` storage bucket
2. Calls `create-anonymous-meeting` Edge Function with:
   - `email`: User's email address
   - `storagePath`: Path to uploaded file
   - `filename`: Original filename
   - `fileSizeMB`: File size for tracking
   - `ipAddress`: Optional, for abuse prevention
   - `userAgent`: Optional, for analytics
3. Edge Function performs server-side validation and security checks:
   - Validates email format using `isValidEmail()`
   - Normalizes email server-side to prevent bypass: `normalizeEmail(email)`
     - Converts to lowercase
     - Removes +suffix (e.g., `user+test@gmail.com` → `user@gmail.com`)
     - Removes dots for Gmail (e.g., `user.name@gmail.com` → `username@gmail.com`)
   - Checks if user is in `beta_users` whitelist (unlimited uploads for testing/VIPs)
   - Enforces monthly cap: 500 uploads/month across all anonymous users
   - Enforces rate limit: 1 upload per normalized email (lifetime)
4. Creates `meetings` record owned by system guest user (`00000000-0000-0000-0000-000000000001`)
5. Creates `anonymous_uploads` record linking email to meeting ID
6. Creates `processing_jobs` with `processing_priority: 'high'` for 5-10 minute turnaround
7. Database trigger invokes `process-meeting` Edge Function
8. User receives email with analysis results (Phase 4, to be implemented)
9. When user signs up, meetings are automatically claimed via normalized email matching

**Key Features**:

- **Server-side security**: Email normalization happens server-side to prevent client manipulation
- **Beta user bypass**: Whitelist for testing without rate limits
- **Guest user pattern**: Single system user (`00000000-0000-0000-0000-000000000001`) owns all anonymous meetings
- **Automatic account linking**: On signup, matches `normalized_email` from `anonymous_uploads` to new user
- **Fast-track processing**: High-priority jobs processed ahead of regular uploads
- **CORS security**: Restricted to `omaginelabs.com` and `localhost` for development
- **Comprehensive tracking**: IP address, user agent, rate limit key for abuse prevention

**Rate Limiting Strategy**:

1. **Email normalization**: Prevents users from creating multiple accounts via `user+1@gmail.com`, `user+2@gmail.com`, etc.
2. **Monthly cap**: 500 uploads/month across all users (beta users exempt)
3. **Per-email limit**: 1 upload per normalized email ever (beta users exempt)
4. **Rate limit key**: SHA-256 hash of `email + IP` for additional tracking

**Storage**:

- Bucket: `anonymous-recordings`
- File size limit: 500MB
- RLS policies: Anonymous users can upload, service role can read/delete

### 2. Automatic Processing Trigger

```
Database trigger (on_meeting_recording_added)
         │
         ▼
    Creates processing_job record
         │
         ▼
    Edge Function: process-meeting
```

**Steps**:

1. Database trigger detects new meeting with recording (`audio_storage_path` set)
2. Creates `processing_jobs` record with `status: 'pending'`
3. Edge Function receives job ID and fetches job details

### 3. Processing Flow

```
Edge Function
    │
    ├─ Generates signed URL (2-hour expiry)
    │
    ├─ Updates job status: 'processing'
    │
    └─ Calls Python backend
         │
         ▼
    Python Backend (Background Task)
         │
         ├─ Downloads file from signed URL
         │
         ├─ Transcribes audio (AssemblyAI)
         │
         ├─ Performs speaker diarization
         │
         ├─ Generates AI analysis (Gemini)
         │
         ├─ Calculates speaker statistics
         │
         ├─ Calculates response latency
         │
         ├─ Detects interruptions
         │
         ├─ Saves results to meeting_analysis
         │
         └─ Updates job status: 'completed' or 'failed'
```

### 4. Analysis Components

**Summary** - AI-generated overview of discussion

**Transcript** - Full text with speaker labels and timestamps

**Speaker Statistics**:

- Talk time (seconds and percentage)
- Word count
- Number of segments

**Communication Metrics** (13 total):

- Clarity
- Empathy
- Confidence
- Collaboration
- Leadership
- Listening
- Engagement
- Assertiveness
- Adaptability
- Influence
- Authenticity
- Emotional Intelligence
- Decision-Making
- Overall Score

**Company Values Alignment**:

- Configurable values (default: Collaboration, Innovation, Customer Focus)
- Per-value scores (0-1)
- Specific examples from transcript

**Behavioral Insights** (optional):

- Face detection
- Prosody analysis
- Gesture analysis

---

## Processing Pipeline

### Backend Processing (Python)

**Entry Point**: `python-backend/app/main.py`

**API Routes**:

- `GET /api/health` - Health check (no authentication required)
- `POST /api/process` - Main processing endpoint (called by Edge Functions)
- `GET /api/process/status/{job_id}` - Get job status

**Background Task Flow**:

```python
async def process_meeting_background(job_id, signed_url, user_id):
    try:
        # 1. Update status
        await update_job_status(job_id, "processing")

        # 2. Download file
        local_path = await download_file(signed_url, job_id)

        # 3. Transcribe with AssemblyAI
        transcript = await transcribe_audio(local_path)

        # 4. Generate AI analysis with Gemini
        analysis = await generate_analysis(transcript)

        # 5. Calculate speaker statistics
        speaker_stats = calculate_speaker_stats(transcript)

        # 6. Calculate response latency
        response_latency = calculate_response_latency(transcript)

        # 7. Detect interruptions
        interruptions = detect_interruptions(transcript)

        # 8. Save results to database
        await save_analysis(job_id, user_id, transcript, analysis,
                           speaker_stats, response_latency, interruptions)

        # 9. Update status
        await update_job_status(job_id, "completed")

    except Exception as e:
        logger.error(f"Processing failed: {e}")
        await update_job_status(job_id, "failed", error=str(e))

    finally:
        cleanup_temp_files(job_id)
```

### Transcription Provider Architecture

The backend uses a provider pattern for transcription:

- **AssemblyAIProvider** - Production API (transcription + diarization in one call)
- **MockProvider** - Local development without API key

Provider selection via `TRANSCRIPTION_PROVIDER` env var (`assemblyai` or `mock`). Falls back to mock if AssemblyAI API key not provided.

### AI Provider Architecture

Multi-provider adapter supporting:

- **Google Gemini** - Recommended (best performance-to-cost ratio)
- **OpenAI GPT-4** - Alternative option
- **Anthropic Claude** - Alternative option

Provider selection via `AI_PROVIDER` env var.

---

## Communication Metrics

### Audio-Only Metrics (Implemented)

**1. Talk Time Percentage**

- Data Source: Transcript with speaker diarization + timestamps
- Calculation: `(your_talk_time / total_meeting_time) * 100`
- Output: Percentage per speaker, breakdown

**2. Response Delay**

- Data Source: Transcript with precise timestamps
- Calculation: Gap between speaker turns
- Detects: Interruptions (negative gaps), appropriate pauses

**3. Words Per Minute (WPM)**

- Data Source: Transcript with word count + speaking duration
- Calculation: `(total_words / total_seconds) * 60`
- Output: Speaking rate per speaker (rounded to 1 decimal)
- Dashboard Label: "Pace" (displayed in Poise section)
- Typical Ranges:
  - 80-100 WPM: Slow/deliberate speech
  - 120-150 WPM: Normal conversation
  - 160-180 WPM: Fast/animated speech
  - 200+ WPM: Rapid/anxious speech
- Edge Cases: Zero duration returns 0.0 WPM

**4. Company Values Alignment**

- Data Source: Transcript + AI analysis
- Implementation: GPT-4 analyzes transcript for value demonstrations
- Output: Per-value scores (0-1) with specific examples

---

## Desktop Authentication

The application supports both web and desktop authentication flows with independent session management to prevent conflicts between web and desktop users.

### Architecture Overview

Desktop authentication uses **magic links** generated via a Supabase Edge Function. This approach:

- Eliminates service role key exposure in frontend code
- Provides independent sessions for desktop and web
- Uses secure token-based authentication

### Components

**1. Supabase Edge Function**: `supabase/functions/generate-magic-link/index.ts`

- Authenticates user via Bearer token
- Generates magic link using Supabase Admin API (service role)
- Returns hashed token (not full URL) to client
- Implements rate limiting (10 requests per 5 minutes)

**2. Client Helpers**:

- `frontend/lib/magic-link.ts` - Client-side helper (browser)
- `frontend/lib/magic-link-server.ts` - Server-side helper (API routes)

**3. Magic Link Handler**: `frontend/components/MagicLinkHandler.tsx`

- Processes magic link tokens from URL hash
- Verifies OTP and creates independent session
- Redirects to dashboard on success

### Authentication Flows

#### Flow 1: Email/Password Sign-in from Desktop

```
Desktop App
    │
    ├─ Opens web browser: https://app.om.local/login?source=desktop
    │
    ▼
Web Browser (Login Page)
    │
    ├─ User enters credentials
    │
    ├─ signIn(email, password) → Creates web session
    │
    ▼
Login Page (success)
    │
    ├─ Detects source=desktop query parameter
    │
    ├─ Calls generateMagicLink() helper
    │      │
    │      └─ Invokes Edge Function with Bearer token
    │           │
    │           └─ Edge Function returns hashedToken
    │
    ├─ Redirects to: om://auth/magiclink?token=xxx&email=yyy
    │
    ▼
Desktop App
    │
    ├─ Handles custom protocol (om://)
    │
    ├─ Opens web view: https://app.om.local/#magic_link_token=xxx&email=yyy
    │
    ▼
Web View (MagicLinkHandler)
    │
    ├─ Reads token from URL hash
    │
    ├─ Calls supabase.auth.verifyOtp(token_hash)
    │      │
    │      └─ Creates INDEPENDENT desktop session
    │
    ├─ Redirects to /dashboard
    │
    └─ Desktop app now has its own session
```

#### Flow 2: OAuth Sign-in from Desktop

```
Desktop App
    │
    ├─ Opens: https://app.om.local/login?source=desktop
    │
    ▼
Login Page
    │
    ├─ User clicks "Sign in with Google"
    │
    ├─ redirectTo includes source=desktop
    │      │
    │      └─ /auth/callback?source=desktop
    │
    ▼
OAuth Provider (Google/Microsoft)
    │
    ├─ User authenticates
    │
    └─ Redirects to /auth/callback?code=xxx&source=desktop
         │
         ▼
    OAuth Callback Route
         │
         ├─ Exchanges code for session
         │
         ├─ Detects source=desktop parameter
         │
         ├─ Calls generateMagicLinkServer(access_token)
         │      │
         │      └─ Edge Function returns hashedToken
         │
         ├─ Returns HTML with auto-redirect:
         │      om://auth/magiclink?token=xxx&email=yyy
         │
         ▼
    Desktop App (same as Flow 1)
```

#### Flow 3: Already Authenticated User

```
Desktop App
    │
    ├─ Opens: https://app.om.local/login?source=desktop
    │
    ▼
Login Page (useEffect checks existing auth)
    │
    ├─ getCurrentUser() returns existing session
    │
    ├─ Calls generateMagicLink() immediately
    │
    ├─ Redirects to: om://auth/magiclink?token=xxx&email=yyy
    │
    ▼
Desktop App (handles magic link)
```

### Independent Session Management

**Key Concept**: Web and desktop sessions are completely independent.

**Web Session**:

- Stored in browser cookies
- Managed by Next.js middleware
- Used for web dashboard access

**Desktop Session**:

- Created via `verifyOtp()` with magic link token
- Stored in desktop app's session storage
- Does NOT share cookies with web browser

**Sign-out Behavior**:

```typescript
// Sign out with 'local' scope (default)
await supabase.auth.signOut({ scope: 'local' });
// ✅ Only signs out THIS session (web OR desktop)
// ✅ Does NOT affect other sessions

// Sign out with 'global' scope
await supabase.auth.signOut({ scope: 'global' });
// ⚠️ Signs out ALL sessions (web AND desktop)
```

### Security Considerations

**Service Role Key Protection**:

- ❌ **NEVER** use `createServiceRoleClient()` in frontend code
- ✅ **ALWAYS** use Edge Functions for magic link generation
- ✅ Edge Functions safely use service role key server-side

**Token Security**:

- Magic link tokens are hashed (not plaintext)
- Tokens expire after single use
- Rate limiting prevents abuse (10 req/5min per user)

**Bearer Token Authentication**:

- Edge Function validates user identity via Bearer token
- Ensures only authenticated users can generate magic links
- Prevents unauthorized magic link generation

### Error Handling

**Edge Function Errors**:

- `401 Unauthorized` - Invalid or missing Bearer token
- `429 Too Many Requests` - Rate limit exceeded (retry after 5 minutes)
- `500 Internal Server Error` - Magic link generation failed

**Fallback Behavior**:

- OAuth callback falls back to old token-sharing method if magic link fails
- Ensures desktop auth continues working even if Edge Function is unavailable

### Testing

See test files for comprehensive coverage:

- `frontend/__tests__/unit/lib/magic-link.test.ts` - Client helper tests
- `frontend/__tests__/unit/lib/magic-link-server.test.ts` - Server helper tests
- `frontend/__tests__/unit/components/MagicLinkHandler.test.tsx` - Component tests

---

## Anonymous Upload & Claim Flow

Allows users to upload recordings without creating an account, then claim them after signup.

### Overview

The anonymous upload flow enables low-friction user acquisition by allowing anyone to upload a meeting recording and see their analysis preview before creating an account. When they sign up, their anonymous meetings are automatically transferred to their user account.

### Components

**Database Tables**:

- `anonymous_uploads` - Tracks anonymous uploads by email
- `beta_users` - Whitelisting for testing phase
- `meetings` - Uses `GUEST_USER_ID` for anonymous ownership
- `meeting_analysis` - Supports speaker assignments to `GUEST_USER_ID`

**Database Functions**:

- `normalize_email(email text)` - Email normalization for matching
- `claim_anonymous_meetings(p_user_id, p_email, p_selected_speaker)` - Claims anonymous meetings

**Frontend Components**:

- `/analysis/[meetingId]` - Public preview page with speaker assignment
- `/signup` - Auto-claim flow with email pre-fill
- `ClaimHandler` - OAuth claim handler

### Flow Diagram

```
1. Anonymous Upload
   User uploads → Edge Function stores in anonymous_uploads table
   ↓
2. Email Notification
   Resend sends analysis link: /analysis/{meetingId}
   ↓
3. Public Preview (/analysis/[meetingId])
   - Shows analysis preview (RLS policy: public read for unclaimed)
   - User assigns themselves to a speaker → Updates meeting_analysis.assigned_user_id = GUEST_USER_ID
   - Stored in localStorage for persistence
   ↓
4. Signup Flow
   - Email pre-filled from URL param
   - Speaker param passed from preview page
   - After signup: claim_anonymous_meetings() called
   ↓
5. Claim Process
   - Matches by normalized email (handles +suffix and Gmail dots)
   - Transfers meetings.user_id: GUEST_USER_ID → real user ID
   - Transfers meeting_analysis.assigned_user_id: GUEST_USER_ID → real user ID
   - Marks anonymous_uploads as claimed
   ↓
6. Redirect to Dashboard
   - Toast notification: "{N} meeting(s) added to your account"
   - Highlights newly claimed meeting
   - User sees their analysis with speaker already assigned
```

### Security Considerations

**RLS Policies**:

- Public read access for unclaimed anonymous meetings
- Anonymous users can only set `assigned_user_id` to `GUEST_USER_ID`
- Claimed meetings become private (normal RLS applies)

**Email Normalization**:

- Prevents duplicate signups: user+test@gmail.com = user@gmail.com
- Handles Gmail dots: user.name@gmail.com = username@gmail.com

**Constants**:

- `GUEST_USER_ID = '00000000-0000-0000-0000-000000000001'`
- Reserved UUID for anonymous operations
- Never exposed as a real user

### OAuth Signup Handling

For OAuth (Google/Microsoft) signups:

1. `pending_claim` data stored in localStorage before OAuth redirect
2. `ClaimHandler` component checks for pending claims on dashboard load
3. Claims meetings after OAuth callback completes
4. Same claim flow as email/password signup

### Edge Cases

**Multiple signups with same email**:

- First signup claims all anonymous uploads
- Subsequent logins don't re-claim

**User signs up with different email**:

- Not supported - must use the original anonymous upload email
- Users cannot claim meetings uploaded to different email addresses

**Meeting already claimed**:

- Shows "Already Claimed" message
- Suggests creating own account

---

## Security Architecture

### Row Level Security (RLS)

All database operations enforce RLS policies:

- Users can only access their own jobs
- Users can only access their own analysis results
- Enforced via `user_id = auth.uid()` check

**Tables with RLS**:

- `users`
- `processing_jobs`
- `meeting_analysis`
- `subscriptions`
- `payment_history`

### Service Role Key Usage

**CRITICAL**: The Python backend uses the Supabase service role key to:

- Download files from Storage (bypasses RLS for performance)
- Write to database tables
- Update job status

**Never expose the service role key in**:

- Frontend code
- Git repositories
- Client-side environment variables

**Best practices**:

- Store in Cloud Secret Manager (production)
- Use `.env` file locally (not committed to git)
- Rotate keys periodically

### Signed URLs

Files are accessed via time-limited signed URLs:

- Generated by Edge Function (server-side)
- 2 hour expiry
- Single-use recommended (though not enforced)
- Cannot be used to access other users' files

### API Authentication

Python backend validates `Authorization: Bearer <key>` header on all routes except `/api/health`.

**When to use**:

- Production deployments
- When Python backend is publicly accessible
- To prevent unauthorized processing requests

### Rate Limiting & Fraud Prevention

Anonymous meeting uploads include comprehensive fraud prevention mechanisms to protect against abuse and spam.

**Implemented in**: `supabase/functions/create-anonymous-meeting/index.ts`

#### 1. Monthly Upload Cap

- **Limit**: 500 anonymous uploads per month (across all non-beta users)
- **Tracking**: Counted from `anonymous_uploads.uploaded_at` column
- **Response**: HTTP 429 when cap is reached
- **Beta user bypass**: Beta users (in `beta_users` table) skip this check

#### 2. Per-Email Limit

- **Limit**: 1 upload per normalized email address (lifetime)
- **Email normalization**:
  - Converts to lowercase
  - Removes `+suffix` (e.g., `user+test@gmail.com` → `user@gmail.com`)
  - Removes dots for Gmail addresses (e.g., `user.name@gmail.com` → `username@gmail.com`)
- **Response**: HTTP 409 when email has been used before
- **Beta user bypass**: Beta users can upload multiple times (up to their allowed quota)

#### 3. IP-Based Rate Limiting

- **Window**: 1 hour sliding window
- **Limit**: 5 uploads per IP address within the time window
- **Implementation**: Queries `anonymous_uploads` table for same `rate_limit_key` (SHA-256 hash of email + IP)
- **Response**: HTTP 429 when IP limit is exceeded
- **Beta user bypass**: Beta users skip IP rate limiting

#### 4. Distributed Abuse Detection

- **Detection**: Multiple different emails from the same IP address within time window
- **Threshold**: 10 different normalized emails from same IP in 1 hour
- **Purpose**: Prevents attackers from bypassing per-email limits by using multiple email addresses
- **Response**: HTTP 429 with "Suspicious activity detected" message

#### 5. User-Agent Validation

- **Purpose**: Block bots, scrapers, and automated tools
- **Blocked patterns**:
  - Empty or missing User-Agent
  - Bot/crawler patterns (e.g., `Googlebot`, `bingbot`)
  - CLI tools (e.g., `curl`, `wget`)
  - API clients (e.g., `python-requests`, `Postman`)
- **Response**: HTTP 403 "Invalid request"
- **Note**: Legitimate browsers (Chrome, Firefox, Safari, Edge) are allowed

#### 6. File Content Fingerprinting

- **Purpose**: Detect duplicate file uploads to prevent same meeting from being uploaded multiple times
- **Method**: SHA-256 hash of first 1MB of file + file size
- **Storage**: Hash stored in `anonymous_uploads.file_hash` column
- **Duplicate action**:
  1. Detect duplicate hash in database
  2. Delete the newly uploaded file from storage
  3. Return HTTP 409 "This file has already been uploaded"
- **Beta user bypass**: Beta users skip duplicate file checks
- **Performance**: Only downloads first 1MB of file (not entire file) to compute hash

#### Rate Limiting Configuration

```typescript
const RATE_LIMIT_WINDOW_HOURS = 1; // Time window for IP-based limits
const RATE_LIMIT_MAX_UPLOADS_PER_IP = 5; // Max uploads per IP per window
const RATE_LIMIT_ABUSE_THRESHOLD = 10; // Multiple emails from same IP
const FILE_HASH_SAMPLE_SIZE = 1024 * 1024; // 1MB for hash computation
const MONTHLY_UPLOAD_CAP = 500; // Total monthly uploads
```

#### Database Schema for Fraud Prevention

**`anonymous_uploads` table** (see `supabase/migrations/20251117201948_add_anonymous_uploads_tables.sql`):

```sql
- ip_address text              -- Captured from request
- user_agent text              -- Browser/client identification
- rate_limit_key text          -- SHA-256 hash of email + IP
- file_hash text               -- SHA-256 hash of file content
- normalized_email text        -- For deduplication
```

**Indexes for performance**:

```sql
CREATE INDEX idx_anonymous_uploads_rate_limit ON anonymous_uploads(rate_limit_key, uploaded_at);
CREATE INDEX idx_anonymous_uploads_file_hash ON anonymous_uploads(file_hash) WHERE file_hash IS NOT NULL;
```

#### Testing

All fraud prevention functions have unit tests in `supabase/functions/create-anonymous-meeting/index.test.ts`:

- Email normalization and validation
- User-Agent pattern matching
- File hash computation consistency

Run tests with:

```bash
cd supabase/functions/create-anonymous-meeting
deno test --allow-all index.test.ts
```

---

## Environment Configuration

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NODE_ENV=development

# Stripe (for subscriptions)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Analytics (PostHog)
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_api_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Customer Communication (Intercom)
NEXT_PUBLIC_INTERCOM_APP_ID=your_intercom_app_id_here
INTERCOM_IDENTITY_VERIFICATION_SECRET=your_intercom_identity_secret_here

# OAuth (optional)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_azure_client_id
```

### Python Backend (Local: `python-backend/.env.local`)

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SECRET_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_key
AI_PROVIDER=gemini

# Transcription Provider
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
TRANSCRIPTION_PROVIDER=assemblyai  # or 'mock' for local dev

CORS_ORIGINS=http://localhost:3000
API_KEY=your_local_api_key  # Optional for local dev
```

### Python Backend (Cloud Run: `python-backend/.env.deploy`)

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SECRET_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_key
API_KEY=your_production_api_key

# Transcription Provider
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
TRANSCRIPTION_PROVIDER=assemblyai
```

**Note**: Cloud Run deployment uses Google Secret Manager. Secrets are configured via `deploy.sh` script and injected as environment variables at runtime.

### Supabase Edge Functions

Edge Functions require the following secrets (configured via Supabase dashboard):

```bash
PYTHON_BACKEND_URL=https://your-cloud-run-url
PYTHON_BACKEND_API_KEY=your_production_api_key
```

---

## Deployment Architecture

### Production Services

| Component      | Platform         | Scaling        | URL                         |
| -------------- | ---------------- | -------------- | --------------------------- |
| Frontend       | Vercel           | Automatic      | https://your-app.vercel.app |
| Python Backend | Google Cloud Run | 0-10 instances | https://xxx.run.app         |
| Database       | Supabase         | Managed        | https://xxx.supabase.co     |
| Storage        | Supabase         | Managed        | Via Supabase API            |
| Edge Functions | Supabase         | Managed        | Via Supabase API            |

### Deployment Triggers

**Frontend** (Vercel):

- PRs to `production` → Preview deployments
- Merges to `production` → Production deployment

**Python Backend** (Cloud Run):

- Merges to `production` with `python-backend/**` changes → Auto-deploy
- Via `.github/workflows/deploy-python-production.yml`

**Supabase** (Migrations + Edge Functions):

- Merges to `production` with `supabase/**` changes → Auto-deploy
- Via `.github/workflows/deploy-supabase-production.yml`

---

## Error Handling

### Upload Errors

Frontend validates:

- File size (max 200MB for MVP)
- File type (MP4, WebM, MOV, MP3, WAV)

### Processing Errors

Python backend saves errors to `processing_jobs.processing_error`:

**Common errors**:

- `"Failed to download file"` - Signed URL expired or invalid
- `"Transcription failed"` - Audio quality issues or unsupported format
- `"Backend not configured"` - PYTHON_BACKEND_URL not set
- `"Failed to connect to processing service"` - Python backend unreachable

### Retry Logic

Frontend can retry failed jobs:

1. Reset job status to `pending`
2. Trigger processing again via Edge Function

---

## Monitoring

### Production Metrics

**Supabase Logs**:

- Dashboard → Logs → API/Database/Edge Functions

**Cloud Run Logs**:

```bash
gcloud run services logs read meeting-intelligence-backend \
  --region us-central1 --limit 100
```

**Vercel Logs**:

- Vercel Dashboard → Deployments → Production → Logs

**Key Metrics to Monitor**:

- Average processing time per job
- Success rate (completed / total)
- Error rate
- Storage usage
- API costs (Gemini, AssemblyAI)

### Anonymous Upload Monitoring & Alerting

The anonymous upload system includes comprehensive monitoring and team alerting to prevent fraud and capacity issues.

**Implemented in**:

- `supabase/functions/create-anonymous-meeting/index.ts` - Event tracking
- `supabase/functions/send-team-alert/index.ts` - Real-time alerts
- `supabase/functions/monitoring-digest-cron/index.ts` - Daily digest
- `supabase/functions/_shared/analytics.ts` - Event tracking utilities

**Monitoring Events** (tracked to `user_event_log` table):

- `anon_upload_succeeded` - Successful upload with file details
- `anon_upload_failed` - Upload failure with error details
- `anon_upload_capacity_warning` - Monthly capacity approaching limit (90%+)
- `anon_upload_rate_limited` - Rate limit triggered (per-email, per-IP, or distributed abuse)
- `anon_upload_fraud_detected` - Fraud pattern detected (duplicate content, invalid user-agent, etc.)
- `anon_upload_ip_blocked` - IP blocked for distributed abuse (10+ emails from same IP)

**Real-Time Alerts**:

The `send-team-alert` Edge Function sends immediate email alerts to the team for:

- **Capacity warnings** (90%+ monthly usage)
- **Fraud spikes** (distributed abuse detected)
- **Rate limit spikes** (multiple rate limit events)
- **System failures** (multiple upload failures)

**Alert Deduplication**:

- Alerts are deduplicated using the `monitoring_alerts` table
- Only one alert per type is sent per hour to prevent alert fatigue
- Fire-and-forget calls from upload flow ensure alerts don't break uploads

**Daily Digest**:

- Runs daily at 9 AM UTC (`monitoring-digest-cron`)
- Aggregates last 24 hours of metrics:
  - Successful/failed uploads
  - Rate limiting breakdown (per-email, per-IP, distributed)
  - Fraud detection breakdown (user-agent, duplicate content, other)
  - Current monthly capacity usage
  - System health status (🟢 Healthy, 🟡 Monitor, 🔴 Attention)
- Sends summary email to team

**Database Tables**:

```sql
-- Alert deduplication and audit trail
CREATE TABLE monitoring_alerts (
  id UUID PRIMARY KEY,
  alert_type TEXT NOT NULL,        -- 'capacity_warning', 'fraud_spike', etc.
  alert_details JSONB,              -- Additional context
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Index for efficient deduplication queries
CREATE INDEX idx_monitoring_alerts_type_sent_at
  ON monitoring_alerts (alert_type, sent_at DESC);
```

**Configuration**:

- `TEAM_ALERT_EMAIL` - Email address for alerts (default: team@omaginelabs.com)
- `RESEND_API_KEY` - Required for sending emails
- Cron schedule: `"0 9 * * *"` (configured in Supabase Dashboard)
