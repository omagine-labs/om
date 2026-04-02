"""
Audio ingestion service for handling audio transcription.

This service handles transcription of audio files (or video files with audio).
It serves as the core transcription layer that can be reused for:
- Video uploads (via VideoIngestion delegation)
- Direct audio uploads (future)
- Transcript uploads with audio (future)
"""

import sys
import logging
from pathlib import Path
from typing import Dict, Any

from app.services.ingestion.transcription.transcription_service import (
    TranscriptionService,
)

logger = logging.getLogger(__name__)


class AudioIngestion:
    """Handles audio/video file transcription with speaker diarization."""

    async def transcribe(
        self, job_id: str, audio_file_path: Path, is_priority: bool = False
    ) -> Dict[str, Any]:
        """
        Transcribe an audio or video file.

        Args:
            job_id: The job identifier for logging
            audio_file_path: Path to the audio or video file to transcribe
            is_priority: If True, use faster polling for transcription (5s vs 10s)

        Returns:
            Dictionary containing transcription results with keys:
                - text: Full transcript text
                - segments: List of segments with timestamps and speakers
                - duration: Duration in seconds
                - num_speakers: Number of detected speakers

        Raises:
            Exception: If transcription fails
        """
        # Verify file exists
        if not audio_file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        file_size_mb = audio_file_path.stat().st_size / (1024 * 1024)
        logger.info(f"[Job {job_id}] Processing audio file: {file_size_mb:.2f} MB")
        sys.stdout.flush()

        # Transcribe audio (with speaker diarization)
        logger.info(
            f"[Job {job_id}] Starting transcription with speaker diarization..."
        )
        sys.stdout.flush()

        transcription_service = TranscriptionService()
        transcription_result = await transcription_service.transcribe(
            audio_file_path, is_priority=is_priority
        )

        if not transcription_result or "error" in transcription_result:
            error_msg = transcription_result.get("error", "Unknown error")
            raise Exception(f"Transcription failed: {error_msg}")

        num_speakers = transcription_result.get("num_speakers", 0)
        num_segments = len(transcription_result.get("segments", []))
        logger.info(
            f"[Job {job_id}] Transcription complete. "
            f"Speakers: {num_speakers}, Segments: {num_segments}"
        )
        sys.stdout.flush()

        return transcription_result
