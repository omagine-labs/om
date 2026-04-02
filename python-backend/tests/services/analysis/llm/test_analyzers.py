"""
Tests for concrete LLM analyzer implementations.
"""

import pytest
from unittest.mock import AsyncMock
from app.services.analysis.llm.analyzers import (
    ClarityAnalyzer,
    ConfidenceAnalyzer,
    AttunementAnalyzer,
)
from app.services.analysis.llm.llm_analyzer import LLMAnalysisResult


class TestClarityAnalyzer:
    """Test suite for ClarityAnalyzer."""

    @pytest.fixture
    def mock_llm_provider(self):
        """Create mock LLM provider."""
        provider = AsyncMock()
        provider.generate_structured_json = AsyncMock(
            return_value={
                "score": 8,
                "explanation": "Clear and well-structured communication with specific examples.",
            }
        )
        return provider

    @pytest.fixture
    def analyzer(self, mock_llm_provider):
        """Create analyzer instance."""
        return ClarityAnalyzer(mock_llm_provider)

    def test_dimension_name(self, analyzer):
        """Test that dimension name is correct."""
        assert analyzer.dimension_name == "Clarity"

    def test_prompt_name(self, analyzer):
        """Test that Langfuse prompt name is correct."""
        assert analyzer.prompt_name == "clarity-analysis"

    @pytest.mark.asyncio
    async def test_analyze_success(self, analyzer, mock_llm_provider):
        """Test successful clarity analysis."""
        result = await analyzer.analyze(
            speaker_label="Speaker A",
            transcript_text="Let me explain the plan clearly. First, we need X. Then Y.",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        assert isinstance(result, LLMAnalysisResult)
        assert result.score == 8
        assert result.dimension == "Clarity"
        assert "Clear and well-structured" in result.explanation

    def test_fallback_prompt(self, analyzer):
        """Test that fallback prompt is generated correctly."""
        prompt = analyzer._build_fallback_prompt(
            speaker_label="Speaker A",
            transcript_text="Test transcript",
            talk_time_percentage=45.0,
            word_count=500,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        assert "CLARITY" in prompt
        assert "Speaker A" in prompt
        assert "Test transcript" in prompt


class TestConfidenceAnalyzer:
    """Test suite for ConfidenceAnalyzer."""

    @pytest.fixture
    def mock_llm_provider(self):
        """Create mock LLM provider."""
        provider = AsyncMock()
        provider.generate_structured_json = AsyncMock(
            return_value={
                "score": 7,
                "explanation": "Confident tone with assertive statements.",
            }
        )
        return provider

    @pytest.fixture
    def analyzer(self, mock_llm_provider):
        """Create analyzer instance."""
        return ConfidenceAnalyzer(mock_llm_provider)

    def test_dimension_name(self, analyzer):
        """Test that dimension name is correct."""
        assert analyzer.dimension_name == "Confidence"

    def test_prompt_name(self, analyzer):
        """Test that Langfuse prompt name is correct."""
        assert analyzer.prompt_name == "confidence-analysis"

    @pytest.mark.asyncio
    async def test_analyze_success(self, analyzer, mock_llm_provider):
        """Test successful confidence analysis."""
        result = await analyzer.analyze(
            speaker_label="Speaker B",
            transcript_text="I'm certain this is the right approach. We should do it.",
            talk_time_percentage=55.0,
            word_count=600,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        assert isinstance(result, LLMAnalysisResult)
        assert result.score == 7
        assert result.dimension == "Confidence"
        assert "Confident tone" in result.explanation

    def test_fallback_prompt(self, analyzer):
        """Test that fallback prompt is generated correctly."""
        prompt = analyzer._build_fallback_prompt(
            speaker_label="Speaker B",
            transcript_text="Test transcript",
            talk_time_percentage=55.0,
            word_count=600,
            meeting_duration_minutes=30.0,
            total_speakers=3,
        )

        assert "CONFIDENCE" in prompt
        assert "Speaker B" in prompt


class TestAttunementAnalyzer:
    """Test suite for AttunementAnalyzer."""

    @pytest.fixture
    def mock_llm_provider(self):
        """Create mock LLM provider."""
        provider = AsyncMock()
        provider.generate_structured_json = AsyncMock(
            return_value={
                "score": 8,
                "explanation": "Strong acknowledgement of others' contributions.",
            }
        )
        return provider

    @pytest.fixture
    def analyzer(self, mock_llm_provider):
        """Create analyzer instance."""
        return AttunementAnalyzer(mock_llm_provider)

    def test_dimension_name(self, analyzer):
        """Test that dimension name is correct."""
        assert analyzer.dimension_name == "Attunement"

    def test_prompt_name(self, analyzer):
        """Test that Langfuse prompt name is correct."""
        assert analyzer.prompt_name == "attunement-analysis"

    @pytest.mark.asyncio
    async def test_analyze_success(self, analyzer, mock_llm_provider):
        """Test successful attunement analysis."""
        result = await analyzer.analyze(
            speaker_label="Speaker D",
            transcript_text="I hear what you're saying, and I agree with your point.",
            talk_time_percentage=25.0,
            word_count=300,
            meeting_duration_minutes=30.0,
            total_speakers=4,
            interruption_rate=0.5,
        )

        assert isinstance(result, LLMAnalysisResult)
        assert result.score == 8
        assert result.dimension == "Attunement"
        assert "acknowledgement" in result.explanation

    def test_fallback_prompt_with_interruption_rate(self, analyzer):
        """Test that fallback prompt includes interruption rate context."""
        prompt = analyzer._build_fallback_prompt(
            speaker_label="Speaker D",
            transcript_text="Full meeting transcript",
            talk_time_percentage=25.0,
            word_count=300,
            meeting_duration_minutes=30.0,
            total_speakers=4,
            interruption_rate=0.5,
        )

        assert "COLLABORATION" in prompt
        assert "collaboration signals" in prompt.lower()

    def test_fallback_prompt_without_interruption_rate(self, analyzer):
        """Test that fallback prompt works without interruption rate."""
        prompt = analyzer._build_fallback_prompt(
            speaker_label="Speaker D",
            transcript_text="Full meeting transcript",
            talk_time_percentage=25.0,
            word_count=300,
            meeting_duration_minutes=30.0,
            total_speakers=4,
        )

        assert "COLLABORATION" in prompt
        assert "collaboration signals" in prompt.lower()
