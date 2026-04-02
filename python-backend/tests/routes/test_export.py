"""
Tests for export endpoint.

Tests API validation, background task execution, job status queries, and
error handling for the /export endpoints.
"""

import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import BackgroundTasks

# Mock PIL before importing export module (which imports video_stitcher)
# Must set sys.modules directly so mock persists through import
if "PIL" not in sys.modules:
    sys.modules["PIL"] = MagicMock()
    sys.modules["PIL.Image"] = MagicMock()

from app.routes.export import (  # noqa: E402
    ExportVideoRequest,
    export_video,
    get_export_status,
    process_export_task,
    _export_jobs,
)


@pytest.fixture
def mock_supabase():
    """Create a mock SupabaseClient."""
    with patch("app.routes.export.SupabaseClient") as mock:
        client = MagicMock()
        client.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "completed",
                "user_id": "user-456",
                "slide_ids": ["slide-1", "slide-2"],
                "audio_storage_path": "recordings/audio.webm",
                "video_storage_path": None,
                "topic_date": "2026-01-20",
            }
        )
        client.get_topic_name = AsyncMock(return_value="Test Topic")
        mock.return_value = client
        yield client


@pytest.fixture
def mock_video_stitcher():
    """Create a mock VideoStitcher."""
    with patch("app.routes.export.VideoStitcher") as mock:
        stitcher = MagicMock()
        stitcher.export_game = AsyncMock(
            return_value="https://example.com/download.mp4"
        )
        mock.return_value = stitcher
        yield stitcher


@pytest.fixture(autouse=True)
def clear_export_jobs():
    """Clear export jobs before each test."""
    _export_jobs.clear()
    yield
    _export_jobs.clear()


class TestExportVideoValidation:
    """Test suite for request validation."""

    @pytest.mark.asyncio
    async def test_missing_game_id_raises_400(self):
        """Test that empty game_id raises HTTPException."""
        request = ExportVideoRequest(game_id="")
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await export_video(request, background_tasks)

        assert "game_id is required" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_incomplete_game_raises_400(self, mock_supabase):
        """Test that non-completed game raises HTTPException."""
        mock_supabase.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "in_progress",  # Not completed
                "user_id": "user-456",
            }
        )

        request = ExportVideoRequest(game_id="game-123")
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await export_video(request, background_tasks)

        assert "Game must be completed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_anonymous_game_without_token_raises_401(self, mock_supabase):
        """Test that anonymous game without access_token raises 401."""
        mock_supabase.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "completed",
                "user_id": None,  # Anonymous game
                "access_token": "secret-token",
                "slide_ids": ["slide-1"],
                "audio_storage_path": "audio.webm",
            }
        )

        request = ExportVideoRequest(game_id="game-123", access_token=None)
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await export_video(request, background_tasks)

        assert "access_token required" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_anonymous_game_with_wrong_token_raises_403(self, mock_supabase):
        """Test that wrong access_token raises 403."""
        mock_supabase.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "completed",
                "user_id": None,
                "access_token": "correct-token",
                "slide_ids": ["slide-1"],
                "audio_storage_path": "audio.webm",
            }
        )

        request = ExportVideoRequest(game_id="game-123", access_token="wrong-token")
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await export_video(request, background_tasks)

        assert "Invalid access token" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_game_without_slides_raises_400(self, mock_supabase):
        """Test that game without slides raises HTTPException."""
        mock_supabase.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "completed",
                "user_id": "user-456",
                "slide_ids": [],  # No slides
                "audio_storage_path": "audio.webm",
            }
        )

        request = ExportVideoRequest(game_id="game-123")
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await export_video(request, background_tasks)

        assert "no slides" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_game_without_audio_raises_400(self, mock_supabase):
        """Test that game without audio raises HTTPException."""
        mock_supabase.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "completed",
                "user_id": "user-456",
                "slide_ids": ["slide-1"],
                "audio_storage_path": None,  # No audio
            }
        )

        request = ExportVideoRequest(game_id="game-123")
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await export_video(request, background_tasks)

        assert "no audio" in str(exc_info.value)


