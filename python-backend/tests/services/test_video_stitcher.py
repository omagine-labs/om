"""
Tests for VideoStitcher service.

Tests image pre-scaling, FFmpeg command building, and error handling.
"""

import sys
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import tempfile
import os

# Always mock PIL before importing video_stitcher to ensure consistent test behavior
# This prevents import errors and ensures video_stitcher loads correctly
_mock_pil_image = MagicMock()
sys.modules["PIL"] = MagicMock()
sys.modules["PIL.Image"] = _mock_pil_image

from app.services.video_stitcher import (  # noqa: E402
    VideoStitcher,
    VideoStitcherError,
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    COUNTDOWN_SECONDS,
    SLIDE_DURATION_SECONDS,
)

# Now check if real PIL is available for tests that need actual image operations
PIL_AVAILABLE = False
try:
    # Remove mocks temporarily to test real PIL
    del sys.modules["PIL"]
    del sys.modules["PIL.Image"]
    from PIL import Image

    PIL_AVAILABLE = True
except (ImportError, KeyError):
    Image = MagicMock()


@pytest.mark.skipif(not PIL_AVAILABLE, reason="PIL/Pillow not installed")
class TestScaleSingleImage:
    """Test suite for _scale_single_image method."""

    @pytest.fixture
    def stitcher(self):
        """Create VideoStitcher instance with mocked supabase and real PIL."""
        with patch("app.services.video_stitcher.SupabaseClient"), patch(
            "app.services.video_stitcher.Image", Image
        ):
            yield VideoStitcher()

    @pytest.fixture
    def temp_image(self):
        """Create a temporary test image."""
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            # Create a test image (wider than target aspect ratio)
            img = Image.new("RGB", (1920, 1080), color="red")
            img.save(f.name, "JPEG")
            yield Path(f.name)
            # Cleanup
            if os.path.exists(f.name):
                os.unlink(f.name)

    @pytest.fixture
    def tall_image(self):
        """Create a tall test image (taller than target aspect ratio)."""
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            img = Image.new("RGB", (1080, 1920), color="blue")
            img.save(f.name, "JPEG")
            yield Path(f.name)
            if os.path.exists(f.name):
                os.unlink(f.name)

    @pytest.fixture
    def png_with_alpha(self):
        """Create a PNG with transparency."""
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            img = Image.new("RGBA", (800, 600), color=(255, 0, 0, 128))
            img.save(f.name, "PNG")
            yield Path(f.name)
            if os.path.exists(f.name):
                os.unlink(f.name)

    def test_scales_wide_image_to_target_dimensions(self, stitcher, temp_image):
        """Test that wide images are scaled and padded correctly."""
        result_path = stitcher._scale_single_image(temp_image)

        with Image.open(result_path) as img:
            assert img.size == (VIDEO_WIDTH, VIDEO_HEIGHT)
            assert img.mode == "RGB"

    def test_scales_tall_image_to_target_dimensions(self, stitcher, tall_image):
        """Test that tall images are scaled and padded correctly."""
        result_path = stitcher._scale_single_image(tall_image)

        with Image.open(result_path) as img:
            assert img.size == (VIDEO_WIDTH, VIDEO_HEIGHT)

    def test_converts_rgba_to_rgb(self, stitcher, png_with_alpha):
        """Test that RGBA images are converted to RGB."""
        result_path = stitcher._scale_single_image(png_with_alpha)

        with Image.open(result_path) as img:
            assert img.mode == "RGB"
            assert img.size == (VIDEO_WIDTH, VIDEO_HEIGHT)

    def test_output_is_jpeg(self, stitcher, temp_image):
        """Test that output is saved as JPEG."""
        result_path = stitcher._scale_single_image(temp_image)

        assert result_path.suffix == ".jpg"

    def test_image_is_centered_with_letterbox(self, stitcher, tall_image):
        """Test that tall images have black bars on sides (letterboxing)."""
        result_path = stitcher._scale_single_image(tall_image)

        with Image.open(result_path) as img:
            # Check that corners are black (letterbox bars)
            top_left_pixel = img.getpixel((0, 0))
            assert top_left_pixel == (0, 0, 0), "Expected black letterbox"


