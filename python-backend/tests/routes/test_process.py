"""
Tests for process endpoint.

Tests API validation, background task execution, job status queries, and
error handling for the /process endpoint.
"""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import BackgroundTasks
from app.routes.process import (
    ProcessJobRequest,
    process_job_task,
    process_job,
    get_job_status,
)


@pytest.fixture
def mock_orchestrator():
    """Create a mock PipelineOrchestrator."""
    with patch("app.routes.process.PipelineOrchestrator") as mock:
        orchestrator = MagicMock()
        orchestrator.execute = AsyncMock()
        mock.return_value = orchestrator
        yield orchestrator


@pytest.fixture
def mock_supabase():
    """Create a mock SupabaseClient."""
    with patch("app.routes.process.SupabaseClient") as mock:
        client = MagicMock()
        client.get_job_status = AsyncMock(
            return_value={"processing_priority": "normal"}
        )
        client.is_anonymous_meeting = AsyncMock(return_value=False)
        mock.return_value = client
        yield client


class TestProcessJobValidation:
    """Test suite for request validation."""

    @pytest.mark.asyncio
    async def test_missing_job_id_raises_400(self):
        """Test that missing job_id raises HTTPException."""
        request = ProcessJobRequest(
            job_id="",  # Empty job_id
            meeting_id="meeting-123",
            user_id="user-456",
            original_filename="test.mp4",
            storage_path="path/to/file.mp4",
        )
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await process_job(request, background_tasks)

        assert "job_id is required" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_missing_file_url_and_storage_path_raises_400(self):
        """Test that missing both file_url and storage_path raises error."""
        request = ProcessJobRequest(
            job_id="job-123",
            meeting_id="meeting-456",
            user_id="user-789",
            original_filename="test.mp4",
            # Both file_url and storage_path are None
        )
        background_tasks = BackgroundTasks()

        with pytest.raises(Exception) as exc_info:
            await process_job(request, background_tasks)

        assert "Either file_url or storage_path must be provided" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_valid_request_with_storage_path(self, mock_orchestrator):
        """Test valid request with storage_path."""
        request = ProcessJobRequest(
            job_id="job-123",
            meeting_id="meeting-456",
            user_id="user-789",
            original_filename="test.mp4",
            storage_path="uploads/test.mp4",
        )
        background_tasks = BackgroundTasks()

        response = await process_job(request, background_tasks)

        assert response.success is True
        assert response.message == "Processing started"
        assert response.job_id == "job-123"
        assert response.python_job_id == "py_job-123"

    @pytest.mark.asyncio
    async def test_valid_request_with_file_url(self, mock_orchestrator):
        """Test valid request with file_url (backward compatibility)."""
        request = ProcessJobRequest(
            job_id="job-456",
            meeting_id="meeting-789",
            user_id="user-123",
            original_filename="video.mov",
            file_url="https://example.com/video.mov",
        )
        background_tasks = BackgroundTasks()

        response = await process_job(request, background_tasks)

        assert response.success is True
        assert response.python_job_id == "py_job-456"


