"""Health check endpoints."""

from fastapi import APIRouter
import subprocess
import sys

router = APIRouter()


@router.get("/health")
async def health_check():
    """Check if the service is healthy."""

    # Check if ffmpeg is available
    ffmpeg_available = False
    try:
        subprocess.run(
            ["ffmpeg", "-version"], capture_output=True, check=True, timeout=5
        )
        ffmpeg_available = True
    except (
        subprocess.CalledProcessError,
        FileNotFoundError,
        subprocess.TimeoutExpired,
    ):
        pass

    return {
        "status": "healthy",
        "python_version": sys.version,
        "ffmpeg_available": ffmpeg_available,
    }