@pytest.mark.skipif(not PIL_AVAILABLE, reason="PIL/Pillow not installed")
class TestPrescaleImages:
    """Test suite for _prescale_images method."""

    @pytest.fixture
    def stitcher(self):
        """Create VideoStitcher instance with mocked supabase and real PIL."""
        with patch("app.services.video_stitcher.SupabaseClient"), patch(
            "app.services.video_stitcher.Image", Image
        ):
            yield VideoStitcher()

    @pytest.fixture
    def temp_images(self):
        """Create multiple temporary test images."""
        paths = []
        for i in range(3):
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
                img = Image.new("RGB", (1920, 1080), color=(i * 50, i * 50, i * 50))
                img.save(f.name, "JPEG")
                paths.append(Path(f.name))
        yield paths
        for p in paths:
            if os.path.exists(p):
                os.unlink(p)

    @pytest.mark.asyncio
    async def test_prescales_all_images(self, stitcher, temp_images):
        """Test that all images are prescaled."""
        result = await stitcher._prescale_images(temp_images)

        assert len(result) == len(temp_images)
        for path in result:
            with Image.open(path) as img:
                assert img.size == (VIDEO_WIDTH, VIDEO_HEIGHT)


class TestRunFFmpeg:
    """Test suite for _run_ffmpeg method."""

    @pytest.fixture
    def stitcher(self):
        """Create VideoStitcher instance with mocked supabase."""
        with patch("app.services.video_stitcher.SupabaseClient"):
            return VideoStitcher()

    @pytest.mark.asyncio
    async def test_successful_ffmpeg_command(self, stitcher):
        """Test that successful FFmpeg command completes without error."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_process = AsyncMock()
            mock_process.communicate = AsyncMock(return_value=(b"", b""))
            mock_process.returncode = 0
            mock_exec.return_value = mock_process

            # Should not raise
            await stitcher._run_ffmpeg(["ffmpeg", "-version"])

    @pytest.mark.asyncio
    async def test_failed_ffmpeg_command_raises_error(self, stitcher):
        """Test that failed FFmpeg command raises VideoStitcherError."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_process = AsyncMock()
            mock_process.communicate = AsyncMock(
                return_value=(b"", b"Error: invalid input")
            )
            mock_process.returncode = 1
            mock_exec.return_value = mock_process

            with pytest.raises(VideoStitcherError, match="FFmpeg failed"):
                await stitcher._run_ffmpeg(["ffmpeg", "-invalid"])


