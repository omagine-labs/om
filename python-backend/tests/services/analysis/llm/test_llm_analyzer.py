"""
Tests for LLM analyzer and orchestrator.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.analysis.llm.llm_analyzer import (
    BaseLLMAnalyzer,
    LLMAnalysisResult,
    LLMOrchestrator,
    LLMOrchestrationResult,
    validate_llm_score,
    LLMScoreValidationError,
)


# =============================================================================
# Validation Tests
# =============================================================================


class TestValidateLLMScore:
    """Test suite for validate_llm_score function."""

    def test_valid_score(self):
        """Test validation passes for valid score."""
        result = {"score": 7, "explanation": "Good communication clarity"}
        validated = validate_llm_score(result, "Clarity")

        assert validated == result
        assert validated["score"] == 7
        assert validated["explanation"] == "Good communication clarity"

    def test_valid_score_boundary_min(self):
        """Test validation passes for minimum valid score."""
        result = {"score": 1, "explanation": "Poor clarity"}
        validated = validate_llm_score(result, "Clarity")

        assert validated["score"] == 1

    def test_valid_score_boundary_max(self):
        """Test validation passes for maximum valid score."""
        result = {"score": 10, "explanation": "Excellent clarity"}
        validated = validate_llm_score(result, "Clarity")

        assert validated["score"] == 10

    def test_invalid_not_dict(self):
        """Test validation fails if result is not a dictionary."""
        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score("not a dict", "Clarity")

        assert "must be a dictionary" in str(exc_info.value)

    def test_invalid_missing_score(self):
        """Test validation fails if score is missing."""
        result = {"explanation": "Good clarity"}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "Missing 'score' field" in str(exc_info.value)

    def test_invalid_score_not_integer(self):
        """Test validation fails if score is not an integer."""
        result = {"score": "7", "explanation": "Good clarity"}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "must be an integer" in str(exc_info.value)

    def test_invalid_score_too_low(self):
        """Test validation fails if score is below 1."""
        result = {"score": 0, "explanation": "Poor clarity"}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "must be between 1 and 10" in str(exc_info.value)

    def test_invalid_score_too_high(self):
        """Test validation fails if score is above 10."""
        result = {"score": 11, "explanation": "Excellent clarity"}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "must be between 1 and 10" in str(exc_info.value)

    def test_invalid_missing_explanation(self):
        """Test validation fails if explanation is missing."""
        result = {"score": 7}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "Missing 'explanation' field" in str(exc_info.value)

    def test_invalid_explanation_not_string(self):
        """Test validation fails if explanation is not a string."""
        result = {"score": 7, "explanation": 123}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "must be a string" in str(exc_info.value)

    def test_invalid_explanation_empty(self):
        """Test validation fails if explanation is empty."""
        result = {"score": 7, "explanation": ""}

        with pytest.raises(LLMScoreValidationError) as exc_info:
            validate_llm_score(result, "Clarity")

        assert "cannot be empty" in str(exc_info.value)


# =============================================================================
# Base Analyzer Tests
# =============================================================================


# Mock concrete analyzer for testing
class MockLLMAnalyzer(BaseLLMAnalyzer):
    """Mock analyzer for testing."""

    @property
    def dimension_name(self) -> str:
        return "TestDimension"

    @property
    def prompt_name(self) -> str:
        return "test-dimension"

    def _build_fallback_prompt(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> str:
        return f"Test prompt for {speaker_label}"


class TestBaseLLMAnalyzer:
    """Test suite for BaseLLMAnalyzer."""

    @pytest.fixture
    def mock_llm_provider(self):
        """Create mock LLM provider."""
        provider = AsyncMock()
        provider.generate_structured_json = AsyncMock(
            return_value={"score": 8, "explanation": "Great communication"}
        )
        return provider

    @pytest.fixture
    def mock_langfuse_client(self):
        """Create mock Langfuse client."""
        client = MagicMock()
        client.is_enabled.return_value = False
        client.get_prompt.return_value = None
        return client

    @pytest.fixture
    def analyzer(self, mock_llm_provider, mock_langfuse_client):
        """Create analyzer instance."""
        return MockLLMAnalyzer(mock_llm_provider, mock_langfuse_client)

    @pytest.mark.asyncio
    async def test_analyze_success(self, analyzer, mock_llm_provider):
        """Test successful analysis."""
        result = await analyzer.analyze(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        assert isinstance(result, LLMAnalysisResult)
        assert result.score == 8
        assert result.explanation == "Great communication"
        assert result.dimension == "TestDimension"

        # Verify LLM provider was called
        mock_llm_provider.generate_structured_json.assert_called_once()

    @pytest.mark.asyncio
    async def test_analyze_uses_fallback_prompt(
        self, analyzer, mock_llm_provider, mock_langfuse_client
    ):
        """Test that fallback prompt is used when Langfuse unavailable."""
        # Langfuse disabled
        mock_langfuse_client.is_enabled.return_value = False

        await analyzer.analyze(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        # Verify fallback prompt was used
        call_args = mock_llm_provider.generate_structured_json.call_args
        prompt = call_args.kwargs["prompt"]
        assert "Test prompt for Speaker A" in prompt

    @pytest.mark.asyncio
    async def test_analyze_uses_langfuse_prompt(
        self, analyzer, mock_llm_provider, mock_langfuse_client
    ):
        """Test that Langfuse prompt is used when available."""
        # Enable Langfuse and provide a mock prompt
        mock_langfuse_client.is_enabled.return_value = True
        mock_prompt = MagicMock()
        mock_prompt.compile.return_value = "Langfuse prompt for Speaker A"
        mock_langfuse_client.get_prompt.return_value = mock_prompt

        await analyzer.analyze(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        # Verify Langfuse prompt was fetched
        mock_langfuse_client.get_prompt.assert_called_once_with("test-dimension")

        # Verify Langfuse prompt was used
        call_args = mock_llm_provider.generate_structured_json.call_args
        prompt = call_args.kwargs["prompt"]
        assert prompt == "Langfuse prompt for Speaker A"

    @pytest.mark.asyncio
    async def test_analyze_validation_failure(self, analyzer, mock_llm_provider):
        """Test that validation errors are raised."""
        # Return invalid score (out of range)
        mock_llm_provider.generate_structured_json.return_value = {
            "score": 11,
            "explanation": "Invalid score",
        }

        with pytest.raises(LLMScoreValidationError):
            await analyzer.analyze(
                speaker_label="Speaker A",
                transcript_text="Test transcript",
                talk_time_percentage=45.0,
                word_count=500,
                meeting_duration_minutes=30.0,
                total_speakers=3,
            )

    @pytest.mark.asyncio
    async def test_analyze_llm_provider_failure(self, analyzer, mock_llm_provider):
        """Test that LLM provider errors are propagated."""
        # Simulate LLM provider failure
        mock_llm_provider.generate_structured_json.side_effect = Exception(
            "LLM API error"
        )

        with pytest.raises(Exception) as exc_info:
            await analyzer.analyze(
                speaker_label="Speaker A",
                transcript_text="Test transcript",
                talk_time_percentage=45.0,
                word_count=500,
                meeting_duration_minutes=30.0,
                total_speakers=3,
            )

        assert "Failed to analyze TestDimension" in str(exc_info.value)


# =============================================================================
# Orchestrator Tests
# =============================================================================


class TestLLMOrchestrator:
    """Test suite for LLMOrchestrator."""

    @pytest.fixture
    def mock_analyzer(self):
        """Create a mock analyzer."""

        async def mock_analyze(**kwargs):
            return LLMAnalysisResult(
                score=7, explanation="Test result", dimension="TestDimension"
            )

        analyzer = MagicMock(spec=BaseLLMAnalyzer)
        analyzer.dimension_name = "TestDimension"
        analyzer.analyze = mock_analyze
        return analyzer

    @pytest.fixture
    def orchestrator(self, mock_analyzer):
        """Create orchestrator with mock analyzer."""
        return LLMOrchestrator([mock_analyzer])

    @pytest.mark.asyncio
    async def test_analyze_all_success(self, orchestrator):
        """Test successful orchestration of all analyzers."""
        result = await orchestrator.analyze_all(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        assert isinstance(result, LLMOrchestrationResult)
        assert len(result.errors) == 0

    @pytest.mark.asyncio
    async def test_analyze_all_with_failure(self):
        """Test orchestration handles individual analyzer failures."""

        # Create one successful and one failing analyzer
        async def success_analyze(**kwargs):
            return LLMAnalysisResult(
                score=8, explanation="Success", dimension="Clarity"
            )

        async def failure_analyze(**kwargs):
            raise Exception("Analyzer failed")

        success_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        success_analyzer.dimension_name = "Clarity"
        success_analyzer.analyze = success_analyze

        failure_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        failure_analyzer.dimension_name = "Confidence"
        failure_analyzer.analyze = failure_analyze

        orchestrator = LLMOrchestrator([success_analyzer, failure_analyzer])

        result = await orchestrator.analyze_all(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        # Clarity should succeed
        assert result.clarity is not None
        assert result.clarity.score == 8

        # Confidence should fail
        assert "Confidence" in result.errors
        assert "Analyzer failed" in result.errors["Confidence"]

    @pytest.mark.asyncio
    async def test_analyze_all_parallel_execution(self):
        """Test that analyzers run in parallel."""
        import asyncio

        call_times = []

        async def delayed_analyze(**kwargs):
            call_times.append(asyncio.get_event_loop().time())
            await asyncio.sleep(0.1)  # Simulate async work
            return LLMAnalysisResult(
                score=7, explanation="Test", dimension="TestDimension"
            )

        # Create multiple analyzers
        analyzers = []
        for i in range(3):
            analyzer = MagicMock(spec=BaseLLMAnalyzer)
            analyzer.dimension_name = f"Dimension{i}"
            analyzer.analyze = delayed_analyze
            analyzers.append(analyzer)

        orchestrator = LLMOrchestrator(analyzers)

        start_time = asyncio.get_event_loop().time()
        await orchestrator.analyze_all(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )
        end_time = asyncio.get_event_loop().time()

        # All 3 analyzers should start at roughly the same time (parallel)
        assert len(call_times) == 3
        time_spread = max(call_times) - min(call_times)
        assert time_spread < 0.05  # Started within 50ms of each other

        # Total time should be ~0.1s (parallel) not ~0.3s (sequential)
        total_time = end_time - start_time
        assert total_time < 0.2  # Allow some overhead

    def test_orchestration_result_to_dict(self):
        """Test converting orchestration result to dictionary."""
        result = LLMOrchestrationResult(
            clarity=LLMAnalysisResult(7, "Clear", "Clarity"),
            confidence=LLMAnalysisResult(8, "Confident", "Confidence"),
            attunement=None,  # Missing
        )

        result_dict = result.to_dict()

        # Clarity and confidence should be present
        assert result_dict["clarity_score"] == 7
        assert result_dict["clarity_explanation"] == "Clear"
        assert result_dict["confidence_score"] == 8
        assert result_dict["confidence_explanation"] == "Confident"

        # Attunement should be absent
        assert "attunement_score" not in result_dict

    @pytest.mark.asyncio
    async def test_analyze_all_skips_attunement_for_single_speaker(self):
        """Test that attunement analysis is skipped for single-speaker meetings."""

        async def clarity_analyze(**kwargs):
            return LLMAnalysisResult(
                score=8, explanation="Clear speech", dimension="Clarity"
            )

        async def confidence_analyze(**kwargs):
            return LLMAnalysisResult(
                score=7, explanation="Confident tone", dimension="Confidence"
            )

        async def attunement_analyze(**kwargs):
            # This should NOT be called for single-speaker meetings
            return LLMAnalysisResult(
                score=6, explanation="Good attunement", dimension="Attunement"
            )

        clarity_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        clarity_analyzer.dimension_name = "Clarity"
        clarity_analyzer.analyze = clarity_analyze

        confidence_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        confidence_analyzer.dimension_name = "Confidence"
        confidence_analyzer.analyze = confidence_analyze

        attunement_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        attunement_analyzer.dimension_name = "Attunement"
        attunement_analyzer.analyze = attunement_analyze

        orchestrator = LLMOrchestrator(
            [clarity_analyzer, confidence_analyzer, attunement_analyzer]
        )

        # Single speaker meeting
        result = await orchestrator.analyze_all(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=100.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=1,  # Single speaker
        )

        # Clarity and confidence should be present
        assert result.clarity is not None
        assert result.clarity.score == 8
        assert result.confidence is not None
        assert result.confidence.score == 7

        # Attunement should be None (skipped for single-speaker)
        assert result.attunement is None

        # Verify attunement analyzer was NOT called
        result_dict = result.to_dict()
        assert "attunement_score" not in result_dict

    @pytest.mark.asyncio
    async def test_analyze_all_includes_attunement_for_multi_speaker(self):
        """Test that attunement analysis is included for multi-speaker meetings."""

        async def clarity_analyze(**kwargs):
            return LLMAnalysisResult(
                score=8, explanation="Clear speech", dimension="Clarity"
            )

        async def attunement_analyze(**kwargs):
            return LLMAnalysisResult(
                score=6, explanation="Good collaboration", dimension="Attunement"
            )

        clarity_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        clarity_analyzer.dimension_name = "Clarity"
        clarity_analyzer.analyze = clarity_analyze

        attunement_analyzer = MagicMock(spec=BaseLLMAnalyzer)
        attunement_analyzer.dimension_name = "Attunement"
        attunement_analyzer.analyze = attunement_analyze

        orchestrator = LLMOrchestrator([clarity_analyzer, attunement_analyzer])

        # Multi-speaker meeting
        result = await orchestrator.analyze_all(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=50.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=2,  # Multiple speakers
        )

        # Both should be present
        assert result.clarity is not None
        assert result.attunement is not None
        assert result.attunement.score == 6

        result_dict = result.to_dict()
        assert "attunement_score" in result_dict
        assert result_dict["attunement_score"] == 6
