"""
Tests for audio ingestion service.

Tests audio file transcription, speaker diarization, error handling, and
validation.
"""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from app.services.ingestion.audio_ingestion import AudioIngestion


@pytest.fixture
def audio_ingestion():
    """Create an AudioIngestion instance."""
    return AudioIngestion()


@pytest.fixture
def mock_audio_file(tmp_path):
    """Create a mock audio file."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_text("fake audio content")
    return audio_file


class TestTranscription:
    """Test suite for audio transcription."""

    @pytest.mark.asyncio
    async def test_successful_transcription(self, audio_ingestion, mock_audio_file):
        """Test successful audio transcription with speaker diarization."""
        mock_result = {
            "text": "Hello world",
            "segments": [{"start": 0, "end": 2, "speaker": "A", "text": "Hello world"}],
            "duration": 2.0,
            "num_speakers": 1,
        }

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=mock_result)

            result = await audio_ingestion.transcribe("job-123", mock_audio_file)

            # Verify transcription service was called
            mock_service.transcribe.assert_called_once_with(
                mock_audio_file, is_priority=False
            )

            # Verify result
            assert result == mock_result
            assert result["text"] == "Hello world"
            assert result["num_speakers"] == 1

    @pytest.mark.asyncio
    async def test_transcription_with_multiple_speakers(
        self, audio_ingestion, mock_audio_file
    ):
        """Test transcription with multiple speakers."""
        mock_result = {
            "text": "Speaker A talks. Speaker B responds.",
            "segments": [
                {"start": 0, "end": 2, "speaker": "A", "text": "Speaker A talks."},
                {"start": 2, "end": 4, "speaker": "B", "text": "Speaker B responds."},
            ],
            "duration": 4.0,
            "num_speakers": 2,
        }

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=mock_result)

            result = await audio_ingestion.transcribe("job-multi", mock_audio_file)

            assert result["num_speakers"] == 2
            assert len(result["segments"]) == 2

    @pytest.mark.asyncio
    async def test_transcription_includes_all_fields(
        self, audio_ingestion, mock_audio_file
    ):
        """Test that transcription result includes all expected fields."""
        mock_result = {
            "text": "Complete transcript",
            "segments": [],
            "duration": 10.5,
            "num_speakers": 1,
        }

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=mock_result)

            result = await audio_ingestion.transcribe("job-fields", mock_audio_file)

            assert "text" in result
            assert "segments" in result
            assert "duration" in result
            assert "num_speakers" in result


class TestFileValidation:
    """Test suite for file validation."""

    @pytest.mark.asyncio
    async def test_missing_file_raises_error(self, audio_ingestion):
        """Test that missing audio file raises FileNotFoundError."""
        missing_file = Path("/nonexistent/audio.mp3")

        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            await audio_ingestion.transcribe("job-missing", missing_file)

    @pytest.mark.asyncio
    async def test_file_existence_checked_before_transcription(
        self, audio_ingestion, tmp_path
    ):
        """Test that file existence is validated before calling service."""
        missing_file = tmp_path / "missing.mp3"

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock()

            with pytest.raises(FileNotFoundError):
                await audio_ingestion.transcribe("job-validate", missing_file)

            # Transcription service should not be called
            mock_service.transcribe.assert_not_called()


class TestTranscriptionErrors:
    """Test suite for transcription error handling."""

    @pytest.mark.asyncio
    async def test_transcription_error_raises_exception(
        self, audio_ingestion, mock_audio_file
    ):
        """Test that transcription errors are raised as exceptions."""
        error_result = {"error": "Transcription service unavailable"}

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=error_result)

            with pytest.raises(Exception, match="Transcription failed"):
                await audio_ingestion.transcribe("job-error", mock_audio_file)

    @pytest.mark.asyncio
    async def test_error_message_included_in_exception(
        self, audio_ingestion, mock_audio_file
    ):
        """Test that error messages are included in raised exception."""
        error_result = {"error": "Invalid audio format"}

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=error_result)

            with pytest.raises(Exception) as exc_info:
                await audio_ingestion.transcribe("job-msg", mock_audio_file)

            assert "Invalid audio format" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_empty_result_raises_exception(
        self, audio_ingestion, mock_audio_file
    ):
        """Test that empty transcription result raises exception."""
        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=None)

            with pytest.raises(AttributeError, match="'NoneType' object"):
                await audio_ingestion.transcribe("job-empty", mock_audio_file)


class TestLogging:
    """Test suite for logging output."""

    @pytest.mark.asyncio
    async def test_logs_file_size(self, audio_ingestion, mock_audio_file, caplog):
        """Test that audio file size is logged."""
        import logging

        caplog.set_level(logging.INFO)

        mock_result = {
            "text": "Test",
            "segments": [],
            "duration": 1.0,
            "num_speakers": 1,
        }

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=mock_result)

            await audio_ingestion.transcribe("job-log", mock_audio_file)

            assert "Processing audio file" in caplog.text
            assert "MB" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_transcription_start(
        self, audio_ingestion, mock_audio_file, caplog
    ):
        """Test that transcription start is logged."""
        import logging

        caplog.set_level(logging.INFO)

        mock_result = {
            "text": "Test",
            "segments": [],
            "duration": 1.0,
            "num_speakers": 1,
        }

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=mock_result)

            await audio_ingestion.transcribe("job-start", mock_audio_file)

            assert "Starting transcription with speaker diarization" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_completion_with_stats(
        self, audio_ingestion, mock_audio_file, caplog
    ):
        """Test that completion is logged with speaker/segment stats."""
        import logging

        caplog.set_level(logging.INFO)

        mock_result = {
            "text": "Test transcript",
            "segments": [
                {"speaker": "A", "text": "Part 1"},
                {"speaker": "B", "text": "Part 2"},
            ],
            "duration": 5.0,
            "num_speakers": 2,
        }

        with patch(
            "app.services.ingestion.audio_ingestion.TranscriptionService"
        ) as MockService:
            mock_service = MockService.return_value
            mock_service.transcribe = AsyncMock(return_value=mock_result)

            await audio_ingestion.transcribe("job-stats", mock_audio_file)

            assert "Transcription complete" in caplog.text
            assert "Speakers: 2" in caplog.text
            assert "Segments: 2" in caplog.text


# Mark all test classes as unit tests
pytest.mark.unit(TestTranscription)
pytest.mark.unit(TestFileValidation)
pytest.mark.unit(TestTranscriptionErrors)
pytest.mark.unit(TestLogging)
