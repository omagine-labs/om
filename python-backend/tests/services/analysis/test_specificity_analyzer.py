"""
Tests for specificity score analyzer.

Tests the calculation of language precision based on specific vs vague indicators.
"""

import pytest
from app.services.analysis.specificity_analyzer import calculate_specificity_score


class TestSpecificityBasic:
    """Test suite for basic specificity detection."""

    def test_detects_numbers(self):
        """Test detection of numbers increases score."""
        segments = [{"text": "We need 25 people and 100 dollars", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert result["details"]["total_specific"] >= 2
        assert result["details"]["specific_indicators"]["numbers"] >= 2

    def test_detects_percentages(self):
        """Test detection of percentages."""
        segments = [
            {
                "text": "Revenue increased 25% and costs decreased 10%",
                "start": 0,
                "end": 2,
            }
        ]

        result = calculate_specificity_score(segments)

        assert result["details"]["specific_indicators"]["percentages"] >= 2

    def test_detects_dates(self):
        """Test detection of date patterns."""
        segments = [
            {"text": "In Q3 2024, revenue hit $1M by December", "start": 0, "end": 2}
        ]

        result = calculate_specificity_score(segments)

        assert result["details"]["specific_indicators"]["dates"] >= 1

    def test_detects_currency(self):
        """Test detection of currency amounts."""
        segments = [
            {
                "text": "The budget is $50,000 and expenses are $25,000",
                "start": 0,
                "end": 2,
            }
        ]

        result = calculate_specificity_score(segments)

        assert result["details"]["specific_indicators"]["currencies"] >= 2

    def test_detects_vague_stuff(self):
        """Test detection of 'stuff' as vague."""
        segments = [
            {"text": "We need to do some stuff about things", "start": 0, "end": 2}
        ]

        result = calculate_specificity_score(segments)

        assert result["details"]["total_vague"] >= 2
        assert "stuff" in result["details"]["vague_indicators"]
        assert "things" in result["details"]["vague_indicators"]

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = calculate_specificity_score(segments)

        assert result["score"] is None
        assert result["details"] == {}

    def test_score_range(self):
        """Test that score is within 0-10 range."""
        segments = [
            {"text": "Some generic text with stuff and things.", "start": 0, "end": 2}
        ]

        result = calculate_specificity_score(segments)

        assert result["score"] is None or 0 <= result["score"] <= 10


class TestVaguePatterns:
    """Test all vague patterns are detected."""

    def test_detects_something(self):
        """Test detection of 'something'."""
        segments = [
            {"text": "We need to do something about this", "start": 0, "end": 2}
        ]

        result = calculate_specificity_score(segments)

        assert "something" in result["details"]["vague_indicators"]

    def test_detects_a_lot(self):
        """Test detection of 'a lot'."""
        segments = [{"text": "We have a lot of work to do", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert "a lot" in result["details"]["vague_indicators"]

    def test_detects_a_bunch(self):
        """Test detection of 'a bunch'."""
        segments = [{"text": "There were a bunch of issues", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert "a bunch" in result["details"]["vague_indicators"]

    def test_detects_whatever(self):
        """Test detection of 'whatever'."""
        segments = [{"text": "Just do whatever works best", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert "whatever" in result["details"]["vague_indicators"]

    def test_detects_etc(self):
        """Test detection of 'etc'."""
        segments = [{"text": "We need supplies, equipment, etc", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert "etc" in result["details"]["vague_indicators"]

    def test_detects_and_so_on(self):
        """Test detection of 'and so on'."""
        segments = [{"text": "Meetings, calls, and so on", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert "and so on" in result["details"]["vague_indicators"]


class TestRealWorldScenarios:
    """Test realistic scenarios."""

    def test_precise_speaker(self):
        """Test a precise speaker with specific language."""
        segments = [
            {
                "text": "Revenue increased 25% in Q3 2024, reaching $1.5M.",
                "start": 0,
                "end": 2,
            },
            {
                "text": "We have 50 employees and expect 20% growth by December.",
                "start": 2,
                "end": 4,
            },
        ]

        result = calculate_specificity_score(segments)

        # Should have high score due to numbers, percentages, dates, currency
        assert result["score"] is not None
        assert result["score"] >= 5
        assert result["details"]["total_specific"] >= 5

    def test_vague_speaker(self):
        """Test a vague speaker with imprecise language."""
        segments = [
            {"text": "We need to do some stuff about things.", "start": 0, "end": 2},
            {
                "text": "There's a lot of work, whatever we decide.",
                "start": 2,
                "end": 4,
            },
            {"text": "We have a bunch of issues and so on.", "start": 4, "end": 6},
        ]

        result = calculate_specificity_score(segments)

        # Should have lower score due to vague language
        assert result["score"] is not None
        assert result["score"] <= 5
        assert result["details"]["total_vague"] >= 5

    def test_mixed_speaker(self):
        """Test a speaker with both specific and vague language."""
        segments = [
            {
                "text": "Revenue is up 20% but we have some issues with stuff.",
                "start": 0,
                "end": 2,
            },
        ]

        result = calculate_specificity_score(segments)

        # Should have moderate score
        assert result["score"] is not None
        assert result["details"]["total_specific"] >= 1
        assert result["details"]["total_vague"] >= 2


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "Revenue is $50,000.", "start": 1, "end": 2},
        ]

        result = calculate_specificity_score(segments)

        # Should still detect from valid segment
        assert result["details"]["specific_indicators"]["currencies"] >= 1

    def test_empty_text(self):
        """Test segment with empty text."""
        segments = [
            {"text": "", "start": 0, "end": 1},
        ]

        result = calculate_specificity_score(segments)

        assert result["score"] is None

    def test_date_formats(self):
        """Test various date format detection."""
        segments = [
            {
                "text": "The deadline is 12/15, or by January 2025, or Q1 2025.",
                "start": 0,
                "end": 2,
            }
        ]

        result = calculate_specificity_score(segments)

        assert result["details"]["specific_indicators"]["dates"] >= 2

    def test_currency_formats(self):
        """Test various currency format detection."""
        segments = [{"text": "Costs: $1,000, $2.5M, £500, €750", "start": 0, "end": 2}]

        result = calculate_specificity_score(segments)

        assert result["details"]["specific_indicators"]["currencies"] >= 3

    def test_vague_in_otherwise_specific(self):
        """Test that vague terms are still detected in specific context."""
        segments = [
            {
                "text": "Revenue is $50,000 but we have some stuff to figure out.",
                "start": 0,
                "end": 2,
            }
        ]

        result = calculate_specificity_score(segments)

        # Both specific and vague should be detected
        assert result["details"]["total_specific"] >= 1
        assert result["details"]["total_vague"] >= 2  # "some" and "stuff"


# Mark as unit tests
pytest.mark.unit(TestSpecificityBasic)
pytest.mark.unit(TestVaguePatterns)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
