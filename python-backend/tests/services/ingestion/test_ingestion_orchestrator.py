"""
Tests for ingestion orchestrator.

Tests file type detection and routing to video/audio ingestion services.
"""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from app.services.ingestion.ingestion_orchestrator import (
    IngestionOrchestrator,
    detect_file_type,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
)


class TestFileTypeDetection:
    """Test suite for file type detection."""

    def test_detects_mp4_as_video(self):
        """Test detection of .mp4 files as video."""
        file_path = Path("/tmp/test.mp4")
        assert detect_file_type(file_path) == "video"

    def test_detects_mov_as_video(self):
        """Test detection of .mov files as video."""
        file_path = Path("/tmp/test.mov")
        assert detect_file_type(file_path) == "video"

    def test_detects_webm_as_video(self):
        """Test detection of .webm files as video."""
        file_path = Path("/tmp/test.webm")
        assert detect_file_type(file_path) == "video"

    def test_detects_avi_as_video(self):
        """Test detection of .avi files as video."""
        file_path = Path("/tmp/test.avi")
        assert detect_file_type(file_path) == "video"

    def test_detects_mkv_as_video(self):
        """Test detection of .mkv files as video."""
        file_path = Path("/tmp/test.mkv")
        assert detect_file_type(file_path) == "video"

    def test_detects_mp3_as_audio(self):
        """Test detection of .mp3 files as audio."""
        file_path = Path("/tmp/test.mp3")
        assert detect_file_type(file_path) == "audio"

    def test_detects_wav_as_audio(self):
        """Test detection of .wav files as audio."""
        file_path = Path("/tmp/test.wav")
        assert detect_file_type(file_path) == "audio"

    def test_detects_m4a_as_audio(self):
        """Test detection of .m4a files as audio."""
        file_path = Path("/tmp/test.m4a")
        assert detect_file_type(file_path) == "audio"

    def test_detects_aac_as_audio(self):
        """Test detection of .aac files as audio."""
        file_path = Path("/tmp/test.aac")
        assert detect_file_type(file_path) == "audio"

    def test_detects_flac_as_audio(self):
        """Test detection of .flac files as audio."""
        file_path = Path("/tmp/test.flac")
        assert detect_file_type(file_path) == "audio"

    def test_detects_ogg_as_audio(self):
        """Test detection of .ogg files as audio."""
        file_path = Path("/tmp/test.ogg")
        assert detect_file_type(file_path) == "audio"

    def test_case_insensitive_detection(self):
        """Test that file extension detection is case-insensitive."""
        assert detect_file_type(Path("/tmp/TEST.MP4")) == "video"
        assert detect_file_type(Path("/tmp/TEST.Mp4")) == "video"
        assert detect_file_type(Path("/tmp/test.MP3")) == "audio"
        assert detect_file_type(Path("/tmp/test.Mp3")) == "audio"

    def test_unsupported_extension_raises_error(self):
        """Test that unsupported file extensions raise ValueError."""
        with pytest.raises(ValueError, match="Unsupported file extension: .txt"):
            detect_file_type(Path("/tmp/test.txt"))

    def test_unsupported_video_format_raises_error(self):
        """Test that unsupported video formats raise ValueError."""
        with pytest.raises(ValueError, match="Unsupported file extension: .mpeg"):
            detect_file_type(Path("/tmp/test.mpeg"))


