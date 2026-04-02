"""
Video stitcher service for exporting BlindSlide game recordings.

Combines slides with audio (and optionally selfie video) into a single
downloadable MP4 video using FFmpeg.
"""

import asyncio
import aiofiles
import httpx
import logging
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from PIL import Image

from app.services.supabase_client import SupabaseClient

logger = logging.getLogger(__name__)

# Timing constants (must match frontend)
COUNTDOWN_SECONDS = 5
SLIDE_DURATION_SECONDS = 20
NUM_SLIDES = 10

# FFmpeg encoding settings
VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720  # Standard 720p HD
VIDEO_FPS = 24  # 24fps for smooth motion (especially for selfie video)
VIDEO_CRF = "26"  # Quality-based encoding (0-51, lower=better, 26 is good balance)
VIDEO_CRF_SLIDES = "32"  # Lower quality OK for audio-only slideshow mode
AUDIO_BITRATE = "128k"

# PIP settings for selfie overlay
PIP_WIDTH = 420  # Width of selfie overlay (scaled for 720p)
PIP_MARGIN = 18  # Margin from edge

# Font for drawtext overlay (Fraunces matches the UI countdown)
FONT_PATH = (
    Path(__file__).parent.parent.parent
    / "resources"
    / "fonts"
    / "Fraunces-Variable.ttf"
)


class VideoStitcherError(Exception):
    """Error during video stitching"""

    pass


