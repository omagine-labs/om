"""
Process endpoint for handling video/audio processing jobs from Next.js frontend.
"""

import asyncio
import sys
import tempfile
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import sentry_sdk

from app.services.orchestrator import PipelineOrchestrator
from app.services.supabase_client import SupabaseClient

# Configure logging to output to stdout with immediate flush
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
logger = logging.getLogger(__name__)
# Force flush after every log message
for handler in logger.handlers:
    handler.setLevel(logging.INFO)
    if hasattr(handler, "setFormatter"):
        handler.setFormatter(
            logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        )

router = APIRouter()


class ProcessJobRequest(BaseModel):
    """Request model for processing a job"""

    job_id: str
    meeting_id: str  # New: link to meetings table
    user_id: str
    file_url: Optional[str] = None  # Optional for backward compatibility
    original_filename: str
    storage_path: Optional[str] = None  # New: direct storage path


class ProcessJobResponse(BaseModel):
    """Response model for processing job"""

    success: bool
    message: str
    python_job_id: str
    job_id: str


async def process_job_task(
    job_id: str,
    meeting_id: str,
    user_id: str,
    original_filename: str,
    file_url: Optional[str] = None,
    storage_path: Optional[str] = None,
) -> None:
    """
    Background task to process the video/audio file.
    This runs asynchronously after the API returns.
    """
    temp_file = None

    try:
        # Create temp directory for this job
        temp_dir = Path(tempfile.mkdtemp(prefix=f"job_{job_id}_"))
        # Sanitize filename to prevent path traversal attacks
        safe_filename = Path(original_filename).name
        temp_file = temp_dir / safe_filename

        # Create Supabase client to check priority and anonymous status
        supabase = SupabaseClient()

        # Check if this is a high-priority job
        job_data = await supabase.get_job_status(job_id)
        is_priority = (
            job_data.get("processing_priority") == "high" if job_data else False
        )

        # Check if this is an anonymous upload
        is_anonymous = await supabase.is_anonymous_meeting(meeting_id)

        if is_priority:
            logger.info(f"[Job {job_id}] High-priority processing enabled")
            sys.stdout.flush()

        if is_anonymous:
            logger.info(f"[Job {job_id}] Anonymous upload detected")
            sys.stdout.flush()

        # Use storage_path if provided (new behavior), otherwise fall back to file_url
        if storage_path:
            # Standard meeting pipeline
            orchestrator = PipelineOrchestrator()
            await orchestrator.execute(
                job_id,
                meeting_id,
                user_id,
                storage_path,
                temp_file,
                is_priority,
                is_anonymous,
            )
        elif file_url:
            # Backward compatibility: old Edge Function still sending file_url
            # Note: deprecated, will be removed after Edge Function update
            logger.warning(f"[Job {job_id}] Using deprecated file_url parameter")
            # For backward compatibility, we'd need the old download_file logic
            # But since we're deploying both together, this shouldn't be hit
            raise ValueError("file_url is no longer supported, use storage_path")
        else:
            raise ValueError("Either storage_path or file_url must be provided")

    except Exception as e:
        # Error already logged and status updated by orchestrator
        # Sentry will capture this via the orchestrator, but add context here too
        sentry_sdk.set_tag("job_id", job_id)
        sentry_sdk.set_tag("meeting_id", meeting_id)
        logger.error(f"[Job {job_id}] Processing failed: {str(e)}", exc_info=True)
        sys.stdout.flush()

    finally:
        # Cleanup temp file
        if temp_file and temp_file.exists():
            try:
                temp_file.unlink()
                if temp_file.parent.exists():
                    temp_file.parent.rmdir()
                logger.info(f"[Job {job_id}] Cleaned up temp files")
                sys.stdout.flush()
            except Exception as cleanup_error:
                logger.error(
                    f"[Job {job_id}] Cleanup error: {str(cleanup_error)}", exc_info=True
                )
                sys.stdout.flush()


@router.post("/process", response_model=ProcessJobResponse)
async def process_job(
    request: ProcessJobRequest, background_tasks: BackgroundTasks
) -> ProcessJobResponse:
    """
    Start processing a video/audio file.

    This endpoint receives a job request from Next.js, validates it,
    and starts the processing in the background.

    Note: Authentication is handled by APIKeyMiddleware
    """

    # Validate request
    if not request.job_id:
        raise HTTPException(status_code=400, detail="job_id is required")

    # Ensure either file_url or storage_path is provided
    if not request.file_url and not request.storage_path:
        raise HTTPException(
            status_code=400, detail="Either file_url or storage_path must be provided"
        )

    logger.info(f"📥 Received processing request for job: {request.job_id}")
    sys.stdout.flush()

    # Generate Python job ID (for tracking within Python backend)
    python_job_id = f"py_{request.job_id}"

    # Start processing in background
    background_tasks.add_task(
        process_job_task,
        request.job_id,
        request.meeting_id,
        request.user_id,
        request.original_filename,
        request.file_url,
        request.storage_path,
    )

    return ProcessJobResponse(
        success=True,
        message="Processing started",
        python_job_id=python_job_id,
        job_id=request.job_id,
    )