class TestIngestionOrchestrator:
    """Test suite for ingestion orchestrator routing logic."""

    @pytest.mark.asyncio
    async def test_video_ingestion_flow(self):
        """Test video ingestion flow: extract audio -> transcribe -> cleanup."""
        orchestrator = IngestionOrchestrator()

        # Mock video and audio ingestion services
        mock_audio_file = Path("/tmp/extracted.mp3")
        mock_transcript = {
            "text": "Test transcript",
            "segments": [],
            "duration": 120.0,
        }

        orchestrator.video_ingestion.extract_audio = AsyncMock(
            return_value=mock_audio_file
        )
        orchestrator.audio_ingestion.transcribe = AsyncMock(
            return_value=mock_transcript
        )

        # Mock file cleanup
        with patch.object(Path, "unlink") as mock_unlink:
            video_file = Path("/tmp/test.mp4")
            result = await orchestrator.ingest("job-123", video_file)

            # Verify audio extraction was called
            orchestrator.video_ingestion.extract_audio.assert_called_once_with(
                "job-123", video_file
            )

            # Verify transcription was called with extracted audio
            orchestrator.audio_ingestion.transcribe.assert_called_once_with(
                "job-123", mock_audio_file, is_priority=False
            )

            # Verify cleanup was called
            mock_unlink.assert_called_once()

            # Verify result
            assert result == mock_transcript

    @pytest.mark.asyncio
    async def test_audio_ingestion_flow(self):
        """Test direct audio ingestion flow: transcribe without extraction."""
        orchestrator = IngestionOrchestrator()

        mock_transcript = {
            "text": "Test transcript",
            "segments": [],
            "duration": 60.0,
        }

        orchestrator.audio_ingestion.transcribe = AsyncMock(
            return_value=mock_transcript
        )

        audio_file = Path("/tmp/test.mp3")
        result = await orchestrator.ingest("job-456", audio_file)

        # Verify transcription was called directly
        orchestrator.audio_ingestion.transcribe.assert_called_once_with(
            "job-456", audio_file, is_priority=False
        )

        # Verify extract_audio was never called (no video processing needed)
        # (extract_audio is not a mock in this test, so we can't check call_count)

        # Verify result
        assert result == mock_transcript

    @pytest.mark.asyncio
    async def test_unsupported_file_type_raises_error(self):
        """Test that unsupported file types raise ValueError."""
        orchestrator = IngestionOrchestrator()
        unsupported_file = Path("/tmp/test.pdf")

        with pytest.raises(ValueError, match="Unsupported file extension"):
            await orchestrator.ingest("job-789", unsupported_file)

    @pytest.mark.asyncio
    async def test_audio_cleanup_failure_does_not_block(self):
        """Test that audio cleanup failure doesn't block video ingestion."""
        orchestrator = IngestionOrchestrator()

        mock_audio_file = Path("/tmp/extracted.mp3")
        mock_transcript = {"text": "Test", "segments": [], "duration": 30.0}

        orchestrator.video_ingestion.extract_audio = AsyncMock(
            return_value=mock_audio_file
        )
        orchestrator.audio_ingestion.transcribe = AsyncMock(
            return_value=mock_transcript
        )

        # Mock file cleanup to raise exception
        with patch.object(Path, "unlink", side_effect=OSError("Permission denied")):
            video_file = Path("/tmp/test.mov")
            # Should not raise despite cleanup failure
            result = await orchestrator.ingest("job-cleanup", video_file)

            # Should still return transcript
            assert result == mock_transcript

    @pytest.mark.asyncio
    async def test_extraction_failure_propagates(self):
        """Test that audio extraction failure is propagated."""
        orchestrator = IngestionOrchestrator()

        orchestrator.video_ingestion.extract_audio = AsyncMock(
            side_effect=Exception("ffmpeg not found")
        )

        video_file = Path("/tmp/test.mp4")

        with pytest.raises(Exception, match="ffmpeg not found"):
            await orchestrator.ingest("job-fail", video_file)

    @pytest.mark.asyncio
    async def test_transcription_failure_propagates(self):
        """Test that transcription failure is propagated."""
        orchestrator = IngestionOrchestrator()

        orchestrator.audio_ingestion.transcribe = AsyncMock(
            side_effect=Exception("Transcription API error")
        )

        audio_file = Path("/tmp/test.mp3")

        with pytest.raises(Exception, match="Transcription API error"):
            await orchestrator.ingest("job-trans-fail", audio_file)

    @pytest.mark.asyncio
    async def test_all_video_extensions_handled(self):
        """Test that all supported video extensions are handled correctly."""
        orchestrator = IngestionOrchestrator()

        mock_audio_file = Path("/tmp/extracted.mp3")
        mock_transcript = {"text": "Test", "segments": []}

        orchestrator.video_ingestion.extract_audio = AsyncMock(
            return_value=mock_audio_file
        )
        orchestrator.audio_ingestion.transcribe = AsyncMock(
            return_value=mock_transcript
        )

        with patch.object(Path, "unlink"):
            for ext in VIDEO_EXTENSIONS:
                video_file = Path(f"/tmp/test{ext}")
                result = await orchestrator.ingest(f"job-{ext}", video_file)
                assert result == mock_transcript

    @pytest.mark.asyncio
    async def test_all_audio_extensions_handled(self):
        """Test that all supported audio extensions are handled correctly."""
        orchestrator = IngestionOrchestrator()

        mock_transcript = {"text": "Test", "segments": []}
        orchestrator.audio_ingestion.transcribe = AsyncMock(
            return_value=mock_transcript
        )

        for ext in AUDIO_EXTENSIONS:
            audio_file = Path(f"/tmp/test{ext}")
            result = await orchestrator.ingest(f"job-{ext}", audio_file)
            assert result == mock_transcript


# Mark all test classes as unit tests
pytest.mark.unit(TestFileTypeDetection)
pytest.mark.unit(TestIngestionOrchestrator)