class VideoStitcher:
    """
    Service for creating exportable videos from game recordings.

    Supports two modes:
    - audio_only: Creates slideshow with audio overlay
    - selfie_video: Creates PIP with slides full-screen and selfie in corner
    """

    def __init__(self):
        self.supabase = SupabaseClient()

    async def export_game(
        self,
        game_id: str,
        slide_ids: list[str],
        audio_storage_path: str,
        video_storage_path: Optional[str] = None,
        recording_mode: str = "audio_only",
        topic_name: Optional[str] = None,
    ) -> str:
        """
        Export a game recording to a downloadable video.

        Args:
            game_id: The game ID
            slide_ids: List of slide IDs in order
            audio_storage_path: Path to audio file in storage
            video_storage_path: Path to selfie video in storage (optional)
            recording_mode: 'audio_only' or 'selfie_video'
            topic_name: Name of the topic to show during countdown (optional)

        Returns:
            Signed URL for downloading the exported video

        Raises:
            VideoStitcherError: If export fails
        """
        temp_dir = None
        try:
            # Create temp directory for this export
            temp_dir = Path(tempfile.mkdtemp(prefix=f"export_{game_id}_"))
            logger.info(f"[Export {game_id}] Starting export in {temp_dir}")

            # Download all assets
            slides_dir = temp_dir / "slides"
            slides_dir.mkdir()

            # Download slides concurrently
            slide_paths = await self._download_slides(slide_ids, slides_dir)

            # Pre-scale images to target resolution (dramatically speeds up FFmpeg)
            slide_paths = await self._prescale_images(slide_paths)

            # Download audio
            audio_path = temp_dir / "audio.webm"
            await self.supabase.download_file(
                bucket="recordings",
                path=audio_storage_path,
                destination=audio_path,
            )

            # Download selfie video if applicable
            selfie_path = None
            if recording_mode == "selfie_video" and video_storage_path:
                selfie_path = temp_dir / "selfie.webm"
                await self.supabase.download_file(
                    bucket="recordings",
                    path=video_storage_path,
                    destination=selfie_path,
                )

            # Generate the stitched video
            output_path = temp_dir / f"export_{game_id}.mp4"

            if recording_mode == "selfie_video" and selfie_path:
                await self._create_pip_video(
                    slide_paths=slide_paths,
                    audio_path=audio_path,
                    selfie_path=selfie_path,
                    output_path=output_path,
                    topic_name=topic_name,
                )
            else:
                await self._create_slideshow_video(
                    slide_paths=slide_paths,
                    audio_path=audio_path,
                    output_path=output_path,
                    topic_name=topic_name,
                )

            # Upload to exports bucket (create if needed)
            export_storage_path = await self._upload_export(game_id, output_path)

            # Generate signed URL (24 hour expiry)
            signed_url = await self._get_signed_url(export_storage_path)

            logger.info(f"[Export {game_id}] Export completed successfully")
            return signed_url

        except Exception as e:
            logger.error(f"[Export {game_id}] Export failed: {e}", exc_info=True)
            raise VideoStitcherError(f"Failed to export video: {e}") from e

        finally:
            # Cleanup temp directory
            if temp_dir and temp_dir.exists():
                try:
                    import shutil

                    shutil.rmtree(temp_dir)
                    logger.info(f"[Export {game_id}] Cleaned up temp directory")
                except Exception as e:
                    logger.warning(f"[Export {game_id}] Cleanup failed: {e}")

    async def _download_slides(
        self, slide_ids: list[str], output_dir: Path
    ) -> list[Path]:
        """
        Download slide images from storage.

        Returns ordered list of slide file paths.
        """
        # Fetch slide URLs from database
        timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{self.supabase.url}/rest/v1/slides",
                params={
                    "id": f"in.({','.join(slide_ids)})",
                    "select": "id,image_url",
                },
                headers=self.supabase.headers,
            )
            response.raise_for_status()
            slides_data = response.json()

        # Create lookup map
        slide_map = {s["id"]: s["image_url"] for s in slides_data}

        # Download slides in order
        slide_paths = []
        for i, slide_id in enumerate(slide_ids):
            storage_path = slide_map.get(slide_id)
            if not storage_path:
                raise VideoStitcherError(f"Slide {slide_id} not found")

            # Construct full URL for Supabase storage
            # If it's already a full URL, use as-is; otherwise construct storage URL
            if storage_path.startswith("http"):
                image_url = storage_path
            else:
                image_url = f"{self.supabase.url}/storage/v1/object/public/slides/{storage_path}"

            # Download image
            slide_path = output_dir / f"slide_{i:02d}.jpg"
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                async with aiofiles.open(slide_path, "wb") as f:
                    await f.write(response.content)

            slide_paths.append(slide_path)

        logger.info(f"Downloaded {len(slide_paths)} slides")
        return slide_paths

    async def _prescale_images(self, slide_paths: list[Path]) -> list[Path]:
        """
        Pre-scale images to target resolution using PIL.

        This dramatically speeds up FFmpeg processing by avoiding heavy scaling
        in the filter_complex. Images are resized in-place (overwritten).

        Memory efficient: processes one image at a time.
        """
        scaled_paths = []

        for slide_path in slide_paths:
            # Run PIL operations in thread pool to not block async loop
            scaled_path = await asyncio.to_thread(self._scale_single_image, slide_path)
            scaled_paths.append(scaled_path)

        logger.info(
            f"Pre-scaled {len(scaled_paths)} images to {VIDEO_WIDTH}x{VIDEO_HEIGHT}"
        )
        return scaled_paths

    def _scale_single_image(self, image_path: Path) -> Path:
        """
        Scale a single image to target dimensions with letterboxing.

        Maintains aspect ratio and adds black bars if needed.
        Overwrites the original file to save disk space.
        """
        with Image.open(image_path) as img:
            # Convert to RGB if necessary (handles PNG with transparency, etc.)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # Calculate scaling to fit within target dimensions while maintaining aspect ratio
            img_ratio = img.width / img.height
            target_ratio = VIDEO_WIDTH / VIDEO_HEIGHT

            if img_ratio > target_ratio:
                # Image is wider - fit to width
                new_width = VIDEO_WIDTH
                new_height = int(VIDEO_WIDTH / img_ratio)
            else:
                # Image is taller - fit to height
                new_height = VIDEO_HEIGHT
                new_width = int(VIDEO_HEIGHT * img_ratio)

            # Resize with high-quality resampling
            resized = img.resize((new_width, new_height), Image.LANCZOS)

            # Create black canvas at target size
            canvas = Image.new("RGB", (VIDEO_WIDTH, VIDEO_HEIGHT), (0, 0, 0))

            # Paste resized image centered on canvas
            x_offset = (VIDEO_WIDTH - new_width) // 2
            y_offset = (VIDEO_HEIGHT - new_height) // 2
            canvas.paste(resized, (x_offset, y_offset))

            # Save back to same path (overwrite) as JPEG with good quality
            output_path = image_path.with_suffix(".jpg")
            canvas.save(output_path, "JPEG", quality=85)

            return output_path

    async def _create_slideshow_video(
        self,
        slide_paths: list[Path],
        audio_path: Path,
        output_path: Path,
        topic_name: Optional[str] = None,
    ) -> None:
        """
        Create a slideshow video with slides, audio, and countdown overlay.

        Uses single FFmpeg command with filter_complex for optimal performance.

        Timeline:
        - 0-5s: First slide with countdown overlay (topic name + 5,4,3,2,1)
        - 5-25s: First slide presentation
        - 25-45s: Second slide presentation
        - etc.
        """
        # Build FFmpeg command with all slide inputs
        cmd = ["ffmpeg", "-y"]

        # Add each slide as a looped input with its duration
        for i, slide_path in enumerate(slide_paths):
            if i == 0:
                duration = COUNTDOWN_SECONDS + SLIDE_DURATION_SECONDS
            else:
                duration = SLIDE_DURATION_SECONDS

            cmd.extend(
                [
                    "-loop",
                    "1",
                    "-t",
                    str(duration),
                    "-i",
                    str(slide_path),
                ]
            )

        # Add audio input
        cmd.extend(["-i", str(audio_path)])

        # Build filter_complex
        filter_parts = []
        concat_inputs = []

        # Images are pre-scaled, so just normalize format for concat compatibility
        for i in range(len(slide_paths)):
            filter_parts.append(f"[{i}:v]setsar=1,fps={VIDEO_FPS},format=yuv420p[v{i}]")
            concat_inputs.append(f"[v{i}]")

        # Concat all video streams
        filter_parts.append(
            f"{''.join(concat_inputs)}concat=n={len(slide_paths)}:v=1:a=0[slideshow]"
        )

        # Add countdown overlay if topic name provided
        if topic_name:
            # Escape special characters for FFmpeg drawtext
            escaped_topic = topic_name.replace("'", "'\\''").replace(":", "\\:")

            # Calculate positions based on known output dimensions
            box_y = (VIDEO_HEIGHT // 2) - 100
            text_y_topic = (VIDEO_HEIGHT // 2) - 60
            text_y_countdown = (VIDEO_HEIGHT // 2) + 10

            # Add semi-transparent background for better text visibility
            filter_parts.append(
                f"[slideshow]drawbox=x=0:y={box_y}:w={VIDEO_WIDTH}:h=200:"
                f"color=black@0.5:t=fill:enable='lt(t,{COUNTDOWN_SECONDS})'[bg]"
            )

            # Add topic name text (centered, above countdown number)
            filter_parts.append(
                f"[bg]drawtext=fontfile={FONT_PATH}:text='{escaped_topic}':"
                f"fontsize=54:fontcolor=white:"
                f"x=(w-text_w)/2:y={text_y_topic}:"
                f"enable='lt(t,{COUNTDOWN_SECONDS})'[t1]"
            )

            # Add countdown number (5, 4, 3, 2, 1) - changes each second
            filter_parts.append(
                f"[t1]drawtext=fontfile={FONT_PATH}:text='%{{eif\\:{COUNTDOWN_SECONDS}-floor(t)\\:d}}':"
                f"fontsize=144:fontcolor=white:"
                f"x=(w-text_w)/2:y={text_y_countdown}:"
                f"enable='lt(t,{COUNTDOWN_SECONDS})'[vout]"
            )
            video_output = "[vout]"
        else:
            video_output = "[slideshow]"

        filter_complex = ";".join(filter_parts)

        # Add filter_complex and output options
        audio_input_idx = len(slide_paths)
        cmd.extend(
            [
                "-filter_complex",
                filter_complex,
                "-map",
                video_output,
                "-map",
                f"{audio_input_idx}:a",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-tune",
                "stillimage",  # Optimized for static content (slides only)
                "-crf",
                VIDEO_CRF_SLIDES,  # Lower quality OK for audio-only mode
                "-c:a",
                "aac",
                "-b:a",
                AUDIO_BITRATE,
                "-shortest",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )

        await self._run_ffmpeg(cmd)

    async def _create_pip_video(
        self,
        slide_paths: list[Path],
        audio_path: Path,
        selfie_path: Path,
        output_path: Path,
        topic_name: Optional[str] = None,
    ) -> None:
        """
        Create a picture-in-picture video with slides, selfie overlay, and countdown.

        Uses single FFmpeg command with filter_complex for optimal performance.

        Layout: Slides full-screen with selfie video in bottom-right corner.
        """
        # Build FFmpeg command with all inputs
        cmd = ["ffmpeg", "-y"]

        # Add each slide as a looped input with its duration
        for i, slide_path in enumerate(slide_paths):
            if i == 0:
                duration = COUNTDOWN_SECONDS + SLIDE_DURATION_SECONDS
            else:
                duration = SLIDE_DURATION_SECONDS

            cmd.extend(
                [
                    "-loop",
                    "1",
                    "-t",
                    str(duration),
                    "-i",
                    str(slide_path),
                ]
            )

        # Add selfie video input
        selfie_input_idx = len(slide_paths)
        cmd.extend(["-i", str(selfie_path)])

        # Add audio input
        audio_input_idx = selfie_input_idx + 1
        cmd.extend(["-i", str(audio_path)])

        # Build filter_complex
        filter_parts = []
        concat_inputs = []

        # Images are pre-scaled, so just normalize format for concat compatibility
        for i in range(len(slide_paths)):
            filter_parts.append(f"[{i}:v]setsar=1,fps={VIDEO_FPS},format=yuv420p[v{i}]")
            concat_inputs.append(f"[v{i}]")

        # Concat all slide streams
        filter_parts.append(
            f"{''.join(concat_inputs)}concat=n={len(slide_paths)}:v=1:a=0[slideshow]"
        )

        # Scale selfie video for PIP (normalize format to match slideshow)
        filter_parts.append(
            f"[{selfie_input_idx}:v]scale={PIP_WIDTH}:-1,setsar=1,format=yuv420p[pip]"
        )

        # Calculate PIP position (bottom-right with margin)
        pip_x = VIDEO_WIDTH - PIP_WIDTH - PIP_MARGIN
        pip_y = (
            VIDEO_HEIGHT - int(PIP_WIDTH * 9 / 16) - PIP_MARGIN
        )  # Assume 16:9 selfie

        # Overlay selfie on slideshow
        filter_parts.append(
            f"[slideshow][pip]overlay={pip_x}:{pip_y}:eof_action=pass[withpip]"
        )

        # Add countdown overlay if topic name provided
        if topic_name:
            # Escape special characters for FFmpeg drawtext
            escaped_topic = topic_name.replace("'", "'\\''").replace(":", "\\:")

            # Calculate positions based on known output dimensions
            box_y = (VIDEO_HEIGHT // 2) - 100
            text_y_topic = (VIDEO_HEIGHT // 2) - 60
            text_y_countdown = (VIDEO_HEIGHT // 2) + 10

            # Add semi-transparent background for better text visibility
            filter_parts.append(
                f"[withpip]drawbox=x=0:y={box_y}:w={VIDEO_WIDTH}:h=200:"
                f"color=black@0.5:t=fill:enable='lt(t,{COUNTDOWN_SECONDS})'[bg]"
            )

            # Add topic name text (centered, above countdown number)
            filter_parts.append(
                f"[bg]drawtext=fontfile={FONT_PATH}:text='{escaped_topic}':"
                f"fontsize=54:fontcolor=white:"
                f"x=(w-text_w)/2:y={text_y_topic}:"
                f"enable='lt(t,{COUNTDOWN_SECONDS})'[t1]"
            )

            # Add countdown number (5, 4, 3, 2, 1) - changes each second
            filter_parts.append(
                f"[t1]drawtext=fontfile={FONT_PATH}:text='%{{eif\\:{COUNTDOWN_SECONDS}-floor(t)\\:d}}':"
                f"fontsize=144:fontcolor=white:"
                f"x=(w-text_w)/2:y={text_y_countdown}:"
                f"enable='lt(t,{COUNTDOWN_SECONDS})'[vout]"
            )
            video_output = "[vout]"
        else:
            video_output = "[withpip]"

        filter_complex = ";".join(filter_parts)

        # Add filter_complex and output options
        cmd.extend(
            [
                "-filter_complex",
                filter_complex,
                "-map",
                video_output,
                "-map",
                f"{audio_input_idx}:a",
                "-c:v",
                "libx264",
                "-preset",
                "fast",  # Better quality than ultrafast, reasonable encoding time
                "-tune",
                "film",  # Optimized for video content with motion
                "-crf",
                VIDEO_CRF,  # Higher quality for selfie video mode
                "-c:a",
                "aac",
                "-b:a",
                AUDIO_BITRATE,
                "-shortest",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )

        await self._run_ffmpeg(cmd)

    async def _run_ffmpeg(self, cmd: list[str]) -> None:
        """Run FFmpeg command asynchronously."""
        logger.info(f"Running FFmpeg: {' '.join(cmd[:5])}...")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"FFmpeg failed: {error_msg}")
            raise VideoStitcherError(f"FFmpeg failed: {error_msg}")

        logger.info("FFmpeg completed successfully")

    async def _upload_export(self, game_id: str, video_path: Path) -> str:
        """
        Upload exported video to storage.

        Returns the storage path.
        """
        # Generate unique path for export
        date_prefix = datetime.utcnow().strftime("%Y/%m")
        export_id = str(uuid.uuid4())[:8]
        storage_path = f"exports/{date_prefix}/{game_id}_{export_id}.mp4"

        # Read video file
        async with aiofiles.open(video_path, "rb") as f:
            video_data = await f.read()

        # Upload to storage using SDK
        await asyncio.to_thread(
            self.supabase.client.storage.from_("recordings").upload,
            storage_path,
            video_data,
            file_options={"content-type": "video/mp4"},
        )

        logger.info(f"Uploaded export to {storage_path}")
        return storage_path

    async def _get_signed_url(self, storage_path: str, expires_in: int = 86400) -> str:
        """
        Generate signed URL for downloading the export.

        Args:
            storage_path: Path in storage
            expires_in: Expiry time in seconds (default 24 hours)

        Returns:
            Signed URL accessible from browser
        """
        result = await asyncio.to_thread(
            self.supabase.client.storage.from_("recordings").create_signed_url,
            storage_path,
            expires_in,
        )

        if not result or "signedURL" not in result:
            raise VideoStitcherError("Failed to generate signed URL")

        signed_url = result["signedURL"]

        # Replace Docker internal hostname with localhost for browser access
        # In production, this won't match so it's a no-op
        signed_url = signed_url.replace("host.docker.internal", "localhost")

        return signed_url