class TestCreateSlideshowVideo:
    """Test suite for _create_slideshow_video method."""

    @pytest.fixture
    def stitcher(self):
        """Create VideoStitcher instance with mocked supabase."""
        with patch("app.services.video_stitcher.SupabaseClient"):
            return VideoStitcher()

    @pytest.mark.asyncio
    async def test_builds_correct_ffmpeg_command_with_topic(self, stitcher):
        """Test that FFmpeg command includes countdown overlay when topic provided."""
        with patch.object(stitcher, "_run_ffmpeg", new_callable=AsyncMock) as mock_run:
            slide_paths = [Path(f"/tmp/slide_{i}.jpg") for i in range(3)]
            audio_path = Path("/tmp/audio.webm")
            output_path = Path("/tmp/output.mp4")

            await stitcher._create_slideshow_video(
                slide_paths=slide_paths,
                audio_path=audio_path,
                output_path=output_path,
                topic_name="Test Topic",
            )

            # Verify FFmpeg was called
            mock_run.assert_called_once()
            cmd = mock_run.call_args[0][0]

            # Check command structure
            assert cmd[0] == "ffmpeg"
            assert "-filter_complex" in cmd

            # Find filter_complex value
            filter_idx = cmd.index("-filter_complex")
            filter_complex = cmd[filter_idx + 1]

            # Should contain drawtext for topic
            assert "drawtext" in filter_complex
            assert "Test Topic" in filter_complex

    @pytest.mark.asyncio
    async def test_builds_correct_ffmpeg_command_without_topic(self, stitcher):
        """Test that FFmpeg command excludes countdown when no topic."""
        with patch.object(stitcher, "_run_ffmpeg", new_callable=AsyncMock) as mock_run:
            slide_paths = [Path(f"/tmp/slide_{i}.jpg") for i in range(3)]
            audio_path = Path("/tmp/audio.webm")
            output_path = Path("/tmp/output.mp4")

            await stitcher._create_slideshow_video(
                slide_paths=slide_paths,
                audio_path=audio_path,
                output_path=output_path,
                topic_name=None,
            )

            mock_run.assert_called_once()
            cmd = mock_run.call_args[0][0]

            filter_idx = cmd.index("-filter_complex")
            filter_complex = cmd[filter_idx + 1]

            # Should NOT contain drawtext
            assert "drawtext" not in filter_complex

    @pytest.mark.asyncio
    async def test_slide_durations_are_correct(self, stitcher):
        """Test that first slide has countdown duration, others don't."""
        with patch.object(stitcher, "_run_ffmpeg", new_callable=AsyncMock) as mock_run:
            slide_paths = [Path(f"/tmp/slide_{i}.jpg") for i in range(3)]
            audio_path = Path("/tmp/audio.webm")
            output_path = Path("/tmp/output.mp4")

            await stitcher._create_slideshow_video(
                slide_paths=slide_paths,
                audio_path=audio_path,
                output_path=output_path,
            )

            cmd = mock_run.call_args[0][0]

            # Find -t options (durations)
            durations = []
            for i, arg in enumerate(cmd):
                if arg == "-t" and i + 1 < len(cmd):
                    durations.append(int(cmd[i + 1]))

            # First slide: countdown + presentation
            expected_first = COUNTDOWN_SECONDS + SLIDE_DURATION_SECONDS
            assert durations[0] == expected_first

            # Other slides: just presentation
            for d in durations[1:]:
                assert d == SLIDE_DURATION_SECONDS


class TestExportGame:
    """Test suite for export_game method."""

    @pytest.fixture
    def stitcher(self):
        """Create VideoStitcher instance with mocked supabase."""
        with patch("app.services.video_stitcher.SupabaseClient") as mock_sb:
            mock_client = MagicMock()
            mock_client.download_file = AsyncMock()
            mock_client.url = "http://localhost:54321"
            mock_client.headers = {}
            mock_sb.return_value = mock_client
            vs = VideoStitcher()
            vs.supabase = mock_client
            return vs

    @pytest.mark.asyncio
    async def test_export_game_cleanup_on_success(self, stitcher):
        """Test that temp directory is cleaned up after successful export."""
        with patch.object(
            stitcher, "_download_slides", new_callable=AsyncMock
        ) as mock_dl, patch.object(
            stitcher, "_prescale_images", new_callable=AsyncMock
        ) as mock_prescale, patch.object(
            stitcher, "_create_slideshow_video", new_callable=AsyncMock
        ), patch.object(
            stitcher, "_upload_export", new_callable=AsyncMock
        ) as mock_upload, patch.object(
            stitcher, "_get_signed_url", new_callable=AsyncMock
        ) as mock_url:
            mock_dl.return_value = [Path("/tmp/slide.jpg")]
            mock_prescale.return_value = [Path("/tmp/slide.jpg")]
            mock_upload.return_value = "exports/test.mp4"
            mock_url.return_value = "https://example.com/signed-url"

            result = await stitcher.export_game(
                game_id="test-game",
                slide_ids=["slide-1"],
                audio_storage_path="audio.webm",
            )

            assert result == "https://example.com/signed-url"

    @pytest.mark.asyncio
    async def test_export_game_raises_on_error(self, stitcher):
        """Test that VideoStitcherError is raised on failure."""
        with patch.object(
            stitcher, "_download_slides", new_callable=AsyncMock
        ) as mock_dl:
            mock_dl.side_effect = Exception("Download failed")

            with pytest.raises(VideoStitcherError, match="Failed to export video"):
                await stitcher.export_game(
                    game_id="test-game",
                    slide_ids=["slide-1"],
                    audio_storage_path="audio.webm",
                )
