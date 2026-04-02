"""
Ingestion orchestrator for routing file processing based on file type.

This orchestrator determines whether a file is video or audio and routes
to the appropriate ingestion service. After transcription, it generates
speaker embeddings for voice identification.
"""

import sys
import logging
from pathlib import Path
from typing import Dict, Any

from app.services.ingestion.video_ingestion import VideoIngestion
from app.services.ingestion.audio_ingestion import AudioIngestion

logger = logging.getLogger(__name__)

# Video file extensions
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}

# Audio file extensions
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def detect_file_type(file_path: Path) -> str:
    """
    Detect if a file is video or audio based on extension.

    Args:
        file_path: Path to the media file

    Returns:
        'video' or 'audio'

    Raises:
        ValueError: If file type cannot be determined
    """
    extension = file_path.suffix.lower()

    if extension in VIDEO_EXTENSIONS:
        return "video"
    elif extension in AUDIO_EXTENSIONS:
        return "audio"
    else:
        raise ValueError(f"Unsupported file extension: {extension}")


class IngestionOrchestrator:
    """Orchestrates ingestion routing based on file type."""

    def __init__(self):
        """Initialize ingestion orchestrator with service instances."""
        self.video_ingestion = VideoIngestion()
        self.audio_ingestion = AudioIngestion()

    async def ingest(
        self,
        job_id: str,
        file_path: Path,
        skip_video_processing: bool = False,
        is_priority: bool = False,
    ) -> Dict[str, Any]:
        """
        Process a media file and return transcript.

        Detects file type and routes to appropriate ingestion service:
        - Video files: extract audio → transcribe (or skip extraction if skip_video_processing=True)
        - Audio files: transcribe directly

        Args:
            job_id: The job identifier for logging
            file_path: Path to the downloaded media file
            skip_video_processing: If True, send video files directly to AssemblyAI (faster for anonymous uploads)
            is_priority: If True, use faster polling for transcription (5s vs 10s)

        Returns:
            Dictionary containing transcription results:
            {
                "text": "...",
                "speakers": ["SPEAKER_A", "SPEAKER_B"],
                "segments": [...]
            }

        Raises:
            Exception: If ingestion fails
        """
        # Detect file type
        file_type = detect_file_type(file_path)
        logger.info(f"[Job {job_id}] Detected file type: {file_type}")
        sys.stdout.flush()

        if file_type == "video":
            if skip_video_processing:
                # Fast path: Send video directly to AssemblyAI (supports video files)
                logger.info(
                    f"[Job {job_id}] Processing as video file (skipping audio extraction for speed)"
                )
                sys.stdout.flush()

                # AssemblyAI can handle video files directly
                transcript = await self.audio_ingestion.transcribe(
                    job_id, file_path, is_priority=is_priority
                )
            else:
                # Standard flow: extract audio → transcribe
                logger.info(f"[Job {job_id}] Processing as video file")
                sys.stdout.flush()

                # Extract audio from video
                audio_file = await self.video_ingestion.extract_audio(job_id, file_path)

                # Transcribe extracted audio
                transcript = await self.audio_ingestion.transcribe(
                    job_id, audio_file, is_priority=is_priority
                )

                # Clean up extracted audio file
                try:
                    audio_file.unlink()
                    logger.info(f"[Job {job_id}] Cleaned up extracted audio file")
                    sys.stdout.flush()
                except Exception as cleanup_error:
                    logger.warning(
                        f"[Job {job_id}] Failed to clean up audio file: {cleanup_error}"
                    )
                    sys.stdout.flush()

        else:  # audio
            # Audio flow: transcribe directly
            logger.info(f"[Job {job_id}] Processing as audio file")
            sys.stdout.flush()

            transcript = await self.audio_ingestion.transcribe(
                job_id, file_path, is_priority=is_priority
            )

        return transcript