class TestBackgroundTaskExecution:
    """Test suite for background task execution."""

    @pytest.mark.asyncio
    async def test_successful_processing_with_storage_path(
        self, mock_orchestrator, mock_supabase, tmp_path
    ):
        """Test successful background processing with storage_path."""
        temp_file = tmp_path / "test.mp4"

        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(tmp_path)):
            await process_job_task(
                job_id="job-success",
                meeting_id="meeting-123",
                user_id="user-456",
                original_filename="test.mp4",
                storage_path="uploads/test.mp4",
            )

        # Verify orchestrator.execute was called with storage_path
        # and the new priority/anonymous flags (both False for normal processing)
        mock_orchestrator.execute.assert_called_once_with(
            "job-success",
            "meeting-123",
            "user-456",
            "uploads/test.mp4",
            temp_file,
            False,  # is_priority
            False,  # is_anonymous
        )

    @pytest.mark.asyncio
    async def test_file_url_logs_error(
        self, mock_orchestrator, mock_supabase, tmp_path, caplog
    ):
        """Test that using file_url logs deprecation error."""
        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(tmp_path)):
            await process_job_task(
                job_id="job-old",
                meeting_id="meeting-789",
                user_id="user-123",
                original_filename="test.mp4",
                file_url="https://example.com/test.mp4",
            )

        # Verify deprecation warning and error were logged
        assert "Using deprecated file_url parameter" in caplog.text
        assert "file_url is no longer supported" in caplog.text

    @pytest.mark.asyncio
    async def test_missing_both_logs_error(
        self, mock_orchestrator, mock_supabase, tmp_path, caplog
    ):
        """Test that missing both file_url and storage_path logs error."""
        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(tmp_path)):
            await process_job_task(
                job_id="job-none",
                meeting_id="meeting-abc",
                user_id="user-xyz",
                original_filename="test.mp4",
            )

        # Verify error was logged
        assert "Either storage_path or file_url must be provided" in caplog.text

    @pytest.mark.asyncio
    async def test_orchestrator_error_is_caught(
        self, mock_orchestrator, mock_supabase, tmp_path
    ):
        """Test that orchestrator errors are caught and logged."""
        mock_orchestrator.execute.side_effect = Exception("Processing error")

        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(tmp_path)):
            # Should not raise, errors are caught and logged
            await process_job_task(
                job_id="job-error",
                meeting_id="meeting-456",
                user_id="user-789",
                original_filename="test.mp4",
                storage_path="uploads/test.mp4",
            )


class TestTempFileCleanup:
    """Test suite for temporary file cleanup."""

    @pytest.mark.asyncio
    async def test_temp_file_cleanup_on_success(
        self, mock_orchestrator, mock_supabase, tmp_path
    ):
        """Test that temp files are cleaned up after successful processing."""
        temp_dir = tmp_path / "job_cleanup_"
        temp_dir.mkdir()
        temp_file = temp_dir / "test.mp4"
        temp_file.write_text("test content")

        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(temp_dir)):
            await process_job_task(
                job_id="job-cleanup",
                meeting_id="meeting-123",
                user_id="user-456",
                original_filename="test.mp4",
                storage_path="uploads/test.mp4",
            )

        # Verify temp file and directory are deleted
        assert not temp_file.exists()
        assert not temp_dir.exists()

    @pytest.mark.asyncio
    async def test_temp_file_cleanup_on_error(
        self, mock_orchestrator, mock_supabase, tmp_path
    ):
        """Test that temp files are cleaned up even when processing fails."""
        mock_orchestrator.execute.side_effect = Exception("Processing failed")

        temp_dir = tmp_path / "job_error_cleanup_"
        temp_dir.mkdir()
        temp_file = temp_dir / "test.mp4"
        temp_file.write_text("test content")

        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(temp_dir)):
            await process_job_task(
                job_id="job-error-cleanup",
                meeting_id="meeting-789",
                user_id="user-123",
                original_filename="test.mp4",
                storage_path="uploads/test.mp4",
            )

        # Verify cleanup still happens
        assert not temp_file.exists()
        assert not temp_dir.exists()

    @pytest.mark.asyncio
    async def test_cleanup_error_is_caught(
        self, mock_orchestrator, mock_supabase, tmp_path
    ):
        """Test that cleanup errors don't crash the task."""
        temp_file = tmp_path / "test.mp4"
        temp_file.write_text("test")

        with patch("app.routes.process.tempfile.mkdtemp", return_value=str(tmp_path)):
            with patch.object(Path, "unlink", side_effect=OSError("Permission denied")):
                # Should not raise, cleanup errors are caught
                await process_job_task(
                    job_id="job-cleanup-error",
                    meeting_id="meeting-abc",
                    user_id="user-xyz",
                    original_filename="test.mp4",
                    storage_path="uploads/test.mp4",
                )


