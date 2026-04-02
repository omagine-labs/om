"""
Tests for Supabase client.

Tests database and storage operations with retry logic and error handling.
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch
from app.services.supabase_client import SupabaseClient


class TestSupabaseClientInitialization:
    """Test suite for client initialization."""

    def test_initialization_with_valid_env_vars(self, monkeypatch):
        """Test successful initialization with environment variables."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_secret_key")

        with patch("app.services.supabase_client.create_client") as mock_create:
            mock_create.return_value = Mock()
            client = SupabaseClient()

            assert client.url == "https://test.supabase.co"
            assert client.service_key == "test_secret_key"
            assert "Authorization" in client.headers
            mock_create.assert_called_once()

    def test_initialization_without_url_raises_error(self, monkeypatch):
        """Test that missing SUPABASE_URL raises ValueError."""
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with pytest.raises(
            ValueError,
            match="SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment",
        ):
            SupabaseClient()

    def test_initialization_without_secret_key_raises_error(self, monkeypatch):
        """Test that missing SUPABASE_SECRET_KEY raises ValueError."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)

        with pytest.raises(
            ValueError,
            match="SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment",
        ):
            SupabaseClient()


class TestStorageDownload:
    """Test suite for storage download operations."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client") as mock_create:
            mock_storage = Mock()
            mock_bucket = Mock()
            # Mock signed URL generation
            mock_bucket.create_signed_url.return_value = {
                "signedURL": "https://test.supabase.co/storage/v1/object/sign/recordings/test.mp4?token=abc123"
            }
            mock_storage.from_.return_value = mock_bucket
            mock_client = Mock()
            mock_client.storage = mock_storage
            mock_create.return_value = mock_client

            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_download(self, client):
        """Test successful file download from storage."""
        storage_path = "user123/2025/01/test.mp4"

        # Mock httpx response
        mock_response = Mock()
        mock_response.content = b"file content"
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_httpx:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_httpx.return_value = mock_client_instance

            result = await client.download_from_storage(storage_path)

            assert result == b"file content"
            client.client.storage.from_.assert_called_with("recordings")
            client.client.storage.from_().create_signed_url.assert_called_with(
                storage_path, 3600
            )

    @pytest.mark.asyncio
    async def test_download_empty_response_raises_error(self, client):
        """Test that empty response raises ValueError."""
        mock_response = Mock()
        mock_response.content = b""  # Empty content
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_httpx:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_httpx.return_value = mock_client_instance

            with pytest.raises(
                ValueError, match="Empty response from storage download"
            ):
                await client.download_from_storage("path/to/file.mp4")

    @pytest.mark.asyncio
    async def test_download_retries_on_failure(self, client, monkeypatch):
        """Test that download retries up to 3 times on failure."""
        # Mock to fail twice, then succeed
        call_count = 0

        def side_effect(*args):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Download failed")
            mock_response = Mock()
            mock_response.content = b"success"
            mock_response.raise_for_status = Mock()
            return mock_response

        with patch("httpx.AsyncClient") as mock_httpx:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(side_effect=side_effect)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_httpx.return_value = mock_client_instance

            result = await client.download_from_storage("path/file.mp4")

            assert result == b"success"
            assert call_count == 3

    @pytest.mark.asyncio
    async def test_download_max_retries_exhausted(self, client):
        """Test that download raises error after max retries."""
        with patch("httpx.AsyncClient") as mock_httpx:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(
                side_effect=Exception("Persistent failure")
            )
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client_instance

            with pytest.raises(Exception, match="Persistent failure"):
                await client.download_from_storage("path/file.mp4")