class TestExportVideoSuccess:
    """Test suite for successful export requests."""

    @pytest.mark.asyncio
    async def test_valid_request_returns_export_id(self, mock_supabase):
        """Test that valid request returns export ID and starts processing."""
        request = ExportVideoRequest(game_id="game-123")
        background_tasks = BackgroundTasks()

        response = await export_video(request, background_tasks)

        assert response.success is True
        assert response.status == "processing"
        assert len(response.export_id) == 8  # UUID prefix

    @pytest.mark.asyncio
    async def test_export_job_is_tracked(self, mock_supabase):
        """Test that export job is added to tracking dict."""
        request = ExportVideoRequest(game_id="game-123")
        background_tasks = BackgroundTasks()

        response = await export_video(request, background_tasks)

        assert response.export_id in _export_jobs
        assert _export_jobs[response.export_id]["status"] == "processing"
        assert _export_jobs[response.export_id]["game_id"] == "game-123"

    @pytest.mark.asyncio
    async def test_selfie_video_mode_detected(self, mock_supabase):
        """Test that selfie_video mode is detected when video_storage_path exists."""
        mock_supabase.get_game = AsyncMock(
            return_value={
                "id": "game-123",
                "status": "completed",
                "user_id": "user-456",
                "slide_ids": ["slide-1"],
                "audio_storage_path": "audio.webm",
                "video_storage_path": "video.webm",  # Has selfie video
                "topic_date": "2026-01-20",
            }
        )

        request = ExportVideoRequest(game_id="game-123")
        background_tasks = BackgroundTasks()

        # Should not raise - selfie mode should be detected
        response = await export_video(request, background_tasks)
        assert response.success is True


class TestGetExportStatus:
    """Test suite for export status endpoint."""

    @pytest.mark.asyncio
    async def test_returns_status_for_existing_job(self):
        """Test that status is returned for existing job."""
        _export_jobs["test-123"] = {
            "status": "processing",
            "game_id": "game-456",
        }

        response = await get_export_status("test-123")

        assert response.success is True
        assert response.export_id == "test-123"
        assert response.status == "processing"

    @pytest.mark.asyncio
    async def test_returns_download_url_when_completed(self):
        """Test that download_url is returned when job is completed."""
        _export_jobs["test-123"] = {
            "status": "completed",
            "game_id": "game-456",
            "download_url": "https://example.com/video.mp4",
        }

        response = await get_export_status("test-123")

        assert response.status == "completed"
        assert response.download_url == "https://example.com/video.mp4"

    @pytest.mark.asyncio
    async def test_returns_error_when_failed(self):
        """Test that error is returned when job failed."""
        _export_jobs["test-123"] = {
            "status": "failed",
            "game_id": "game-456",
            "error": "FFmpeg crashed",
        }

        response = await get_export_status("test-123")

        assert response.status == "failed"
        assert response.error == "FFmpeg crashed"

    @pytest.mark.asyncio
    async def test_raises_404_for_unknown_job(self):
        """Test that 404 is raised for unknown export ID."""
        with pytest.raises(Exception) as exc_info:
            await get_export_status("nonexistent-job")

        assert "not found" in str(exc_info.value)


class TestProcessExportTask:
    """Test suite for background export task."""

    @pytest.mark.asyncio
    async def test_successful_export_updates_job_status(self, mock_video_stitcher):
        """Test that successful export updates job to completed."""
        _export_jobs["test-123"] = {"status": "processing", "game_id": "game-456"}

        await process_export_task(
            export_id="test-123",
            game_id="game-456",
            slide_ids=["slide-1"],
            audio_storage_path="audio.webm",
            video_storage_path=None,
            recording_mode="audio_only",
            topic_name="Test Topic",
        )

        assert _export_jobs["test-123"]["status"] == "completed"
        assert "download_url" in _export_jobs["test-123"]

    @pytest.mark.asyncio
    async def test_failed_export_updates_job_status(self):
        """Test that failed export updates job to failed with error."""
        _export_jobs["test-123"] = {"status": "processing", "game_id": "game-456"}

        with patch("app.routes.export.VideoStitcher") as mock:
            stitcher = MagicMock()
            stitcher.export_game = AsyncMock(side_effect=Exception("Export failed"))
            mock.return_value = stitcher

            await process_export_task(
                export_id="test-123",
                game_id="game-456",
                slide_ids=["slide-1"],
                audio_storage_path="audio.webm",
                video_storage_path=None,
                recording_mode="audio_only",
            )

        assert _export_jobs["test-123"]["status"] == "failed"
        assert "Export failed" in _export_jobs["test-123"]["error"]

    @pytest.mark.asyncio
    async def test_export_passes_topic_name_to_stitcher(self, mock_video_stitcher):
        """Test that topic_name is passed to VideoStitcher."""
        await process_export_task(
            export_id="test-123",
            game_id="game-456",
            slide_ids=["slide-1"],
            audio_storage_path="audio.webm",
            video_storage_path=None,
            recording_mode="audio_only",
            topic_name="My Topic",
        )

        mock_video_stitcher.export_game.assert_called_once()
        call_kwargs = mock_video_stitcher.export_game.call_args[1]
        assert call_kwargs["topic_name"] == "My Topic"