class TestGetJobStatus:
    """Test suite for job status endpoint."""

    @pytest.mark.asyncio
    async def test_get_status_success(self, mock_supabase):
        """Test successful job status retrieval."""
        mock_job = {
            "id": "job-123",
            "status": "completed",
            "meeting_id": "meeting-456",
        }
        mock_supabase.get_job_status.return_value = mock_job

        result = await get_job_status("job-123")

        assert result["success"] is True
        assert result["job"] == mock_job
        mock_supabase.get_job_status.assert_called_once_with("job-123")

    @pytest.mark.asyncio
    async def test_get_status_job_not_found(self, mock_supabase):
        """Test 404 when job is not found."""
        mock_supabase.get_job_status.return_value = None

        with pytest.raises(Exception) as exc_info:
            await get_job_status("job-nonexistent")

        assert "Job not found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_status_database_error(self, mock_supabase):
        """Test 500 when database error occurs (returns generic message for security)."""
        mock_supabase.get_job_status.side_effect = Exception("Database error")

        with pytest.raises(Exception) as exc_info:
            await get_job_status("job-error")

        # Security fix: error details are not exposed to client
        assert "Internal server error" in str(exc_info.value)


class TestProcessJobResponse:
    """Test suite for response format."""

    @pytest.mark.asyncio
    async def test_response_includes_python_job_id(self, mock_orchestrator):
        """Test that response includes generated python_job_id."""
        request = ProcessJobRequest(
            job_id="frontend-job-123",
            meeting_id="meeting-456",
            user_id="user-789",
            original_filename="test.mp4",
            storage_path="uploads/test.mp4",
        )
        background_tasks = BackgroundTasks()

        response = await process_job(request, background_tasks)

        assert response.python_job_id == "py_frontend-job-123"
        assert response.job_id == "frontend-job-123"

    @pytest.mark.asyncio
    async def test_response_success_true(self, mock_orchestrator):
        """Test that response always returns success=True on valid request."""
        request = ProcessJobRequest(
            job_id="job-456",
            meeting_id="meeting-789",
            user_id="user-123",
            original_filename="video.mp4",
            storage_path="path/to/video.mp4",
        )
        background_tasks = BackgroundTasks()

        response = await process_job(request, background_tasks)

        assert response.success is True
        assert response.message == "Processing started"


class TestBackgroundTaskIntegration:
    """Test suite for background task integration."""

    @pytest.mark.asyncio
    async def test_background_task_is_added(self, mock_orchestrator):
        """Test that background task is properly added."""
        request = ProcessJobRequest(
            job_id="job-bg",
            meeting_id="meeting-123",
            user_id="user-456",
            original_filename="test.mp4",
            storage_path="uploads/test.mp4",
        )
        background_tasks = BackgroundTasks()

        await process_job(request, background_tasks)

        # Verify background task was added (check tasks list)
        assert len(background_tasks.tasks) == 1

    @pytest.mark.asyncio
    async def test_background_task_parameters(self, mock_orchestrator):
        """Test that background task receives correct parameters."""
        request = ProcessJobRequest(
            job_id="job-params",
            meeting_id="meeting-abc",
            user_id="user-xyz",
            original_filename="video.mov",
            storage_path="path/video.mov",
        )
        background_tasks = MagicMock()

        await process_job(request, background_tasks)

        # Verify add_task was called with correct function and args
        background_tasks.add_task.assert_called_once()
        args = background_tasks.add_task.call_args[0]
        assert args[0] == process_job_task
        assert args[1] == "job-params"  # job_id
        assert args[2] == "meeting-abc"  # meeting_id
        assert args[3] == "user-xyz"  # user_id
        assert args[4] == "video.mov"  # original_filename


# Mark all test classes as unit tests
pytest.mark.unit(TestProcessJobValidation)
pytest.mark.unit(TestBackgroundTaskExecution)
pytest.mark.unit(TestTempFileCleanup)
pytest.mark.unit(TestGetJobStatus)
pytest.mark.unit(TestProcessJobResponse)
pytest.mark.unit(TestBackgroundTaskIntegration)
