"""
Tests for transcription service.

Tests AssemblyAI integration, speaker diarization, language support, and error
handling.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.ingestion.transcription.transcription_service import (
    TranscriptionService,
)


@pytest.fixture
def mock_audio_file(tmp_path):
    """Create a mock audio file."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_text("fake audio")
    return audio_file


class TestServiceInitialization:
    """Test suite for service initialization."""

    def test_initialization_with_api_key(self):
        """Test initialization with explicit API key."""
        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            service = TranscriptionService(api_key="test-api-key")

            assert service.api_key == "test-api-key"
            MockProvider.assert_called_once_with(api_key="test-api-key")

    def test_initialization_from_environment(self, monkeypatch):
        """Test initialization from ASSEMBLYAI_API_KEY environment variable."""
        monkeypatch.setenv("ASSEMBLYAI_API_KEY", "env-api-key")

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ):
            service = TranscriptionService()

            assert service.api_key == "env-api-key"

    def test_initialization_without_api_key_raises_error(self, monkeypatch):
        """Test that missing API key raises ValueError."""
        monkeypatch.delenv("ASSEMBLYAI_API_KEY", raising=False)

        with pytest.raises(ValueError, match="AssemblyAI API key not found"):
            TranscriptionService()


class TestTranscription:
    """Test suite for transcription functionality."""

    @pytest.mark.asyncio
    async def test_successful_transcription(self, mock_audio_file):
        """Test successful transcription with diarization."""
        mock_result = MagicMock()
        mock_result.text = "Hello world"
        mock_result.segments = [{"speaker": "A", "text": "Hello world"}]
        mock_result.speakers = ["A"]
        mock_result.language = "en"
        mock_result.duration = 2.0
        mock_result.num_speakers = 1

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(return_value=mock_result)

            service = TranscriptionService(api_key="test-key")
            result = await service.transcribe(mock_audio_file)

            # Verify provider was called
            mock_provider.transcribe.assert_called_once_with(
                audio_path=mock_audio_file,
                language=None,
                enable_diarization=True,
                min_speakers=None,
                max_speakers=None,
                is_priority=False,
            )

            # Verify result format
            assert result["text"] == "Hello world"
            assert result["num_speakers"] == 1
            assert "segments" in result
            assert "speakers" in result

    @pytest.mark.asyncio
    async def test_transcription_with_language(self, mock_audio_file):
        """Test transcription with specified language."""
        mock_result = MagicMock()
        mock_result.text = "Hola mundo"
        mock_result.segments = []
        mock_result.speakers = []
        mock_result.language = "es"
        mock_result.duration = 1.0
        mock_result.num_speakers = 0

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(return_value=mock_result)

            service = TranscriptionService(api_key="test-key")
            result = await service.transcribe(mock_audio_file, language="es")

            # Verify language was passed
            call_args = mock_provider.transcribe.call_args
            assert call_args.kwargs["language"] == "es"
            assert result["language"] == "es"

    @pytest.mark.asyncio
    async def test_transcription_with_speaker_limits(self, mock_audio_file):
        """Test transcription with speaker count limits."""
        mock_result = MagicMock()
        mock_result.text = "Test"
        mock_result.segments = []
        mock_result.speakers = ["A", "B"]
        mock_result.language = "en"
        mock_result.duration = 5.0
        mock_result.num_speakers = 2

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(return_value=mock_result)

            service = TranscriptionService(api_key="test-key")
            await service.transcribe(mock_audio_file, min_speakers=2, max_speakers=4)

            # Verify speaker limits were passed
            call_args = mock_provider.transcribe.call_args
            assert call_args.kwargs["min_speakers"] == 2
            assert call_args.kwargs["max_speakers"] == 4

    @pytest.mark.asyncio
    async def test_transcription_without_diarization(self, mock_audio_file):
        """Test transcription with diarization disabled."""
        mock_result = MagicMock()
        mock_result.text = "Simple transcript"
        mock_result.segments = []
        mock_result.speakers = []
        mock_result.language = "en"
        mock_result.duration = 3.0
        mock_result.num_speakers = 0

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(return_value=mock_result)

            service = TranscriptionService(api_key="test-key")
            await service.transcribe(mock_audio_file, enable_diarization=False)

            # Verify diarization was disabled
            call_args = mock_provider.transcribe.call_args
            assert call_args.kwargs["enable_diarization"] is False


