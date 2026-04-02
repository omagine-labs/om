"""
AssemblyAI Transcription Provider

Provides transcription and speaker diarization using AssemblyAI API.
"""

import logging
import asyncio
from pathlib import Path
from typing import Optional, Any, List, Dict
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import assemblyai as aai

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionSegment:
    """A segment of transcription with timing and speaker information."""

    start: float  # Start time in seconds
    end: float  # End time in seconds
    text: str  # Transcribed text
    speaker: str  # Speaker label (e.g., "SPEAKER_A", "SPEAKER_00")
    confidence: Optional[float] = None  # Confidence score 0-1
    words: Optional[List[Dict[str, Any]]] = None  # Word-level timestamps


@dataclass
class TranscriptionResult:
    """Result from transcription with diarization."""

    text: str  # Full transcript
    segments: List[TranscriptionSegment]  # Segments with speakers
    speakers: List[str]  # List of detected speakers
    language: str  # Detected/specified language
    duration: float  # Audio duration in seconds
    num_speakers: int  # Number of detected speakers


class AssemblyAIProvider:
    """
    AssemblyAI transcription provider.

    Features:
    - Transcription with word-level timestamps
    - Automatic speaker diarization
    - Language detection
    - High accuracy
    """

    def __init__(self, api_key: str):
        """
        Initialize AssemblyAI provider with extended timeouts for large file uploads.

        Args:
            api_key: AssemblyAI API key
        """
        self.api_key = api_key
        aai.settings.api_key = api_key

        # Configure extended HTTP timeout for large file uploads
        # Default timeout is 30s which is too short for 25MB+ file uploads
        # Set to 5 minutes (300 seconds) to allow for large file uploads
        aai.settings.http_timeout = 300.0  # 5 minutes in seconds

        logger.info(
            "AssemblyAI provider initialized with 300s HTTP timeout for large file uploads"
        )

    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        enable_diarization: bool = True,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
        is_priority: bool = False,
    ) -> TranscriptionResult:
        """
        Transcribe audio using AssemblyAI.

        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'es') or None for auto-detect
            enable_diarization: Whether to perform speaker diarization
            min_speakers: Minimum number of speakers
            max_speakers: Maximum number of speakers
            is_priority: If True, use faster polling (5s vs 10s)

        Returns:
            TranscriptionResult with transcript and speaker information
        """
        # Set polling interval based on priority
        polling_interval = 5 if is_priority else 10

        logger.info(f"Starting AssemblyAI transcription for: {audio_path}")
        if is_priority:
            logger.info(
                f"Priority processing enabled - polling every {polling_interval}s"
            )

        try:
            # Configure transcription settings
            config = aai.TranscriptionConfig(
                speaker_labels=enable_diarization,
                language_code=language if language else None,
            )

            # Create transcriber (will use extended timeouts configured in __init__)
            transcriber = aai.Transcriber()

            # Submit transcription job (non-blocking) with retry logic
            logger.info("Uploading audio to AssemblyAI...")

            loop = asyncio.get_event_loop()

            # Retry upload up to 3 times with exponential backoff
            max_retries = 3
            retry_delay = 5  # Start with 5 seconds

            for attempt in range(max_retries):
                try:
                    with ThreadPoolExecutor() as executor:
                        # Submit the job (returns immediately with transcript object in queued state)
                        transcript = await loop.run_in_executor(
                            executor,
                            lambda: transcriber.submit(str(audio_path), config=config),
                        )
                    # Success - break out of retry loop
                    break
                except Exception as e:
                    error_msg = str(e)

                    if attempt < max_retries - 1:
                        logger.warning(
                            f"Upload attempt {attempt + 1}/{max_retries} failed: {error_msg}. "
                            f"Retrying in {retry_delay} seconds..."
                        )
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    else:
                        # Final attempt failed
                        logger.error(
                            f"Upload failed after {max_retries} attempts: {error_msg}"
                        )
                        raise Exception(
                            f"Failed to upload audio to AssemblyAI after {max_retries} attempts: {error_msg}"
                        )

            logger.info(f"Transcription job submitted. ID: {transcript.id}")
            logger.info(f"Polling for completion every {polling_interval} seconds...")

            # Custom polling loop with configurable interval
            transcript_id = transcript.id
            while True:
                # Get current status (non-blocking call in executor)
                with ThreadPoolExecutor() as executor:
                    transcript = await loop.run_in_executor(
                        executor,
                        lambda: aai.Transcript.get_by_id(transcript_id),
                    )

                if transcript.status == aai.TranscriptStatus.completed:
                    logger.info("AssemblyAI transcription completed successfully")
                    break
                elif transcript.status == aai.TranscriptStatus.error:
                    raise Exception(
                        f"AssemblyAI transcription failed: {transcript.error}"
                    )

                # Wait before next poll
                await asyncio.sleep(polling_interval)

            # Parse results
            return self._parse_transcript(transcript)

        except Exception as e:
            logger.error(f"AssemblyAI transcription error: {str(e)}")
            raise Exception(f"AssemblyAI transcription failed: {str(e)}")

    def _parse_transcript(self, transcript: Any) -> TranscriptionResult:
        """
        Parse AssemblyAI transcript into TranscriptionResult format.

        Args:
            transcript: AssemblyAI Transcript object

        Returns:
            TranscriptionResult with parsed data
        """
        # Extract full text
        full_text = transcript.text or ""

        # Parse segments with speaker labels
        segments = []
        speakers_set = set()

        if transcript.utterances:
            # Use utterances (already grouped by speaker)
            for utterance in transcript.utterances:
                # Convert speaker number to letter (0 -> A, 1 -> B, etc.)
                speaker_letter = (
                    chr(65 + int(utterance.speaker))
                    if isinstance(utterance.speaker, (int, str))
                    and str(utterance.speaker).isdigit()
                    else utterance.speaker
                )
                speaker_label = f"Speaker {speaker_letter}"
                speakers_set.add(speaker_label)

                # Extract words for this utterance
                words = []
                if utterance.words:
                    words = [
                        {
                            "word": word.text,
                            "start": word.start / 1000.0,  # Convert ms to seconds
                            "end": word.end / 1000.0,
                            "confidence": word.confidence,
                        }
                        for word in utterance.words
                    ]

                segments.append(
                    TranscriptionSegment(
                        start=utterance.start / 1000.0,  # Convert ms to seconds
                        end=utterance.end / 1000.0,
                        text=utterance.text,
                        speaker=speaker_label,
                        confidence=utterance.confidence,
                        words=words,
                    )
                )
        else:
            # Fallback: Use words if utterances not available
            if transcript.words:
                current_segment = None
                for word in transcript.words:
                    # Convert speaker number to letter (0 -> A, 1 -> B, etc.)
                    if hasattr(word, "speaker") and word.speaker:
                        speaker_letter = (
                            chr(65 + int(word.speaker))
                            if isinstance(word.speaker, (int, str))
                            and str(word.speaker).isdigit()
                            else word.speaker
                        )
                        speaker_label = f"Speaker {speaker_letter}"
                    else:
                        speaker_label = "Speaker A"
                    speakers_set.add(speaker_label)

                    # Group consecutive words by same speaker
                    if (
                        current_segment is None
                        or current_segment.speaker != speaker_label
                    ):
                        if current_segment:
                            segments.append(current_segment)
                        current_segment = TranscriptionSegment(
                            start=word.start / 1000.0,
                            end=word.end / 1000.0,
                            text=word.text,
                            speaker=speaker_label,
                            confidence=word.confidence,
                            words=[
                                {
                                    "word": word.text,
                                    "start": word.start / 1000.0,
                                    "end": word.end / 1000.0,
                                    "confidence": word.confidence,
                                }
                            ],
                        )
                    else:
                        # Extend current segment
                        current_segment.end = word.end / 1000.0
                        current_segment.text += f" {word.text}"
                        current_segment.words.append(
                            {
                                "word": word.text,
                                "start": word.start / 1000.0,
                                "end": word.end / 1000.0,
                                "confidence": word.confidence,
                            }
                        )

                if current_segment:
                    segments.append(current_segment)

        # Get audio duration (in seconds)
        duration = transcript.audio_duration or 0.0

        # Get detected language (handle different attribute names)
        language = (
            getattr(transcript, "language_code", None)
            or getattr(transcript, "language", None)
            or "en"
        )

        return TranscriptionResult(
            text=full_text,
            segments=[seg.__dict__ for seg in segments],  # Convert to dicts
            speakers=sorted(list(speakers_set)),
            language=language,
            duration=duration,
            num_speakers=len(speakers_set),
        )