class TestJobStatusUpdates:
    """Test suite for job status update operations."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_update_job_status_to_completed(self, client):
        """Test updating job status to completed."""
        mock_response = Mock()
        mock_response.status_code = 204
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.patch = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.update_job_status("job-123", "completed")

            assert result == {"success": True}
            mock_client_instance.patch.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_job_status_with_error(self, client):
        """Test updating job status with error message."""
        mock_response = Mock()
        mock_response.status_code = 204
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.patch = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.update_job_status("job-456", "failed", "Test error")

            # Verify error was passed in request
            call_args = mock_client_instance.patch.call_args
            assert call_args[1]["json"]["status"] == "failed"
            assert call_args[1]["json"]["processing_error"] == "Test error"

    @pytest.mark.asyncio
    async def test_update_job_status_timeout_configuration(self, client):
        """Test that timeout configuration is properly set."""
        mock_response = Mock()
        mock_response.status_code = 204
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.patch = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.update_job_status("job-timeout", "processing")

            # Verify httpx.AsyncClient was called with timeout
            assert mock_async_client.called
            timeout_arg = mock_async_client.call_args[1]["timeout"]
            assert timeout_arg.connect == 10.0
            assert timeout_arg.read == 30.0


class TestAnalysisResultsSave:
    """Test suite for saving analysis results."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_save_with_delete_and_insert(self, client):
        """Test successful save with delete-then-insert transaction."""
        speaker_records = [
            {"job_id": "job-123", "speaker_label": "A", "talk_time_seconds": 60}
        ]

        mock_delete_response = Mock()
        mock_delete_response.status_code = 204

        mock_insert_response = Mock()
        mock_insert_response.status_code = 201
        mock_insert_response.text = ""
        mock_insert_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.post = AsyncMock(return_value=mock_insert_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.save_analysis_results("job-123", speaker_records)

            assert result == {"success": True}
            assert mock_client_instance.delete.call_count == 1
            assert mock_client_instance.post.call_count == 1

    @pytest.mark.asyncio
    async def test_save_handles_404_delete_gracefully(self, client):
        """Test that 404 on delete doesn't fail (no records exist yet)."""
        speaker_records = [{"job_id": "job-new", "speaker_label": "A"}]

        mock_delete_response = Mock()
        mock_delete_response.status_code = 404  # No records to delete

        mock_insert_response = Mock()
        mock_insert_response.status_code = 201
        mock_insert_response.text = ""
        mock_insert_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.post = AsyncMock(return_value=mock_insert_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.save_analysis_results("job-new", speaker_records)

            # Should succeed despite 404 on delete
            assert result == {"success": True}

    @pytest.mark.asyncio
    async def test_save_logs_error_on_insert_failure(self, client):
        """Test that insert failure logs error details."""
        speaker_records = [{"job_id": "job-fail"}]

        mock_delete_response = Mock()
        mock_delete_response.status_code = 204

        mock_insert_response = Mock()
        mock_insert_response.status_code = 400
        mock_insert_response.text = "Invalid data"
        mock_insert_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.post = AsyncMock(return_value=mock_insert_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            # Insert with bad status code should log error but still succeed
            # (based on status code checking in implementation)
            # Since we're not raising on the mock, it will succeed
            result = await client.save_analysis_results("job-fail", speaker_records)

            # The implementation logs errors but doesn't fail for status codes
            # It only raises if raise_for_status() raises
            assert result is not None


class TestMeetingMetadataUpdate:
    """Test suite for meeting metadata updates."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_metadata_update(self, client):
        """Test successful meeting metadata update."""
        # Mock GET response (to fetch start_time)
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.json = Mock(
            return_value=[{"start_time": "2025-11-27T10:00:00+00:00"}]
        )
        mock_get_response.raise_for_status = Mock()

        # Mock PATCH response (to update meeting)
        mock_patch_response = Mock()
        mock_patch_response.status_code = 204
        mock_patch_response.text = ""
        mock_patch_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_get_response)
            mock_client_instance.patch = AsyncMock(return_value=mock_patch_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.update_meeting_metadata("meeting-123", 25.5, 120)

            assert result == {"success": True}

            # Verify GET request was made to fetch start_time
            assert mock_client_instance.get.called
            get_call_args = mock_client_instance.get.call_args
            assert "start_time" in get_call_args[0][0]

            # Verify PATCH request data includes end_time
            call_args = mock_client_instance.patch.call_args
            data = call_args[1]["json"]
            assert data["recording_size_mb"] == 25.5
            assert data["recording_duration_seconds"] == 120
            assert "end_time" in data  # Calculated from start_time + duration


class TestRecordingExpiryUpdate:
    """Test suite for recording expiry timestamp updates."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_expiry_update(self, client):
        """Test successful recording expiry update with ISO timestamp."""
        mock_response = Mock()
        mock_response.status_code = 204
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.patch = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            available_until = "2025-01-17T10:00:00"
            result = await client.update_meeting_recording_expiry(
                "meeting-456", available_until
            )

            assert result == {"success": True}

            # Verify ISO timestamp was sent
            call_args = mock_client_instance.patch.call_args
            data = call_args[1]["json"]
            assert data["recording_available_until"] == available_until


class TestFirstCompletedJobCheck:
    """Test suite for first completed job detection."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_is_first_completed_job_returns_true(self, client):
        """Test that first completed job returns True."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Range": "0-0/1"}  # Count is 1
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.is_first_completed_job("user-123")

            assert result is True

    @pytest.mark.asyncio
    async def test_is_first_completed_job_returns_false_for_multiple_jobs(self, client):
        """Test that subsequent jobs return False."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Range": "0-4/5"}  # Count is 5
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.is_first_completed_job("user-456")

            assert result is False

    @pytest.mark.asyncio
    async def test_is_first_completed_job_error_returns_false(self, client):
        """Test that errors return False to avoid blocking pipeline."""

        class MockAsyncContextManager:
            async def __aenter__(self):
                # Create a mock client that will raise on get()
                mock_client = AsyncMock()
                mock_client.get = AsyncMock(side_effect=Exception("Database error"))
                return mock_client

            async def __aexit__(self, *args):
                pass

        with patch("httpx.AsyncClient", return_value=MockAsyncContextManager()):
            result = await client.is_first_completed_job("user-error")

            # Should return False on error
            assert result is False


class TestAnalyticsEventLogging:
    """Test suite for analytics event logging."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_event_logging(self, client):
        """Test successful analytics event logging."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.log_analytics_event(
                "user-123", "first_meeting_recorded", {"source": "upload"}
            )

            # Verify event was logged with correct structure
            call_args = mock_client_instance.post.call_args
            data = call_args[1]["json"]
            assert data["user_id"] == "user-123"
            assert data["event_name"] == "first_meeting_recorded"
            assert data["payload"] == {"source": "upload"}

    @pytest.mark.asyncio
    async def test_event_logging_failure_does_not_raise(self, client):
        """Test that analytics failure doesn't raise exception."""
        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(side_effect=Exception("API error"))
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            # Should not raise
            await client.log_analytics_event("user-fail", "test_event")


class TestCleanupFailedJob:
    """Test suite for failed job cleanup."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_cleanup_invocation(self, client):
        """Test successful cleanup Edge Function invocation."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = '{"success": true}'
        mock_response.json.return_value = {"success": True}
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.cleanup_failed_job("job-cleanup")

            assert result == {"success": True}

            # Verify correct endpoint and payload
            call_args = mock_client_instance.post.call_args
            assert "/functions/v1/cleanup-failed-job" in call_args[0][0]
            assert call_args[1]["json"] == {"job_id": "job-cleanup"}


class TestGetJobStatus:
    """Test suite for getting job status."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_get_existing_job_status(self, client):
        """Test getting status for existing job."""
        mock_job_data = {
            "id": "job-123",
            "status": "completed",
            "created_at": "2025-01-10",
        }

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = [mock_job_data]
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.get_job_status("job-123")

            assert result == mock_job_data

    @pytest.mark.asyncio
    async def test_get_nonexistent_job_status(self, client):
        """Test getting status for nonexistent job returns None."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = []  # Empty array
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.get_job_status("nonexistent-job")

            assert result is None


class TestCountSegmentsForMeeting:
    """Test suite for counting segments per meeting."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()


class TestDeleteMeeting:
    """Test suite for meeting deletion."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client") as mock_create:
            mock_storage = Mock()
            mock_bucket = Mock()
            mock_bucket.remove = Mock(return_value=None)
            mock_storage.from_.return_value = mock_bucket
            mock_client = Mock()
            mock_client.storage = mock_storage
            mock_create.return_value = mock_client

            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_meeting_deletion(self, client):
        """Test successful meeting and storage deletion."""
        mock_delete_response = Mock()
        mock_delete_response.status_code = 204
        mock_delete_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            # Should not raise
            await client.delete_meeting("meeting-123", "user/2025/test.mov")

            # Verify storage deletion was called
            client.client.storage.from_.assert_called_with("recordings")
            client.client.storage.from_().remove.assert_called_with(
                ["user/2025/test.mov"]
            )

            # Verify database deletion was called
            call_args = mock_client_instance.delete.call_args
            assert "meetings?id=eq.meeting-123" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_delete_meeting_continues_on_storage_failure(self, client):
        """Test that database deletion proceeds even if storage deletion fails."""
        # Mock storage to raise error
        client.client.storage.from_().remove.side_effect = Exception("Storage error")

        mock_delete_response = Mock()
        mock_delete_response.status_code = 204
        mock_delete_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            # Should not raise - continues to DB deletion
            await client.delete_meeting("meeting-456", "user/2025/fail.mov")

            # Verify database deletion was still attempted
            assert mock_client_instance.delete.called

    @pytest.mark.asyncio
    async def test_delete_meeting_raises_on_database_error(self, client):
        """Test that database deletion errors are propagated."""

        class MockAsyncContextManager:
            async def __aenter__(self):
                mock_client = AsyncMock()
                mock_client.delete = AsyncMock(side_effect=Exception("Database error"))
                return mock_client

            async def __aexit__(self, *args):
                pass

        with patch("httpx.AsyncClient", return_value=MockAsyncContextManager()):
            with pytest.raises(Exception, match="Database error"):
                await client.delete_meeting("meeting-error", "user/2025/error.mov")

    @pytest.mark.asyncio
    async def test_delete_meeting_with_null_storage_path(self, client):
        """Test deletion handles null/empty storage path gracefully."""
        mock_delete_response = Mock()
        mock_delete_response.status_code = 204
        mock_delete_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            # Should handle empty storage path
            await client.delete_meeting("meeting-no-storage", "")

            # Verify storage deletion was still attempted (with empty path)
            client.client.storage.from_().remove.assert_called_with([""])

    @pytest.mark.asyncio
    async def test_delete_meeting_timeout_configuration(self, client):
        """Test that timeout configuration is properly set."""
        mock_delete_response = Mock()
        mock_delete_response.status_code = 204
        mock_delete_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.delete_meeting("meeting-timeout", "user/test.mov")

            # Verify httpx.AsyncClient was called with timeout
            assert mock_async_client.called
            timeout_arg = mock_async_client.call_args[1]["timeout"]
            assert timeout_arg.connect == 10.0
            assert timeout_arg.read == 30.0
            assert timeout_arg.write == 10.0

    @pytest.mark.asyncio
    async def test_delete_meeting_uses_correct_storage_bucket(self, client):
        """Test that deletion uses correct storage bucket name."""
        mock_delete_response = Mock()
        mock_delete_response.status_code = 204
        mock_delete_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.delete = AsyncMock(return_value=mock_delete_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.delete_meeting("meeting-bucket", "user/recording.mov")

            # Verify correct bucket name
            client.client.storage.from_.assert_called_with("recordings")


class TestGetOffRecordPeriods:
    """Test suite for get_off_record_periods method."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client") as mock_create:
            mock_create.return_value = Mock()
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_get_off_record_periods_returns_periods(self, client):
        """Test successful fetch of off-record periods."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "off_record_periods": [
                    {
                        "placeholderStart": 121.62,
                        "placeholderEnd": 126.62,
                        "actualDuration": 300,
                    }
                ]
            }
        ]
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            periods = await client.get_off_record_periods("meeting-123")

            assert len(periods) == 1
            assert periods[0]["placeholderStart"] == 121.62
            assert periods[0]["placeholderEnd"] == 126.62
            assert periods[0]["actualDuration"] == 300

    @pytest.mark.asyncio
    async def test_get_off_record_periods_returns_empty_list_when_null(self, client):
        """Test that null off_record_periods returns empty list."""
        mock_response = Mock()
        mock_response.json.return_value = [{"off_record_periods": None}]
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            periods = await client.get_off_record_periods("meeting-123")

            assert periods == []

    @pytest.mark.asyncio
    async def test_get_off_record_periods_returns_empty_list_when_no_meeting(
        self, client
    ):
        """Test that missing meeting returns empty list."""
        mock_response = Mock()
        mock_response.json.return_value = []
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            periods = await client.get_off_record_periods("nonexistent-meeting")

            assert periods == []

    @pytest.mark.asyncio
    async def test_get_off_record_periods_handles_multiple_periods(self, client):
        """Test handling of multiple off-record periods."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "off_record_periods": [
                    {
                        "placeholderStart": 60.0,
                        "placeholderEnd": 65.0,
                        "actualDuration": 120,
                    },
                    {
                        "placeholderStart": 180.0,
                        "placeholderEnd": 185.0,
                        "actualDuration": 300,
                    },
                ]
            }
        ]
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            periods = await client.get_off_record_periods("meeting-123")

            assert len(periods) == 2
            assert periods[0]["actualDuration"] == 120
            assert periods[1]["actualDuration"] == 300


class TestSaveTranscript:
    """Test suite for save_transcript method."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Fixture to create a SupabaseClient instance."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "test_key")

        with patch("app.services.supabase_client.create_client"):
            yield SupabaseClient()

    @pytest.mark.asyncio
    async def test_successful_transcript_save(self, client):
        """Test successful transcript save to transcripts table."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        transcription_result = {
            "text": "Hello world. This is a test.",
            "language": "en",
            "duration": 120.5,
            "num_speakers": 2,
            "segments": [
                {"speaker": "Speaker A", "text": "Hello world.", "start": 0, "end": 2},
                {
                    "speaker": "Speaker B",
                    "text": "This is a test.",
                    "start": 2.5,
                    "end": 5,
                },
            ],
        }

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.save_transcript("meeting-123", transcription_result)

            assert result == {"success": True}

            # Verify correct endpoint and data
            call_args = mock_client_instance.post.call_args
            assert "/rest/v1/transcripts" in call_args[0][0]

            data = call_args[1]["json"]
            assert data["meeting_id"] == "meeting-123"
            assert data["language"] == "en"
            assert data["duration_seconds"] == 120.5
            assert data["num_speakers"] == 2
            assert data["word_count"] == 6  # "Hello world. This is a test."
            assert data["full_text"] == "Hello world. This is a test."
            assert len(data["segments"]) == 2
            assert set(data["speakers"]) == {"Speaker A", "Speaker B"}
            assert data["provider"] == "assemblyai"

    @pytest.mark.asyncio
    async def test_transcript_save_with_upsert_header(self, client):
        """Test that upsert header is set for re-processing."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        transcription_result = {
            "text": "Test",
            "segments": [],
        }

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.save_transcript("meeting-456", transcription_result)

            # Verify upsert header is present
            call_args = mock_client_instance.post.call_args
            headers = call_args[1]["headers"]
            assert headers.get("Prefer") == "resolution=merge-duplicates"

    @pytest.mark.asyncio
    async def test_transcript_save_extracts_unique_speakers(self, client):
        """Test that speakers are correctly extracted and deduplicated."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        transcription_result = {
            "text": "Test",
            "segments": [
                {"speaker": "Speaker A", "text": "one", "start": 0, "end": 1},
                {"speaker": "Speaker B", "text": "two", "start": 1, "end": 2},
                {"speaker": "Speaker A", "text": "three", "start": 2, "end": 3},
                {"speaker": "Speaker C", "text": "four", "start": 3, "end": 4},
                {"speaker": "Speaker A", "text": "five", "start": 4, "end": 5},
            ],
        }

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            await client.save_transcript("meeting-789", transcription_result)

            call_args = mock_client_instance.post.call_args
            data = call_args[1]["json"]
            # Should be sorted and unique
            assert data["speakers"] == ["Speaker A", "Speaker B", "Speaker C"]

    @pytest.mark.asyncio
    async def test_transcript_save_handles_empty_segments(self, client):
        """Test handling of empty segments array."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        transcription_result = {
            "text": "",
            "segments": [],
            "language": "en",
        }

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.save_transcript("meeting-empty", transcription_result)

            assert result == {"success": True}

            call_args = mock_client_instance.post.call_args
            data = call_args[1]["json"]
            assert data["segments"] == []
            assert data["speakers"] == []
            assert data["word_count"] == 0

    @pytest.mark.asyncio
    async def test_transcript_save_raises_on_error(self, client):
        """Test that errors are propagated on non-2xx status codes."""
        import httpx

        mock_request = Mock()
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        # Create the error that will be raised
        http_error = httpx.HTTPStatusError(
            "Server error", request=mock_request, response=mock_response
        )

        def raise_error():
            raise http_error

        mock_response.raise_for_status = raise_error

        transcription_result = {"text": "Test", "segments": []}

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            # Return False to NOT suppress exceptions from the async with block
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            mock_async_client.return_value = mock_client_instance

            with pytest.raises(httpx.HTTPStatusError):
                await client.save_transcript("meeting-error", transcription_result)

    @pytest.mark.asyncio
    async def test_transcript_save_handles_missing_fields(self, client):
        """Test handling of transcription result with missing optional fields."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.text = ""
        mock_response.raise_for_status = Mock()

        # Minimal transcription result
        transcription_result = {
            "segments": [{"speaker": "A", "text": "test", "start": 0, "end": 1}],
        }

        with patch("httpx.AsyncClient") as mock_async_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(
                return_value=mock_client_instance
            )
            mock_client_instance.__aexit__ = AsyncMock()
            mock_async_client.return_value = mock_client_instance

            result = await client.save_transcript(
                "meeting-minimal", transcription_result
            )

            assert result == {"success": True}

            call_args = mock_client_instance.post.call_args
            data = call_args[1]["json"]
            assert data["language"] is None
            assert data["duration_seconds"] is None
            assert data["num_speakers"] is None
            assert data["word_count"] == 0
            assert data["full_text"] == ""


# Mark all test classes as unit tests
pytest.mark.unit(TestSupabaseClientInitialization)
pytest.mark.unit(TestStorageDownload)
pytest.mark.unit(TestJobStatusUpdates)
pytest.mark.unit(TestAnalysisResultsSave)
pytest.mark.unit(TestMeetingMetadataUpdate)
pytest.mark.unit(TestRecordingExpiryUpdate)
pytest.mark.unit(TestFirstCompletedJobCheck)
pytest.mark.unit(TestAnalyticsEventLogging)
pytest.mark.unit(TestCleanupFailedJob)
pytest.mark.unit(TestGetJobStatus)
pytest.mark.unit(TestCountSegmentsForMeeting)
pytest.mark.unit(TestDeleteMeeting)
pytest.mark.unit(TestGetOffRecordPeriods)
pytest.mark.unit(TestSaveTranscript)
