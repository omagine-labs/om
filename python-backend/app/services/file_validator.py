"""
File validation service for uploaded media files.

Validates file type using magic numbers (file signatures) to prevent
malicious or invalid files from being processed.
"""

import logging
from pathlib import Path
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

# Maximum file size in bytes (1 GB) - matches frontend and Supabase limits
MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024

# Minimum file size in bytes (100 KB - too small likely corrupted)
MIN_FILE_SIZE_BYTES = 100 * 1024

# File type signatures (magic numbers)
# Format: (signature bytes, offset, description)
VALID_SIGNATURES = [
    # Video formats
    (b"\x00\x00\x00\x14\x66\x74\x79\x70", 0, "MP4/M4V"),
    (b"\x00\x00\x00\x18\x66\x74\x79\x70", 0, "MP4/M4V"),
    (b"\x00\x00\x00\x1c\x66\x74\x79\x70", 0, "MP4/M4V"),
    (b"\x00\x00\x00\x20\x66\x74\x79\x70", 0, "MP4/M4V"),
    (b"\x66\x74\x79\x70\x69\x73\x6f\x6d", 4, "MP4/ISOM"),
    (b"\x66\x74\x79\x70\x6d\x70\x34\x32", 4, "MP4"),
    (b"\x66\x74\x79\x70\x4d\x53\x4e\x56", 4, "MP4/MSNV"),
    (b"\x66\x74\x79\x70\x6d\x70\x34\x31", 4, "MP4"),
    (b"\x66\x74\x79\x70\x4d\x34\x56\x20", 4, "MP4/M4V"),
    (b"\x66\x74\x79\x70\x71\x74\x20\x20", 4, "MOV/QuickTime"),
    (b"\x1a\x45\xdf\xa3", 0, "WebM/MKV"),
    (b"RIFF", 0, "AVI/WAV"),
    # Audio formats
    (b"\xff\xfb", 0, "MP3"),
    (b"\xff\xf3", 0, "MP3"),
    (b"\xff\xf2", 0, "MP3"),
    (b"ID3", 0, "MP3 with ID3"),
    (b"fLaC", 0, "FLAC"),
    (b"OggS", 0, "OGG"),
    (b"\x4d\x34\x41\x20", 0, "M4A"),
]


class FileValidationError(Exception):
    """Raised when file validation fails."""

    def __init__(self, message: str, user_friendly_message: str):
        """
        Initialize validation error.

        Args:
            message: Technical error message for logging
            user_friendly_message: User-facing error message
        """
        self.user_friendly_message = user_friendly_message
        super().__init__(message)


def validate_file(file_path: Path) -> Tuple[bool, Optional[str]]:
    """
    Validate uploaded file using magic numbers and size checks.

    Args:
        file_path: Path to the file to validate

    Returns:
        Tuple of (is_valid, error_message)

    Raises:
        FileValidationError: If validation fails with user-friendly message
    """
    logger.info(f"Validating file: {file_path}")

    # Check if file exists
    if not file_path.exists():
        raise FileValidationError(
            f"File not found: {file_path}",
            "The uploaded file could not be found. Please try uploading again.",
        )

    # Check file size
    file_size = file_path.stat().st_size
    logger.info(f"File size: {file_size / (1024 * 1024):.2f} MB")

    if file_size < MIN_FILE_SIZE_BYTES:
        raise FileValidationError(
            f"File too small: {file_size} bytes (min: {MIN_FILE_SIZE_BYTES})",
            "The uploaded file is too small (less than 100 KB). "
            "Please ensure you're uploading a complete meeting recording.",
        )

    if file_size > MAX_FILE_SIZE_BYTES:
        raise FileValidationError(
            f"File too large: {file_size} bytes (max: {MAX_FILE_SIZE_BYTES})",
            "The uploaded file is too large (over 1 GB). "
            "Please compress your video or upload a shorter recording.",
        )

    # Check magic numbers (file signature)
    try:
        with open(file_path, "rb") as f:
            # Read first 32 bytes for signature checking
            file_header = f.read(32)

            # Check against known valid signatures
            for signature, offset, description in VALID_SIGNATURES:
                if len(file_header) >= offset + len(signature):
                    if file_header[offset : offset + len(signature)] == signature:
                        logger.info(f"✓ Valid file type detected: {description}")
                        return True, None

            # Special case for AVI files (need to check RIFF + AVI)
            if file_header.startswith(b"RIFF") and len(file_header) >= 12:
                # Check if it's AVI (not WAV)
                if file_header[8:11] == b"AVI":
                    logger.info("✓ Valid file type detected: AVI")
                    return True, None
                elif file_header[8:12] == b"WAVE":
                    logger.info("✓ Valid file type detected: WAV")
                    return True, None

            # If we reach here, no valid signature was found
            file_header_hex = file_header[:16].hex()
            raise FileValidationError(
                f"Invalid file type. Magic number: {file_header_hex}",
                "The uploaded file is not a supported video or audio format. "
                "Please upload an MP4, MOV, WebM, AVI, MP3, or WAV file.",
            )

    except FileValidationError:
        # Re-raise validation errors
        raise
    except Exception as e:
        logger.error(f"Error reading file for validation: {e}", exc_info=True)
        raise FileValidationError(
            f"Failed to read file for validation: {str(e)}",
            "There was an error reading your file. Please ensure it's not corrupted and try again.",
        )


def validate_duration(
    duration_seconds: int, min_duration: int = 600, max_duration: int = 7200
) -> None:
    """
    Validate meeting duration is within acceptable range.

    Args:
        duration_seconds: Meeting duration in seconds
        min_duration: Minimum allowed duration (default: 600 = 10 minutes)
        max_duration: Maximum allowed duration (default: 7200 = 2 hours)

    Raises:
        FileValidationError: If duration is outside acceptable range
    """
    logger.info(f"Validating duration: {duration_seconds}s")

    if duration_seconds < min_duration:
        minutes = min_duration // 60
        raise FileValidationError(
            f"Duration too short: {duration_seconds}s (min: {min_duration}s)",
            f"The recording is too short (less than {minutes} minutes). Please upload a longer meeting recording.",
        )

    if duration_seconds > max_duration:
        hours = max_duration // 3600
        raise FileValidationError(
            f"Duration too long: {duration_seconds}s (max: {max_duration}s)",
            f"The recording is too long (over {hours} hours). "
            f"Please upload a shorter recording or split it into multiple files.",
        )

    logger.info(f"✓ Duration is valid: {duration_seconds}s")


def validate_speech_content(segments: list) -> None:
    """
    Validate that the recording contains sufficient speech content.

    Args:
        segments: List of transcript segments from transcription

    Raises:
        FileValidationError: If insufficient speech detected
    """
    if not segments or len(segments) == 0:
        raise FileValidationError(
            "No speech detected in recording",
            "No speech was detected in your recording. Please ensure the audio is clear and contains spoken content.",
        )

    # Count total characters in transcript
    total_chars = sum(len(seg.get("text", "")) for seg in segments)

    if total_chars < 100:
        raise FileValidationError(
            f"Insufficient speech content: {total_chars} characters",
            "Very little speech was detected in your recording. "
            "Please ensure the audio quality is good and contains substantial conversation.",
        )

    logger.info(
        f"✓ Speech content is valid: {len(segments)} segments, {total_chars} characters"
    )
