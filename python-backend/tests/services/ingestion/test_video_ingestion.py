"""
Tests for video ingestion service.

Tests audio extraction from video files using ffmpeg, error handling, and
file cleanup.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.ingestion.video_ingestion import VideoIngestion


@pytest.fixture
def video_ingestion():
    """Create a VideoIngestion instance."""
    return VideoIngestion()


@pytest.fixture
def mock_video_file(tmp_path):
    """Create a mock video file."""
    video_file = tmp_path / "test.mp4"
    video_file.write_text("fake video content")
    return video_file


class TestAudioExtraction:
    """Test suite for audio extraction from video files."""

    @pytest.mark.asyncio
    async def test_successful_audio_extraction(self, video_ingestion, mock_video_file):
        """Test successful audio extraction from video."""
        audio_file = mock_video_file.with_suffix(".mp3")

        # Mock ffmpeg subprocess
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch(
            "asyncio.create_subprocess_exec", return_value=mock_process
        ) as mock_exec:
            # Mock audio stream detection to return 1 stream
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                # Create the audio file to simulate ffmpeg output
                audio_file.write_text("fake audio content")

                result = await video_ingestion.extract_audio("job-123", mock_video_file)

                # Verify ffmpeg was called with correct arguments
                # Note: for single stream, should be called twice (ffprobe + ffmpeg)
                assert mock_exec.call_count >= 1
                args = mock_exec.call_args[0]
                assert args[0] == "ffmpeg"
                assert "-i" in args
                assert str(mock_video_file) in args
                assert "-vn" in args
                assert "-acodec" in args
                assert "libmp3lame" in args

                # Verify audio file path is returned
                assert result == audio_file
                assert result.exists()

    @pytest.mark.asyncio
    async def test_audio_file_has_mp3_extension(self, video_ingestion, mock_video_file):
        """Test that extracted audio file has .mp3 extension."""
        audio_file = mock_video_file.with_suffix(".mp3")

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                audio_file.write_text("fake audio")

                result = await video_ingestion.extract_audio("job-456", mock_video_file)

                assert result.suffix == ".mp3"
                assert result.stem == mock_video_file.stem

    @pytest.mark.asyncio
    async def test_ffmpeg_quality_settings(self, video_ingestion, mock_video_file):
        """Test that ffmpeg is called with correct quality settings."""
        audio_file = mock_video_file.with_suffix(".mp3")

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch(
            "asyncio.create_subprocess_exec", return_value=mock_process
        ) as mock_exec:
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                audio_file.write_text("fake audio")

                await video_ingestion.extract_audio("job-quality", mock_video_file)

                args = mock_exec.call_args[0]
                # Check quality settings
                assert "-q:a" in args
                assert "2" in args  # High quality
                assert "-y" in args  # Overwrite


class TestFFmpegErrors:
    """Test suite for ffmpeg error handling."""

    @pytest.mark.asyncio
    async def test_ffmpeg_not_found_raises_exception(
        self, video_ingestion, mock_video_file
    ):
        """Test that missing ffmpeg raises appropriate exception."""
        with patch("asyncio.create_subprocess_exec", side_effect=FileNotFoundError()):
            with pytest.raises(Exception, match="ffmpeg not found"):
                await video_ingestion.extract_audio("job-no-ffmpeg", mock_video_file)

    @pytest.mark.asyncio
    async def test_ffmpeg_failure_raises_exception(
        self, video_ingestion, mock_video_file
    ):
        """Test that ffmpeg failure raises exception."""
        mock_process = MagicMock()
        mock_process.returncode = 1  # Non-zero return code
        mock_process.communicate = AsyncMock(
            return_value=(b"", b"Error: Invalid input file")
        )

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with pytest.raises(Exception, match="Audio extraction failed"):
                await video_ingestion.extract_audio("job-ffmpeg-fail", mock_video_file)

    @pytest.mark.asyncio
    async def test_ffmpeg_error_message_included(
        self, video_ingestion, mock_video_file
    ):
        """Test that ffmpeg error messages are included in exception."""
        error_message = "Codec not supported"

        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_process.communicate = AsyncMock(return_value=(b"", error_message.encode()))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with pytest.raises(Exception) as exc_info:
                await video_ingestion.extract_audio("job-codec", mock_video_file)

            assert error_message in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_missing_output_file_raises_exception(
        self, video_ingestion, mock_video_file
    ):
        """Test that missing output file raises exception."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                # Don't create audio file - simulate ffmpeg not creating output
                with pytest.raises(Exception, match="Audio file was not created"):
                    await video_ingestion.extract_audio(
                        "job-no-output", mock_video_file
                    )


class TestFileCleanup:
    """Test suite for file cleanup on errors."""

    @pytest.mark.asyncio
    async def test_partial_audio_file_cleaned_up_on_error(
        self, video_ingestion, mock_video_file
    ):
        """Test that partial audio files are cleaned up on error."""
        audio_file = mock_video_file.with_suffix(".mp3")
        audio_file.write_text("partial audio")

        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_process.communicate = AsyncMock(return_value=(b"", b"Error"))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with pytest.raises(Exception):
                await video_ingestion.extract_audio("job-cleanup", mock_video_file)

            # Verify partial file was deleted
            assert not audio_file.exists()

    @pytest.mark.asyncio
    async def test_cleanup_on_generic_exception(self, video_ingestion, mock_video_file):
        """Test cleanup happens on any exception."""
        audio_file = mock_video_file.with_suffix(".mp3")
        audio_file.write_text("partial audio")

        with patch(
            "asyncio.create_subprocess_exec",
            side_effect=Exception("Unexpected error"),
        ):
            with pytest.raises(Exception, match="Unexpected error"):
                await video_ingestion.extract_audio("job-generic", mock_video_file)

            # Verify partial file was deleted
            assert not audio_file.exists()


class TestLoggingOutput:
    """Test suite for logging output."""

    @pytest.mark.asyncio
    async def test_logs_extraction_start(
        self, video_ingestion, mock_video_file, caplog
    ):
        """Test that extraction start is logged."""
        import logging

        caplog.set_level(logging.INFO)
        audio_file = mock_video_file.with_suffix(".mp3")

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                audio_file.write_text("fake audio")

                await video_ingestion.extract_audio("job-log", mock_video_file)

                assert "Extracting audio from video" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_ffmpeg_command(self, video_ingestion, mock_video_file, caplog):
        """Test that ffmpeg command is logged."""
        import logging

        caplog.set_level(logging.INFO)
        audio_file = mock_video_file.with_suffix(".mp3")

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                audio_file.write_text("fake audio")

                await video_ingestion.extract_audio("job-cmd", mock_video_file)

                assert "Running ffmpeg command" in caplog.text
                assert "ffmpeg" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_success_with_file_size(
        self, video_ingestion, mock_video_file, caplog
    ):
        """Test that success is logged with file size."""
        import logging

        caplog.set_level(logging.INFO)
        audio_file = mock_video_file.with_suffix(".mp3")

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            with patch.object(video_ingestion, "_detect_audio_streams", return_value=1):
                audio_file.write_text("fake audio content")

                await video_ingestion.extract_audio("job-size", mock_video_file)

                assert "Audio extracted successfully" in caplog.text
                assert "MB" in caplog.text


# Mark all test classes as unit tests
pytest.mark.unit(TestAudioExtraction)
pytest.mark.unit(TestFFmpegErrors)
pytest.mark.unit(TestFileCleanup)
pytest.mark.unit(TestLoggingOutput)
