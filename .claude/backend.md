# Python Backend PR Review Guidelines

FastAPI + Python 3.11+ + Google Cloud Run + AssemblyAI + Gemini

## Critical Checks

**Code Quality:**

- PEP 8 compliance (run `flake8`)
- Type hints on all function signatures
- Docstrings for public functions
- Logging (not print statements)
- Specific exception types (not bare `except`)

**FastAPI Patterns:**

- Async route handlers (`async def`) for I/O operations
- Background tasks for long-running operations
- Pydantic models for request/response validation
- Proper HTTP status codes (202 for background jobs)

**Processing Pipeline:**

- Update job status: `pending` → `processing` → `completed`/`failed`
- Always update status to `failed` in exception handlers
- Cleanup temp files in `finally` blocks
- Database writes use service role key (not anon key)
- Include `user_id` in all database writes (for RLS)

**Security:**

- API key middleware on all routes except `/api/health`
- Validate `Authorization: Bearer <key>` header
- No API keys in logs or responses
- Environment variables for all secrets
- CORS configured for specific origins

**Provider Pattern:**

- Implement base interface/protocol
- Provider selection via environment variables
- Graceful fallback to mock providers
- No provider-specific logic in business code

**External APIs:**

- Timeout configuration
- Retry logic for transient failures
- Proper error messages
- API keys from environment variables

## Common Anti-Patterns

❌ **Blocking Operations in Async Code**

```python
# WRONG - Blocks event loop
def read_file(path: str):
    with open(path, 'rb') as f:
        return f.read()

async def process():
    data = read_file('/tmp/file.mp4')  # Blocks!
```

❌ **Missing Error Status Updates**

```python
# WRONG - Job stays in "processing" state
try:
    result = await process_file(job_id)
except Exception as e:
    logger.error(f"Failed: {e}")
    return  # Status never updated!
```

❌ **Using Anon Key for Writes**

```python
# WRONG - RLS prevents writes
supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
supabase.table('meeting_analysis').insert(data)  # Fails!
```

❌ **Not Cleaning Up Temp Files**

```python
# WRONG - Files accumulate in /tmp
async def process():
    path = await download_file(url, job_id)
    result = await transcribe(path)
    return result  # File never deleted!
```

❌ **Missing user_id in Database Writes**

```python
# WRONG - RLS requires user_id
supabase.table('meeting_analysis').insert({
    'job_id': job_id,
    'transcript': transcript
    # Missing user_id!
}).execute()
```

## Background Task Pattern

```python
async def process_meeting_background(job_id: str, signed_url: str, user_id: str):
    try:
        await update_job_status(job_id, "processing")
        local_path = await download_file(signed_url, job_id)
        transcript = await transcribe_audio(local_path)
        analysis = await generate_analysis(transcript)
        await save_analysis(job_id, user_id, transcript, analysis)
        await update_job_status(job_id, "completed")
    except Exception as e:
        logger.error(f"Processing failed: {e}")
        await update_job_status(job_id, "failed", error=str(e))
    finally:
        cleanup_temp_files(job_id)
```

## Architecture Reminders

- Backend handles: Transcription, AI analysis, CPU/GPU-intensive processing
- Backend does NOT handle: User auth, file uploads, job creation (frontend/Supabase)
- Only receives calls from Edge Functions (via API key)
- Stateless (Cloud Run scales to zero)

## Quality Commands

```bash
flake8 app/
pytest tests/
```
