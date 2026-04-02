"""
Tests for LLM validation retry logic.

Verifies that analyzers retry once on validation errors but fail fast
on other types of errors to avoid wasting API costs.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.analysis.llm.llm_analyzer import (
    LLMScoreValidationError,
    validate_llm_score,
)
from app.services.analysis.llm.analyzers import ClarityAnalyzer
from app.services.analysis.llm.providers.gemini import GeminiProvider


class TestValidationRetryLogic:
    """Tests for validation-aware retry logic."""

    @pytest.mark.asyncio
    async def test_pillar_analyzer_retries_once_on_validation_error(self):
        """Test that pillar analyzers retry once on validation errors."""
        # Mock LLM provider
        mock_provider = AsyncMock()

        # First call returns invalid response (missing score)
        # Second call returns valid response
        mock_provider.generate_structured_json = AsyncMock(
            side_effect=[
                {
                    "explanation": "Test",
                    "score": "not an int",
                },  # Invalid (string score)
                {"score": 8, "explanation": "Clear communication"},  # Valid
            ]
        )

        # Create analyzer
        analyzer = ClarityAnalyzer(llm_provider=mock_provider, langfuse_client=None)

        # Run analysis
        result = await analyzer.analyze(
            speaker_label="Speaker A",
            transcript_text="Hello world",
            talk_time_percentage=50.0,
            word_count=10,
            meeting_duration_minutes=30.0,
            total_speakers=2,
            filler_words_per_minute=0.5,
        )

        # Should succeed on retry
        assert result.score == 8
        assert result.explanation == "Clear communication"

        # Should have been called twice (1 initial + 1 retry)
        assert mock_provider.generate_structured_json.call_count == 2

    @pytest.mark.asyncio
    async def test_pillar_analyzer_fails_after_three_validation_errors(self):
        """Test that pillar analyzers fail after 3 validation errors."""
        # Mock LLM provider
        mock_provider = AsyncMock()

        # All three calls return invalid responses
        mock_provider.generate_structured_json = AsyncMock(
            side_effect=[
                {"explanation": "Test"},  # Invalid (missing score)
                {"score": 8},  # Invalid (missing explanation)
                {
                    "score": "not an int",
                    "explanation": "Test",
                },  # Invalid (string score)
            ]
        )

        # Create analyzer
        analyzer = ClarityAnalyzer(llm_provider=mock_provider, langfuse_client=None)

        # Run analysis - should fail after 3 attempts
        with pytest.raises(LLMScoreValidationError):
            await analyzer.analyze(
                speaker_label="Speaker A",
                transcript_text="Hello world",
                talk_time_percentage=50.0,
                word_count=10,
                meeting_duration_minutes=30.0,
                total_speakers=2,
                filler_words_per_minute=0.5,
            )

        # Should have been called three times (1 initial + 2 retries)
        assert mock_provider.generate_structured_json.call_count == 3

    @pytest.mark.asyncio
    async def test_pillar_analyzer_fails_fast_on_api_errors(self):
        """Test that pillar analyzers fail immediately on API errors (no retry)."""
        # Mock LLM provider that raises API error
        mock_provider = AsyncMock()
        mock_provider.generate_structured_json = AsyncMock(
            side_effect=Exception("Gemini API error")
        )

        # Create analyzer
        analyzer = ClarityAnalyzer(llm_provider=mock_provider, langfuse_client=None)

        # Run analysis - should fail immediately
        with pytest.raises(Exception, match="Failed to analyze Clarity"):
            await analyzer.analyze(
                speaker_label="Speaker A",
                transcript_text="Hello world",
                talk_time_percentage=50.0,
                word_count=10,
                meeting_duration_minutes=30.0,
                total_speakers=2,
                filler_words_per_minute=0.5,
            )

        # Should have been called only once (no retry for API errors)
        assert mock_provider.generate_structured_json.call_count == 1

    @pytest.mark.asyncio
    async def test_general_analysis_retries_once_on_validation_error(self):
        """Test that general analysis retries once on validation errors."""
        with patch(
            "app.services.analysis.llm.providers.gemini.GeminiProvider._get_client"
        ) as mock_get_client, patch(
            "app.services.analysis.llm.providers.gemini.asyncio.Semaphore"
        ):
            # Mock Gemini client
            mock_genai = MagicMock()
            mock_model = MagicMock()
            mock_response = MagicMock()

            # First call returns invalid JSON (missing tips)
            # Second call returns valid JSON
            mock_response.text = '{"general_overview": "A test meeting"}'
            mock_response_valid = MagicMock()
            mock_response_valid.text = (
                '{"general_overview": "A test meeting", "tips": ["Tip 1"]}'
            )

            mock_model.generate_content = MagicMock(
                side_effect=[mock_response, mock_response_valid]
            )
            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            # Create provider
            provider = GeminiProvider(api_key="test-key")

            # Run analysis
            result = await provider.generate_general_analysis(
                speaker_label="Speaker A",
                full_transcript="Test transcript",
                clarity_explanation="Clear",
                confidence_explanation="Confident",
                attunement_explanation="Attuned",
            )

            # Should succeed on retry
            assert result["general_overview"] == "A test meeting"
            assert len(result["tips"]) == 1

            # Should have been called twice (1 initial + 1 retry)
            assert mock_model.generate_content.call_count == 2

    @pytest.mark.asyncio
    async def test_general_analysis_fails_after_two_validation_errors(self):
        """Test that general analysis fails after 2 validation errors."""
        with patch(
            "app.services.analysis.llm.providers.gemini.GeminiProvider._get_client"
        ) as mock_get_client, patch(
            "app.services.analysis.llm.providers.gemini.asyncio.Semaphore"
        ):
            # Mock Gemini client
            mock_genai = MagicMock()
            mock_model = MagicMock()

            # Both calls return invalid JSON (missing tips)
            mock_response = MagicMock()
            mock_response.text = '{"general_overview": "A test meeting"}'
            mock_model.generate_content = MagicMock(return_value=mock_response)

            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            # Create provider
            provider = GeminiProvider(api_key="test-key")

            # Run analysis - should fail after 2 attempts
            with pytest.raises(
                Exception, match="Failed to generate valid general analysis"
            ):
                await provider.generate_general_analysis(
                    speaker_label="Speaker A",
                    full_transcript="Test transcript",
                    clarity_explanation="Clear",
                    confidence_explanation="Confident",
                    attunement_explanation="Attuned",
                )

            # Should have been called twice (1 initial + 1 retry)
            assert mock_model.generate_content.call_count == 2

    def test_validate_llm_score_catches_invalid_types(self):
        """Test that validation catches various invalid response types."""
        # Test missing score
        with pytest.raises(LLMScoreValidationError, match="Missing 'score' field"):
            validate_llm_score({"explanation": "Test"}, "TestDimension")

        # Test score not an integer
        with pytest.raises(LLMScoreValidationError, match="Score must be an integer"):
            validate_llm_score({"score": "8", "explanation": "Test"}, "TestDimension")

        # Test score out of range (too low)
        with pytest.raises(
            LLMScoreValidationError, match="Score must be between 1 and 10"
        ):
            validate_llm_score({"score": 0, "explanation": "Test"}, "TestDimension")

        # Test score out of range (too high)
        with pytest.raises(
            LLMScoreValidationError, match="Score must be between 1 and 10"
        ):
            validate_llm_score({"score": 11, "explanation": "Test"}, "TestDimension")

        # Test missing explanation
        with pytest.raises(
            LLMScoreValidationError, match="Missing 'explanation' field"
        ):
            validate_llm_score({"score": 8}, "TestDimension")

        # Test empty explanation
        with pytest.raises(
            LLMScoreValidationError, match="Explanation cannot be empty"
        ):
            validate_llm_score({"score": 8, "explanation": ""}, "TestDimension")

        # Test explanation not a string
        with pytest.raises(
            LLMScoreValidationError, match="Explanation must be a string"
        ):
            validate_llm_score({"score": 8, "explanation": 123}, "TestDimension")

    def test_validate_general_analysis_catches_invalid_responses(self):
        """Test that general analysis validation catches various invalid responses."""
        # Create provider instance
        provider = GeminiProvider(api_key="test-key")

        # Test missing general_overview
        with pytest.raises(ValueError, match="missing required 'general_overview'"):
            provider._validate_general_analysis_response({"tips": ["Tip 1"]})

        # Test empty general_overview
        with pytest.raises(ValueError, match="'general_overview' cannot be empty"):
            provider._validate_general_analysis_response(
                {"general_overview": "", "tips": ["Tip 1"]}
            )

        # Test missing tips
        with pytest.raises(ValueError, match="missing required 'tips'"):
            provider._validate_general_analysis_response(
                {"general_overview": "Test meeting"}
            )

        # Test tips not a list
        with pytest.raises(ValueError, match="'tips' must be a list"):
            provider._validate_general_analysis_response(
                {"general_overview": "Test meeting", "tips": "Tip 1"}
            )

        # Test too many tips
        with pytest.raises(ValueError, match="'tips' must contain 1-3 items"):
            provider._validate_general_analysis_response(
                {
                    "general_overview": "Test meeting",
                    "tips": ["Tip 1", "Tip 2", "Tip 3", "Tip 4"],
                }
            )

        # Test empty tips list
        with pytest.raises(ValueError, match="'tips' must contain 1-3 items"):
            provider._validate_general_analysis_response(
                {"general_overview": "Test meeting", "tips": []}
            )

        # Test tip not a string
        with pytest.raises(ValueError, match="tip\\[0\\] must be a string"):
            provider._validate_general_analysis_response(
                {"general_overview": "Test meeting", "tips": [123]}
            )

        # Test empty tip
        with pytest.raises(ValueError, match="tip\\[0\\] cannot be empty"):
            provider._validate_general_analysis_response(
                {"general_overview": "Test meeting", "tips": [""]}
            )

        # Test valid responses pass
        provider._validate_general_analysis_response(
            {"general_overview": "Test meeting", "tips": ["Tip 1", "Tip 2"]}
        )  # Should not raise
        provider._validate_general_analysis_response(
            {"general_overview": "Test meeting", "tips": ["Tip 1", "Tip 2", "Tip 3"]}
        )  # Should not raise (now accepts 3 tips)
