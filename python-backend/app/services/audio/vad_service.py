"""
Voice Activity Detection (VAD) service for detecting speech in microphone audio.

Uses webrtcvad for lightweight, battle-tested speech detection.
Now uses streaming to avoid creating large intermediate WAV files in memory.
"""

import webrtcvad
import asyncio
import logging
from pathlib import Path
from typing import List, Dict
import sentry_sdk

logger = logging.getLogger(__name__)

# VAD constants
FRAME_DURATION_MS = 30  # webrtcvad supports 10, 20, 30 ms frames
SAMPLE_RATE = 16000  # webrtcvad requires 8kHz, 16kHz, 32kHz, or 48kHz
MIN_SPEECH_DURATION_SECONDS = 0.5  # Minimum speech chunk to avoid noise

# Streaming constants
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)  # samples per frame
FRAME_BYTES = FRAME_SIZE * 2  # 2 bytes per sample (16-bit PCM)


class VADService:
    """
    Voice Activity Detection service for identifying when user is speaking.

    Uses streaming to process audio without creating large intermediate files,
    which is critical for Cloud Run's memory-constrained environment where
    /tmp is backed by RAM.
    """

    def __init__(self, aggressiveness: int = 2):
        """
        Initialize VAD service.

        Args:
            aggressiveness: VAD aggressiveness mode (0-3)
                           0 = least aggressive (more false positives)
                           3 = most aggressive (fewer false positives)
                           Default: 2 (balanced)
        """
        self.vad = webrtcvad.Vad(aggressiveness)
        logger.info(f"VADService initialized with aggressiveness={aggressiveness}")

    async def detect_speech(self, audio_path: str) -> List[Dict[str, float]]:
        """
        Detect speech timestamps in microphone audio using streaming.

        This method streams audio directly through ffmpeg without creating
        intermediate WAV files, which saves ~125MB of RAM for a 1-hour recording.

        Args:
            audio_path: Path to microphone-only audio file

        Returns:
            List of speech segments with start and end timestamps
            Example: [{"start": 0.5, "end": 3.2}, {"start": 5.1, "end": 8.9}]

        Raises:
            FileNotFoundError: If audio file doesn't exist
            RuntimeError: If VAD processing fails
        """
        # Start Sentry performance monitoring
        with sentry_sdk.start_span(
            op="vad.detect_speech",
            description=f"Voice Activity Detection on {Path(audio_path).name}",
        ) as span:
            audio_path_obj = Path(audio_path)

            if not audio_path_obj.exists():
                sentry_sdk.add_breadcrumb(
                    category="vad",
                    message=f"Audio file not found: {audio_path}",
                    level="error",
                )
                raise FileNotFoundError(f"Audio file not found: {audio_path}")

            logger.info(f"Running streaming VAD on {audio_path}")
            sentry_sdk.add_breadcrumb(
                category="vad",
                message=f"Starting streaming VAD processing for {audio_path_obj.name}",
                level="info",
                data={"file_size_bytes": audio_path_obj.stat().st_size},
            )

            try:
                # Process audio with streaming VAD (no intermediate WAV file)
                with sentry_sdk.start_span(
                    op="vad.stream_process",
                    description="Stream process audio with ffmpeg + VAD",
                ):
                    speech_segments = await self._stream_process_audio(audio_path_obj)

                # Filter out short segments (noise)
                filtered_segments = [
                    seg
                    for seg in speech_segments
                    if (seg["end"] - seg["start"]) >= MIN_SPEECH_DURATION_SECONDS
                ]

                logger.info(
                    f"VAD detected {len(filtered_segments)} speech segments "
                    f"(filtered from {len(speech_segments)} raw segments)"
                )

                # Add success metrics to Sentry
                span.set_data("raw_segments_count", len(speech_segments))
                span.set_data("filtered_segments_count", len(filtered_segments))
                span.set_data(
                    "total_speech_duration",
                    sum(seg["end"] - seg["start"] for seg in filtered_segments),
                )

                sentry_sdk.add_breadcrumb(
                    category="vad",
                    message=f"VAD completed: {len(filtered_segments)} segments detected",
                    level="info",
                    data={
                        "raw_segments": len(speech_segments),
                        "filtered_segments": len(filtered_segments),
                    },
                )

                return filtered_segments

            except Exception as e:
                logger.error(f"VAD processing failed: {str(e)}")
                # Add error context to Sentry
                sentry_sdk.set_context(
                    "vad_error",
                    {
                        "audio_path": str(audio_path),
                        "file_exists": audio_path_obj.exists(),
                        "error_type": type(e).__name__,
                    },
                )
                sentry_sdk.add_breadcrumb(
                    category="vad",
                    message=f"VAD processing failed: {str(e)}",
                    level="error",
                )
                raise RuntimeError(f"Failed to detect speech: {str(e)}") from e

    async def _stream_process_audio(self, audio_path: Path) -> List[Dict[str, float]]:
        """
        Stream audio through ffmpeg and process with VAD without creating
        intermediate files.

        This is critical for Cloud Run where /tmp is backed by RAM. For a 1-hour
        MP3 file (~62MB), ffmpeg would create a ~125MB WAV file. By streaming,
        we only keep one 30ms frame in memory at a time (~960 bytes).

        Args:
            audio_path: Path to audio file (any format ffmpeg supports)

        Returns:
            List of speech segments with start/end timestamps
        """
        # Use ffmpeg to decode audio and output raw PCM to stdout
        # -f s16le: raw signed 16-bit little-endian PCM
        # -acodec pcm_s16le: output codec
        # -ar 16000: resample to 16kHz
        # -ac 1: convert to mono
        # pipe:1: output to stdout
        cmd = [
            "ffmpeg",
            "-i",
            str(audio_path),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "1",
            "-loglevel",
            "error",
            "pipe:1",
        ]

        logger.debug(f"Starting ffmpeg streaming: {' '.join(cmd)}")

        # Start ffmpeg process
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        segments = []
        segment_start = None
        frame_index = 0
        frame_duration = FRAME_DURATION_MS / 1000.0
        buffer = b""

        try:
            # Read and process audio in streaming fashion
            while True:
                # Read a chunk from ffmpeg stdout
                # Use a larger read buffer for efficiency, then process frame by frame
                chunk = await process.stdout.read(FRAME_BYTES * 100)

                if not chunk:
                    break

                # Add to buffer and process complete frames
                buffer += chunk

                while len(buffer) >= FRAME_BYTES:
                    # Extract one frame
                    frame = buffer[:FRAME_BYTES]
                    buffer = buffer[FRAME_BYTES:]

                    # Run VAD on this frame
                    is_speech = self.vad.is_speech(frame, SAMPLE_RATE)
                    timestamp = frame_index * frame_duration

                    # Build segments incrementally
                    if is_speech:
                        if segment_start is None:
                            segment_start = timestamp
                    else:
                        if segment_start is not None:
                            segments.append({"start": segment_start, "end": timestamp})
                            segment_start = None

                    frame_index += 1

            # Close last segment if still open
            if segment_start is not None:
                segment_end = frame_index * frame_duration
                segments.append({"start": segment_start, "end": segment_end})

            # Wait for process to complete
            await process.wait()

            # Check for ffmpeg errors
            if process.returncode != 0:
                stderr = await process.stderr.read()
                error_msg = stderr.decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"ffmpeg failed with code {process.returncode}: {error_msg}"
                )

            logger.debug(
                f"Streaming VAD processed {frame_index} frames "
                f"({frame_index * frame_duration:.1f}s of audio)"
            )

            return segments

        except Exception as e:
            # Kill ffmpeg process if still running
            if process.returncode is None:
                process.kill()
                await process.wait()
            raise e