class TestErrorHandling:
    """Test suite for error handling."""

    @pytest.mark.asyncio
    async def test_transcription_error_returns_error_dict(self, mock_audio_file):
        """Test that transcription errors are returned as dict with error key."""
        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(side_effect=Exception("API error"))

            service = TranscriptionService(api_key="test-key")
            result = await service.transcribe(mock_audio_file)

            # Verify error format
            assert "error" in result
            assert "API error" in result["error"]

    @pytest.mark.asyncio
    async def test_error_is_logged(self, mock_audio_file, caplog):
        """Test that transcription errors are logged."""
        import logging

        caplog.set_level(logging.ERROR)

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(
                side_effect=Exception("Connection failed")
            )

            service = TranscriptionService(api_key="test-key")
            await service.transcribe(mock_audio_file)

            assert "Transcription failed" in caplog.text
            assert "Connection failed" in caplog.text


class TestSynchronousWrapper:
    """Test suite for synchronous transcription wrapper."""

    def test_transcribe_with_words_sync_wrapper(self, mock_audio_file):
        """Test synchronous transcribe_with_words method."""
        mock_result = MagicMock()
        mock_result.text = "Sync test"
        mock_result.segments = []
        mock_result.speakers = []
        mock_result.language = "en"
        mock_result.duration = 1.0
        mock_result.num_speakers = 0

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(return_value=mock_result)

            service = TranscriptionService(api_key="test-key")
            result = service.transcribe_with_words(mock_audio_file)

            # Verify result
            assert result["text"] == "Sync test"

    def test_transcribe_with_words_uses_diarization(self, mock_audio_file):
        """Test that sync wrapper enables diarization by default."""
        mock_result = MagicMock()
        mock_result.text = "Test"
        mock_result.segments = []
        mock_result.speakers = []
        mock_result.language = "en"
        mock_result.duration = 1.0
        mock_result.num_speakers = 0

        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ) as MockProvider:
            mock_provider = MockProvider.return_value
            mock_provider.transcribe = AsyncMock(return_value=mock_result)

            service = TranscriptionService(api_key="test-key")
            service.transcribe_with_words(mock_audio_file, language="fr")

            # Verify diarization was enabled
            call_args = mock_provider.transcribe.call_args
            assert call_args.kwargs["enable_diarization"] is True


class TestLanguageSupport:
    """Test suite for language support."""

    def test_get_supported_languages(self):
        """Test that service returns list of supported languages."""
        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ):
            service = TranscriptionService(api_key="test-key")
            languages = service.get_supported_languages()

            # Verify common languages are included
            assert "en" in languages
            assert "es" in languages
            assert "fr" in languages
            assert "de" in languages
            assert "ja" in languages
            assert "zh" in languages

    def test_supported_languages_is_list(self):
        """Test that get_supported_languages returns a list."""
        with patch(
            "app.services.ingestion.transcription.transcription_service.AssemblyAIProvider"
        ):
            service = TranscriptionService(api_key="test-key")
            languages = service.get_supported_languages()

            assert isinstance(languages, list)
            assert len(languages) > 0


# Mark all test classes as unit tests
pytest.mark.unit(TestServiceInitialization)
pytest.mark.unit(TestTranscription)
pytest.mark.unit(TestErrorHandling)
pytest.mark.unit(TestSynchronousWrapper)
pytest.mark.unit(TestLanguageSupport)