@router.get("/process/status/{job_id}")
async def get_job_status(job_id: str) -> Dict[str, Any]:
    """
    Get the current status of a processing job.

    This queries the Supabase database for job status.
    """
    try:
        supabase = SupabaseClient()
        job = await supabase.get_job_status(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return {"success": True, "job": job}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching job status: {str(e)}", exc_info=True)
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================
# Game processing endpoint (uses games table)
# ============================================

# Limit concurrent game processing to prevent OOM errors
# With ~3 MB audio files, 3 concurrent = ~50 MB peak memory (safe for 512 MB instances)
_game_processing_semaphore = asyncio.Semaphore(3)


class ProcessGameRequest(BaseModel):
    """Request model for processing a game (PowerPoint Karaoke)"""

    game_id: str


class ProcessGameResponse(BaseModel):
    """Response model for game processing"""

    success: bool
    message: str
    game_id: str


async def process_game_task(game_id: str) -> None:
    """
    Background task to process a game recording.
    Uses the new games table directly.

    Uses a semaphore to limit concurrent processing and prevent OOM errors.
    """
    async with _game_processing_semaphore:
        try:
            from app.services.game.game_orchestrator import GamePipelineOrchestrator

            logger.info(f"[Game {game_id}] Starting game processing task")
            sys.stdout.flush()

            orchestrator = GamePipelineOrchestrator()
            await orchestrator.execute_for_game(game_id)

        except Exception as e:
            sentry_sdk.set_tag("game_id", game_id)
            logger.error(f"[Game {game_id}] Processing failed: {str(e)}", exc_info=True)
            sys.stdout.flush()


@router.post("/process/game", response_model=ProcessGameResponse)
async def process_game(
    request: ProcessGameRequest, background_tasks: BackgroundTasks
) -> ProcessGameResponse:
    """
    Start processing a PowerPoint Karaoke game recording.

    This endpoint receives a game_id, validates it, and starts
    the game analysis pipeline in the background.

    Note: Authentication is handled by APIKeyMiddleware
    """

    if not request.game_id:
        raise HTTPException(status_code=400, detail="game_id is required")

    logger.info(f"📥 Received game processing request for: {request.game_id}")
    sys.stdout.flush()

    # Start processing in background
    background_tasks.add_task(process_game_task, request.game_id)

    return ProcessGameResponse(
        success=True,
        message="Game processing started",
        game_id=request.game_id,
    )


# ============================================
# Stuck game detection endpoint
# ============================================


class CleanupStuckGamesResponse(BaseModel):
    """Response model for stuck game cleanup"""

    success: bool
    message: str
    failed_game_ids: list[str]


@router.post("/process/cleanup-stuck-games", response_model=CleanupStuckGamesResponse)
async def cleanup_stuck_games(minutes_threshold: int = 10) -> CleanupStuckGamesResponse:
    """
    Find and mark stuck games as failed.

    Games that have been in 'processing' status for longer than the threshold
    are considered stuck and will be marked as 'failed'.

    This endpoint can be triggered by:
    - Cloud Scheduler (cron job)
    - Manual admin action
    - Monitoring alerts

    Args:
        minutes_threshold: Minutes after which a processing game is considered stuck.
                          Default is 10 minutes.

    Note: Authentication is handled by APIKeyMiddleware
    """
    try:
        supabase = SupabaseClient()
        failed_ids = await supabase.mark_stuck_games_as_failed(minutes_threshold)

        message = (
            f"Marked {len(failed_ids)} stuck games as failed"
            if failed_ids
            else "No stuck games found"
        )

        logger.info(f"🧹 Stuck game cleanup: {message}")
        sys.stdout.flush()

        return CleanupStuckGamesResponse(
            success=True,
            message=message,
            failed_game_ids=failed_ids,
        )

    except Exception as e:
        logger.error(f"Failed to cleanup stuck games: {str(e)}", exc_info=True)
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail="Failed to cleanup stuck games")
