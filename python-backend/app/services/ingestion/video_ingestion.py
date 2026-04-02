"""
Video ingestion service for extracting audio from video files.

This service handles video-specific processing by extracting audio tracks
from video files using ffmpeg.
"""

import sys
import logging
import asyncio
from pathlib import Path

logger = logging.getLogger(__name__)


class VideoIngestion:
    """Handles extracting audio from video files."""

    async def _detect_audio_streams(self, job_id: str, video_file: Path) -> int:
        """
        Detect the number of audio streams in a video file using ffprobe.

        Args:
            job_id: The job identifier for logging
            video_file: Path to the video file

        Returns:
            Number of audio streams detected (0 if none)
        """
        command = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(video_file),
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.warning(
                    f"[Job {job_id}] ffprobe failed, assuming single audio stream"
                )
                return 1

            # Count non-empty lines in output
            output_lines = stdout.decode().strip().split("\n")
            audio_streams = len([line for line in output_lines if line])
            logger.info(
                f"[Job {job_id}] Detected {audio_streams} audio stream(s) in video"
            )
            return audio_streams

        except Exception as e:
            msg = f"[Job {job_id}] Error detecting audio streams: {e}"
            logger.warning(f"{msg}, assuming single stream")
            return 1

    async def extract_audio(self, job_id: str, video_file: Path) -> Path:
        """
        Extract audio from video file using ffmpeg.

        Args:
            job_id: The job identifier for logging
            video_file: Path to the video file

        Returns:
            Path to the extracted audio file (MP3)

        Raises:
            Exception: If audio extraction fails
        """
        logger.info(f"[Job {job_id}] Extracting audio from video...")
        sys.stdout.flush()

        # Create output audio file path (same directory, .mp3 extension)
        audio_file = video_file.with_suffix(".mp3")

        try:
            # Detect number of audio streams
            num_audio_streams = await self._detect_audio_streams(job_id, video_file)

            # Build ffmpeg command based on number of audio streams
            # -i: input file
            # -vn: disable video (only extract audio)
            # -acodec libmp3lame: use MP3 codec
            # -q:a 2: audio quality (0-9, 2 is high quality)
            # -y: overwrite output file if exists
            command = ["ffmpeg", "-i", str(video_file), "-vn"]

            if num_audio_streams == 0:
                logger.error(f"[Job {job_id}] No audio streams found in video")
                raise Exception("No audio streams found in video file")
            elif num_audio_streams == 1:
                # Single audio stream - simple extraction
                msg = "Single audio stream detected, using simple extraction"
                logger.info(f"[Job {job_id}] {msg}")
                command.extend(["-acodec", "libmp3lame", "-q:a", "2"])
                command.extend(["-y", str(audio_file)])
            else:
                # Multiple audio streams - merge them
                msg = f"{num_audio_streams} audio streams detected, merging"
                logger.info(f"[Job {job_id}] {msg}")
                command.extend(
                    [
                        "-filter_complex",
                        f"amerge=inputs={num_audio_streams}",
                        "-ac",
                        "2",  # Output stereo
                        "-acodec",
                        "libmp3lame",
                        "-q:a",
                        "2",
                        "-y",
                        str(audio_file),
                    ]
                )

            cmd_str = " ".join(command)
            logger.info(f"[Job {job_id}] Running ffmpeg command: {cmd_str}")
            sys.stdout.flush()

            # Run ffmpeg in subprocess
            process = await asyncio.create_subprocess_exec(
                *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown ffmpeg error"
                logger.error(f"[Job {job_id}] FFmpeg error: {error_msg}")
                sys.stdout.flush()
                raise Exception(f"Audio extraction failed: {error_msg}")

            # Verify audio file was created
            if not audio_file.exists():
                raise Exception("Audio file was not created by ffmpeg")

            audio_size_mb = audio_file.stat().st_size / (1024 * 1024)
            logger.info(
                f"[Job {job_id}] Audio extracted successfully: {audio_size_mb:.2f} MB"
            )
            sys.stdout.flush()

            return audio_file

        except FileNotFoundError:
            logger.error(
                f"[Job {job_id}] ffmpeg not found. Ensure ffmpeg is installed."
            )
            sys.stdout.flush()
            raise Exception(
                "ffmpeg not found. Please install ffmpeg to process video files."
            )
        except Exception as e:
            logger.error(f"[Job {job_id}] Audio extraction error: {str(e)}")
            sys.stdout.flush()
            # Clean up partial audio file if exists
            if audio_file.exists():
                audio_file.unlink()
            raise
