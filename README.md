# Om — Meeting Intelligence Assistant (Archived)

AI-powered video/audio analysis platform that generates communication insights and behavioral analysis from meeting recordings. Built by the [Omagine Labs](https://omaginelabs.com) team.

**This project is no longer actively maintained.** It is shared publicly as an open-source reference for anyone building similar products. Feel free to fork, learn from, or build upon this codebase.

---

## What Om Did

Om helped professionals understand and improve how they communicate at work — not just what they said, but *how* they said it.

- **14 behavioral signals** across Clarity and Confidence (hedging, trailing off, burying the lead, filler words, etc.)
- **Per-speaker analysis** with talk time, interruption patterns, and response latency
- **Desktop recording app** (macOS, Electron) with automatic meeting capture
- **Web dashboard** for reviewing insights and tracking growth over time

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Desktop**: Electron with native macOS ScreenCaptureKit integration
- **Backend**: FastAPI (Python), Google Gemini for AI analysis, AssemblyAI for transcription
- **Database**: Supabase (PostgreSQL) with Row Level Security, Edge Functions (Deno)
- **Payments**: Stripe subscriptions with webhook handling
- **Infrastructure**: Vercel (frontend), Google Cloud Run (backend), GitHub Actions CI/CD

## Project Structure

```
om/
├── frontend/              # Next.js 15 web app
│   ├── app/               # App Router pages and API routes
│   ├── components/        # React components
│   └── lib/               # Utilities, Supabase client, analytics
│
├── om-desktop/            # Electron desktop app (macOS)
│   ├── src/               # Main process, UI components, services
│   └── native/            # Native macOS addons (ScreenCaptureKit)
│
├── python-backend/        # FastAPI service
│   ├── app/services/      # Transcription, AI analysis, metrics
│   └── Dockerfile
│
├── supabase/              # Database, Edge Functions, migrations
│   ├── migrations/        # Schema migrations
│   └── functions/         # Edge Functions (Deno)
│
├── scripts/               # Development and utility scripts
└── docs/                  # Technical documentation
```

## Architecture

```
User uploads recording
    → Supabase Storage
    → Database trigger fires
    → Edge Function orchestrates processing
    → Python backend:
        1. Transcribes audio (AssemblyAI)
        2. Speaker diarization
        3. Behavioral analysis (Google Gemini)
        4. Communication metrics calculation
        5. Results saved to database
    → Frontend displays insights
```

Key principle: Frontend never communicates directly with the Python backend. All orchestration flows through Supabase Edge Functions.

## Running Locally

> **Note**: This project requires API keys for AssemblyAI, Google Gemini, and Stripe to be fully functional. See the `.env.local.example` files in each directory for required configuration.

### Prerequisites

- Docker Desktop
- Node.js 18+
- Supabase CLI (`npm install -g supabase`)
- Python 3.11+ (for backend development)

### Setup

```bash
# Install dependencies
npm run install:all

# Copy environment files and fill in your API keys
cp frontend/.env.local.example frontend/.env.local
cp python-backend/.env.local.example python-backend/.env.local

# Start all services (frontend, backend, Supabase, Stripe)
npm start
```

- Frontend: http://localhost:3000
- Python Backend: http://localhost:8000
- Supabase Studio: http://localhost:54323

## Documentation

Technical documentation lives in `/docs`:

- [Architecture](docs/architecture.md) — System design and data flow
- [Database](docs/database.md) — Schema, migrations, RLS patterns
- [Deployment](docs/deployment.md) — CI/CD and environments
- [Stripe Integration](docs/stripe.md) — Subscription billing
- [Frontend Testing](docs/frontend-testing.md) — Jest testing patterns
- [Python Testing](docs/python-testing.md) — pytest backend testing
- [Contributing](docs/contributing.md) — Code style and PR guidelines

## License

MIT

## Team

Built by [Omagine Labs](https://omaginelabs.com).
