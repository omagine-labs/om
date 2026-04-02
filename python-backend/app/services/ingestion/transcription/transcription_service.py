"""
Transcription Service using AssemblyAI.
"""

from typing import Optional, Dict, Any
from pathlib import Path
import logging
import os

from .assemblyai import AssemblyAIProvider

logger = logging.getLogger(__name__)


class TranscriptionService:
    """Transcription service using AssemblyAI API."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize transcription service.

        Args:
            api_key: AssemblyAI API key. Auto-detected from env if None.

        Raises:
            ValueError: If API key is not provided or found in environment
        """
        self.api_key = api_key or os.getenv("ASSEMBLYAI_API_KEY")

        if not self.api_key:
            raise ValueError(
                "AssemblyAI API key not found. "
                "Set ASSEMBLYAI_API_KEY environment variable."
            )

        self.provider = AssemblyAIProvider(api_key=self.api_key)
        logger.info("🎙️  Transcription service initialized with AssemblyAI")

    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        enable_diarization: bool = True,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
        is_priority: bool = False,
    ) -> Dict[str, Any]:
        """
        Transcribe audio file with optional speaker diarization.

        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'es') or None for auto-detect
            enable_diarization: Whether to perform speaker diarization
            min_speakers: Minimum number of speakers (for diarization)
            max_speakers: Maximum number of speakers (for diarization)
            is_priority: If True, use faster polling for transcription (5s vs 10s)

        Returns:
            Dictionary with:
                - text: Full transcript
                - segments: List of segments with timestamps and speakers
                - speakers: List of detected speakers
                - language: Detected/specified language
                - duration: Audio duration in seconds
                - num_speakers: Number of detected speakers
        """
        try:
            result = await self.provider.transcribe(
                audio_path=audio_path,
                language=language,
                enable_diarization=enable_diarization,
                min_speakers=min_speakers,
                max_speakers=max_speakers,
                is_priority=is_priority,
            )

            # Convert TranscriptionResult to dict format expected by existing code
            return {
                "text": result.text,
                "segments": result.segments,
                "speakers": result.speakers,
                "language": result.language,
                "duration": result.duration,
                "num_speakers": result.num_speakers,
            }

        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            return {"error": str(e)}

    def transcribe_with_words(
        self, audio_path: Path, language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Transcribe with word-level timestamps (synchronous wrapper).

        This is a compatibility method for existing code that expects synchronous calls.
        For new code, prefer the async transcribe() method.

        Args:
            audio_path: Path to audio file
            language: Language code or None for auto-detect

        Returns:
            Transcription result dictionary
        """
        import asyncio

        # Create event loop if needed
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        # Run async transcription
        return loop.run_until_complete(
            self.transcribe(audio_path, language, enable_diarization=True)
        )

    def get_supported_languages(self) -> list[str]:
        """
        Get list of supported languages.

        Returns:
            List of language codes
        """
        # Standard language support across most providers
        return [
            "en",  # English
            "es",  # Spanish
            "fr",  # French
            "de",  # German
            "it",  # Italian
            "pt",  # Portuguese
            "nl",  # Dutch
            "ja",  # Japanese
            "zh",  # Chinese
            "ko",  # Korean
            "ru",  # Russian
            "ar",  # Arabic
            "hi",  # Hindi
            "tr",  # Turkish
            "pl",  # Polish
            "uk",  # Ukrainian
            "vi",  # Vietnamese
        ]
