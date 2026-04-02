"""
Shared pytest fixtures for all tests.

Fixtures defined here are automatically available to all test files.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.analysis.analysis_orchestrator import AnalysisOrchestrator


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    """
    Make all tenacity retries instant for faster tests.

    This patches sleep functions so tests don't wait between retries,
    making retry tests run in milliseconds instead of seconds.
    """
    # Patch both sync and async sleep to be instant
    import asyncio
    import time

    async def mock_async_sleep(seconds):
        pass  # No actual sleep

    def mock_sleep(seconds):
        pass  # No actual sleep

    monkeypatch.setattr(asyncio, "sleep", mock_async_sleep)
    monkeypatch.setattr(time, "sleep", mock_sleep)


@pytest.fixture
def metrics_analyzer():
    """
    Provide an AnalysisOrchestrator instance for testing with mocked LLM dependencies.

    Returns:
        AnalysisOrchestrator: Fresh analyzer instance with mocked external services

    Example:
        def test_analysis(metrics_analyzer):
            result = await metrics_analyzer.analyze("job-123", transcription)
            assert result["A"]["word_count"] == 10
    """
    # Mock the LLM dependencies to avoid external API calls during tests
    with patch(
        "app.services.analysis.analysis_orchestrator.LangfuseClient"
    ) as mock_langfuse, patch(
        "app.services.analysis.analysis_orchestrator.GeminiProvider"
    ) as mock_gemini, patch(
        "app.services.analysis.analysis_orchestrator.LLMOrchestrator"
    ) as mock_llm_orch:

        # Configure mocks
        mock_langfuse.return_value.flush = MagicMock()
        mock_gemini.return_value.generate_general_analysis = AsyncMock(
            return_value={
                "general_overview": "A collaborative team meeting",
                "tips": ["Mock tip 1", "Mock tip 2"],
            }
        )
        mock_llm_orch.return_value.analyze_all = AsyncMock(
            return_value=MagicMock(
                to_dict=lambda: {
                    "clarity_score": 8.0,
                    "confidence_score": 7.5,
                    "collaboration_score": 9.0,
                    "attunement_score": 8.5,
                }
            )
        )

        # Create the analyzer with mocked dependencies
        analyzer = AnalysisOrchestrator()
        yield analyzer


@pytest.fixture
def mock_transcription():
    """
    Provide a basic mock AssemblyAI transcription result with 2 speakers.

    Returns:
        dict: Mock transcription with segments

    Example:
        def test_with_transcription(mock_transcription):
            # Transcription has Speaker A and B
            assert len(mock_transcription["segments"]) == 2
    """
    return {
        "segments": [
            {
                "speaker": "A",
                "text": "Hello world",
                "start": 0,
                "end": 1,
            },
            {
                "speaker": "B",
                "text": "Hi there friend",
                "start": 1,
                "end": 2,
            },
        ]
    }


@pytest.fixture
def mock_meeting_data():
    """
    Provide mock meeting database record.

    Returns:
        dict: Mock meeting data

    Example:
        def test_with_meeting(mock_meeting_data):
            assert mock_meeting_data["id"] == "test-meeting-123"
    """
    return {
        "id": "test-meeting-123",
        "user_id": "test-user-456",
        "title": "Test Meeting",
        "duration_seconds": 3600,
        "meeting_type": "one_on_one",
        "status": "completed",
    }


@pytest.fixture
def mock_speaker_stats():
    """
    Provide mock speaker statistics output.

    Returns:
        dict: Mock speaker stats with metrics

    Example:
        def test_with_stats(mock_speaker_stats):
            assert mock_speaker_stats["A"]["word_count"] == 50
    """
    return {
        "A": {
            "word_count": 50,
            "segments": 5,
            "total_speaking_time": 120.5,
        },
        "B": {
            "word_count": 75,
            "segments": 8,
            "total_speaking_time": 180.0,
        },
    }
