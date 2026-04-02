"""
Unit tests for pillar score calculation service.

Tests the calculation of pillar scores from agentic communication dimensions.
"""

import pytest
from app.services.analysis.pillar_score_calculator import (
    calculate_pillar_scores,
    extract_pillar_scores,
)


class TestCalculatePillarScores:
    """Test suite for calculate_pillar_scores function."""

    def test_all_agentic_scores_present(self):
        """Test pillar calculation when all agentic scores are available."""
        agentic_scores = {
            "clarity_score": 7.5,
            "confidence_score": 8.2,
            "attunement_score": 7.9,
        }

        result = calculate_pillar_scores(agentic_scores)

        # Verify direct mapping with proper rounding
        assert result["content_pillar_score"] == 7.5
        assert result["poise_pillar_score"] == 8.2
        assert result["connection_pillar_score"] == 7.9

    def test_rounding_to_one_decimal(self):
        """Test that pillar scores are rounded to 1 decimal place."""
        agentic_scores = {
            "clarity_score": 7.567,
            "confidence_score": 8.234,
            "attunement_score": 7.951,
        }

        result = calculate_pillar_scores(agentic_scores)

        # Verify rounding to 1 decimal
        assert result["content_pillar_score"] == 7.6
        assert result["poise_pillar_score"] == 8.2
        assert result["connection_pillar_score"] == 8.0

    def test_missing_agentic_scores(self):
        """Test pillar calculation when some agentic scores are missing."""
        agentic_scores = {
            "clarity_score": 7.5,
            "confidence_score": None,
            "attunement_score": None,
        }

        result = calculate_pillar_scores(agentic_scores)

        # Available scores should be calculated
        assert result["content_pillar_score"] == 7.5

        # Missing scores should return None
        assert result["poise_pillar_score"] is None
        assert result["connection_pillar_score"] is None

    def test_all_agentic_scores_missing(self):
        """Test pillar calculation when all agentic scores are missing."""
        agentic_scores = {
            "clarity_score": None,
            "confidence_score": None,
            "attunement_score": None,
        }

        result = calculate_pillar_scores(agentic_scores)

        # All pillar scores should be None
        assert result["content_pillar_score"] is None
        assert result["poise_pillar_score"] is None
        assert result["connection_pillar_score"] is None

    def test_empty_agentic_scores_dict(self):
        """Test pillar calculation with empty agentic scores dict."""
        agentic_scores = {}

        result = calculate_pillar_scores(agentic_scores)

        # All pillar scores should be None when keys are missing
        assert result["content_pillar_score"] is None
        assert result["poise_pillar_score"] is None
        assert result["connection_pillar_score"] is None

    def test_minimum_score(self):
        """Test pillar calculation with minimum valid scores (1.0)."""
        agentic_scores = {
            "clarity_score": 1.0,
            "confidence_score": 1.0,
            "attunement_score": 1.0,
        }

        result = calculate_pillar_scores(agentic_scores)

        assert result["content_pillar_score"] == 1.0
        assert result["poise_pillar_score"] == 1.0
        assert result["connection_pillar_score"] == 1.0

    def test_maximum_score(self):
        """Test pillar calculation with maximum valid scores (10.0)."""
        agentic_scores = {
            "clarity_score": 10.0,
            "confidence_score": 10.0,
            "attunement_score": 10.0,
        }

        result = calculate_pillar_scores(agentic_scores)

        assert result["content_pillar_score"] == 10.0
        assert result["poise_pillar_score"] == 10.0
        assert result["connection_pillar_score"] == 10.0

    def test_mixed_scores(self):
        """Test pillar calculation with realistic mixed scores."""
        agentic_scores = {
            "clarity_score": 8.7,
            "confidence_score": 5.3,
            "attunement_score": 6.5,
        }

        result = calculate_pillar_scores(agentic_scores)

        assert result["content_pillar_score"] == 8.7
        assert result["poise_pillar_score"] == 5.3
        assert result["connection_pillar_score"] == 6.5


class TestExtractPillarScores:
    """Test suite for extract_pillar_scores convenience function."""

    def test_extract_from_speaker_stats(self):
        """Test extracting pillar scores from speaker statistics dict."""
        speaker_stats = {
            "clarity_score": 7.5,
            "confidence_score": 8.2,
            "attunement_score": 7.9,
            "word_count": 1500,
            "percentage": 45.2,
            "segments": 20,
        }

        result = extract_pillar_scores(speaker_stats)

        # Should extract and calculate pillar scores
        assert result["content_pillar_score"] == 7.5
        assert result["poise_pillar_score"] == 8.2
        assert result["connection_pillar_score"] == 7.9

    def test_extract_with_missing_agentic_scores(self):
        """Test extraction when some agentic scores are missing."""
        speaker_stats = {
            "clarity_score": 7.5,
            "confidence_score": None,
            "word_count": 1500,
            "percentage": 45.2,
        }

        result = extract_pillar_scores(speaker_stats)

        # Should handle missing scores gracefully
        assert result["content_pillar_score"] == 7.5
        assert result["poise_pillar_score"] is None
        assert result["connection_pillar_score"] is None

    def test_extract_without_agentic_scores(self):
        """Test extraction from stats dict without any agentic scores."""
        speaker_stats = {
            "word_count": 1500,
            "percentage": 45.2,
            "segments": 20,
            "total_time": 600,
        }

        result = extract_pillar_scores(speaker_stats)

        # All pillar scores should be None
        assert result["content_pillar_score"] is None
        assert result["poise_pillar_score"] is None
        assert result["connection_pillar_score"] is None

    def test_extract_preserves_original_dict(self):
        """Test that extraction doesn't modify the original speaker stats."""
        original_stats = {
            "clarity_score": 7.5,
            "confidence_score": 8.2,
            "word_count": 1500,
        }

        # Make a copy to verify original isn't modified
        stats_copy = original_stats.copy()

        extract_pillar_scores(original_stats)

        # Original should remain unchanged
        assert original_stats == stats_copy


# Mark tests for categorization
pytest.mark.unit(TestCalculatePillarScores)
pytest.mark.unit(TestExtractPillarScores)
