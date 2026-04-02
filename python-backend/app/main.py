"""
FastAPI application for video processing.

This service handles CPU/GPU intensive video operations that are better
suited for Python than Node.js.
"""

from app.config import settings
import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import httpx
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from app.routes import health, process, export
from app.middleware.auth import APIKeyMiddleware
from app.services.file_validator import FileValidationError

# Load environment variables
load_dotenv()


def initialize_sentry() -> None:
    """Initialize Sentry - called during app startup when secrets are available."""
    try:
        # Only initialize Sentry in production environments to avoid wasting quota
        # Production requires SENTRY_ENVIRONMENT=production (set explicitly in Cloud Run)
        # This prevents dev issues from sneaking through when PORT is set locally
        is_production = os.getenv("SENTRY_ENVIRONMENT") == "production"

        if not is_production:
            print(
                "⚠️ Sentry disabled in development - only production errors are tracked",
                flush=True,
            )
            return

        sentry_dsn = os.getenv("SENTRY_DSN")

        if not sentry_dsn:
            print("⚠️ SENTRY_DSN not set - error tracking disabled", flush=True)
            return

        def before_send(event, hint):
            """
            Filter out noise from Sentry events before sending.

            Filters:
            - FileValidationError (expected user validation errors, not system errors)
            - Platform noise messages
            """
            # Filter out FileValidationError by exception type (not string matching)
            # These are expected user validation errors, not system errors
            if "exc_info" in hint:
                exc_type, exc_value, _ = hint["exc_info"]
                if exc_type is FileValidationError or isinstance(
                    exc_value, FileValidationError
                ):
                    return None

            # Get error message for string-based filtering (platform noise)
            error_message = ""
            if event.get("exception"):
                values = event["exception"].get("values", [])
                if values:
                    error_message = values[0].get("value", "")
            elif event.get("message"):
                error_message = event["message"]

            # Filter out Supabase Edge Function success messages (noise)
            if "Edge Function invoked successfully" in error_message:
                return None

            # Filter out uvicorn startup/shutdown messages (not errors)
            uvicorn_noise = [
                "Application startup complete",
                "Application shutdown complete",
                "Waiting for application shutdown",
                "Waiting for application startup",
                "Uvicorn running on",
                "Started server process",
                "Shutting down",
            ]
            for noise in uvicorn_noise:
                if noise in error_message:
                    return None

            # Filter out expected validation errors logged at ERROR level
            # These are user errors, not system errors - don't waste Sentry quota
            validation_noise = [
                "File validation failed",
                "Speech validation failed",
                "Duration validation failed",
                "too small",
                "too large",
                "too short",
                "too long",
                "No speech detected",
                "Insufficient speech content",
            ]
            for noise in validation_noise:
                if noise in error_message:
                    return None

            # Filter out auth health check failures (expected in local dev with prod vars)
            if "Auth health check failed" in error_message:
                return None

            return event

        # Get release version from environment (set by deployment)
        git_sha = os.getenv("GITHUB_SHA", "")
        release = f"om-python@{git_sha[:7]}" if git_sha else None

        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                LoggingIntegration(
                    level=logging.INFO,  # Capture INFO and above as breadcrumbs
                    event_level=logging.ERROR,  # Only send errors as Sentry issues
                ),
            ],
            # Performance monitoring - sample 10% of transactions
            traces_sample_rate=0.1,
            # Environment is always production here (we exit early if not)
            environment="production",
            # Release tracking for correlating errors with deploys
            release=release,
            # Disable PII in production for privacy
            send_default_pii=False,
            # Attach stack traces to log messages
            attach_stacktrace=True,
            # Enable logs to be sent to Sentry
            enable_logs=True,
            # Filter out noise before sending
            before_send=before_send,
        )
        print("🔍 Sentry error tracking initialized", flush=True)
    except Exception as e:
        # Don't let Sentry initialization failures break the app
        print(f"⚠️ Failed to initialize Sentry: {e}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    # Startup: Initialize Sentry first
    initialize_sentry()

    # Create shared HTTP client with connection pooling
    # This reduces connection overhead for concurrent requests
    app.state.http_client = httpx.AsyncClient(
        limits=httpx.Limits(
            max_connections=50,  # Total connection pool size
            max_keepalive_connections=10,  # Keep-alive connections
        ),
        timeout=httpx.Timeout(
            connect=10.0,  # Connection timeout
            read=300.0,  # Read timeout (longer for large files)
            write=30.0,  # Write timeout
            pool=10.0,  # Pool timeout
        ),
    )

    # Create necessary directories
    storage_dir = Path(os.getenv("UPLOAD_DIR", "./storage/uploads"))
    temp_dir = Path(os.getenv("TEMP_DIR", "./storage/temp"))
    storage_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    print("🚀 Python backend started")
    print(f"📁 Storage: {storage_dir.absolute()}")
    print(f"📁 Temp: {temp_dir.absolute()}")

    yield

    # Shutdown: Close shared HTTP client
    await app.state.http_client.aclose()
    print("👋 Python backend shutting down")


app = FastAPI(
    title="Meeting Intelligence - Video Processing API",
    description="Python backend for video processing operations",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
cors_origins_list = settings.cors_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Key authentication middleware
app.add_middleware(APIKeyMiddleware)

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(process.router, prefix="/api", tags=["process"])
app.include_router(export.router, prefix="/api", tags=["export"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Meeting Intelligence - Video Processing",
        "status": "running",
        "docs": "/docs",
        "supabase_configured": bool(os.getenv("SUPABASE_URL")),
        "ai_provider": os.getenv("AI_PROVIDER", "gemini"),
        "environment": os.getenv("SENTRY_ENVIRONMENT", "development"),
    }
