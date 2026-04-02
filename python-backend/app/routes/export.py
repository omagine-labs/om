"""
Export endpoint for creating downloadable videos from game recordings.
"""

import asyncio
import logging
import sys
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from app.services.supabase_client import SupabaseClient
from app.services.video_stitcher import VideoStitcher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
logger = logging.getLogger(__name__)

router = APIRouter()

# Limit concurrent exports to prevent resource exhaustion
# Video encoding is CPU-intensive, limit to 2 concurrent exports
# NOTE: For production with high traffic, consider adding per-user rate limiting
# (e.g., max 5 exports per hour per user) to prevent abuse
_export_semaphore = asyncio.Semaphore(2)

# Track export jobs in memory (simple implementation)
# WARNING: Job state is lost on server restart. For production use with multiple
# instances or persistence requirements, consider using Redis or database storage.
_export_jobs: dict[str, dict] = {}


class ExportVideoRequest(BaseModel):
    """Request model for video export"""

    game_id: str
    access_token: Optional[str] = None  # Required for anonymous users


class ExportVideoResponse(BaseModel):
    """Response model for video export"""

    success: bool
    message: str
    export_id: str
    status: str  # 'processing', 'completed', 'failed'
    download_url: Optional[str] = None


class ExportStatusResponse(BaseModel):
    """Response model for export status check"""

    success: bool
    export_id: str
    status: str
    download_url: Optional[str] = None
    error: Optional[str] = None


async def process_export_task(
    export_id: str,
    game_id: str,
    slide_ids: list[str],
    audio_storage_path: str,
    video_storage_path: Optional[str],
    recording_mode: str,
    topic_name: Optional[str] = None,
) -> None:
    """
    Background task to process the video export.
    """
    async with _export_semaphore:
        try:
            logger.info(f"[Export {export_id}] Starting export for game {game_id}")
            sys.stdout.flush()

            _export_jobs[export_id] = {
                "status": "processing",
                "game_id": game_id,
            }

            stitcher = VideoStitcher()
            download_url = await stitcher.export_game(
                game_id=game_id,
                slide_ids=slide_ids,
                audio_storage_path=audio_storage_path,
                video_storage_path=video_storage_path,
                recording_mode=recording_mode,
                topic_name=topic_name,
            )

            _export_jobs[export_id] = {
                "status": "completed",
                "game_id": game_id,
                "download_url": download_url,
            }

            logger.info(f"[Export {export_id}] Export completed successfully")
            sys.stdout.flush()

        except Exception as e:
            logger.error(f"[Export {export_id}] Export failed: {e}", exc_info=True)
            sys.stdout.flush()

            _export_jobs[export_id] = {
                "status": "failed",
                "game_id": game_id,
                "error": str(e),
            }


@router.post("/export/video", response_model=ExportVideoResponse)
async def export_video(
    request: ExportVideoRequest,
    background_tasks: BackgroundTasks,
) -> ExportVideoResponse:
    """
    Start video export for a game recording.

    This endpoint validates access, fetches game data, and starts
    the export process in the background.

    Returns an export_id that can be used to check status.

    Note: Authentication is handled by APIKeyMiddleware
    """
    if not request.game_id:
        raise HTTPException(status_code=400, detail="game_id is required")

    logger.info(f"📥 Received export request for game: {request.game_id}")
    sys.stdout.flush()

    try:
        supabase = SupabaseClient()

        # Fetch game data
        game = await supabase.get_game(request.game_id)

        # Validate game status
        if game.get("status") != "completed":
            raise HTTPException(
                status_code=400,
                detail="Game must be completed before export",
            )

        # Validate access for anonymous users
        if game.get("user_id") is None:
            # Anonymous game - require access token
            if not request.access_token:
                raise HTTPException(
                    status_code=401,
                    detail="access_token required for anonymous games",
                )
            if game.get("access_token") != request.access_token:
                raise HTTPException(
                    status_code=403,
                    detail="Invalid access token",
                )

        # Get required data
        slide_ids = game.get("slide_ids", [])
        if not slide_ids:
            raise HTTPException(
                status_code=400,
                detail="Game has no slides recorded",
            )

        audio_storage_path = game.get("audio_storage_path")
        if not audio_storage_path:
            raise HTTPException(
                status_code=400,
                detail="Game has no audio recording",
            )

        video_storage_path = game.get("video_storage_path")

        # Determine recording mode
        recording_mode = "audio_only"
        if video_storage_path and slide_ids:
            recording_mode = "selfie_video"

        # Fetch topic name for countdown overlay
        topic_name = None
        topic_date = game.get("topic_date")
        if topic_date:
            topic_name = await supabase.get_topic_name(topic_date)
            if topic_name:
                logger.info(f"📋 Topic name for export: {topic_name}")

        # Generate export ID
        export_id = str(uuid.uuid4())[:8]

        # Start background export
        background_tasks.add_task(
            process_export_task,
            export_id,
            request.game_id,
            slide_ids,
            audio_storage_path,
            video_storage_path,
            recording_mode,
            topic_name,
        )

        # Initialize job status
        _export_jobs[export_id] = {
            "status": "processing",
            "game_id": request.game_id,
        }

        return ExportVideoResponse(
            success=True,
            message="Export started",
            export_id=export_id,
            status="processing",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export request failed: {e}", exc_info=True)
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/status/{export_id}", response_model=ExportStatusResponse)
async def get_export_status(export_id: str) -> ExportStatusResponse:
    """
    Check the status of an export job.

    Returns the current status and download URL if completed.
    """
    job = _export_jobs.get(export_id)

    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")

    return ExportStatusResponse(
        success=True,
        export_id=export_id,
        status=job["status"],
        download_url=job.get("download_url"),
        error=job.get("error"),
    )
