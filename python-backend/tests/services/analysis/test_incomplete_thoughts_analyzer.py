"""
Tests for incomplete thoughts analyzer.

Tests the detection of segments that end without completing a thought.
"""

import pytest
from app.services.analysis.incomplete_thoughts_analyzer import (
    detect_incomplete_thoughts,
)


class TestIncompleteThoughtsBasic:
    """Test suite for basic incomplete thought detection."""

    def test_detects_trailing_ellipsis(self):
        """Test detection of segments ending with ellipsis."""
        segments = [
            {"text": "I was thinking that maybe we could...", "start": 0, "end": 2}
        ]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1
        assert result["percentage"] == 100.0
        assert 0 in result["incomplete_segments"]

    def test_detects_trailing_um(self):
        """Test detection of segments ending with 'um'."""
        segments = [{"text": "The solution is, um", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1
        assert result["percentage"] == 100.0

    def test_detects_trailing_so(self):
        """Test detection of segments ending with 'so'."""
        segments = [{"text": "We need to consider the budget so", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1
        assert result["percentage"] == 100.0

    def test_detects_trailing_and(self):
        """Test detection of segments ending with 'and'."""
        segments = [{"text": "We have the resources and", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1
        assert result["percentage"] == 100.0

    def test_complete_thought_with_period(self):
        """Test that complete sentences are not flagged."""
        segments = [{"text": "This is a complete thought.", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 0
        assert result["percentage"] == 0.0

    def test_complete_thought_with_question_mark(self):
        """Test that questions are not flagged."""
        segments = [{"text": "What do you think about this?", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 0
        assert result["percentage"] == 0.0

    def test_complete_thought_with_exclamation(self):
        """Test that exclamations are not flagged."""
        segments = [{"text": "This is great!", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 0
        assert result["percentage"] == 0.0

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 0
        assert result["percentage"] == 0.0
        assert result["incomplete_segments"] == []


class TestTrailingMarkers:
    """Test all trailing markers are detected."""

    def test_detects_trailing_uh(self):
        """Test detection of 'uh' at end."""
        segments = [{"text": "I was going to say, uh", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_so_yeah(self):
        """Test detection of 'so yeah' at end."""
        segments = [
            {"text": "That's basically the plan, so yeah", "start": 0, "end": 2}
        ]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_anyway(self):
        """Test detection of 'anyway' at end."""
        segments = [{"text": "We could try that approach anyway", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_but(self):
        """Test detection of 'but' at end."""
        segments = [{"text": "I think it's a good idea but", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_like(self):
        """Test detection of 'like' at end."""
        segments = [{"text": "It was kind of, like", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_you_know(self):
        """Test detection of 'you know' at end."""
        segments = [{"text": "The thing is, you know", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_i_mean(self):
        """Test detection of 'I mean' at end."""
        segments = [{"text": "It's complicated, I mean", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_detects_trailing_i_guess(self):
        """Test detection of 'I guess' at end."""
        segments = [{"text": "We could try that, I guess", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1


class TestRealWorldScenarios:
    """Test realistic scenarios."""

    def test_confident_speaker(self):
        """Test a confident speaker with complete thoughts."""
        segments = [
            {"text": "Let me explain the solution.", "start": 0, "end": 2},
            {"text": "We need to focus on three areas.", "start": 2, "end": 4},
            {
                "text": "The timeline is aggressive but achievable.",
                "start": 4,
                "end": 6,
            },
        ]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 0
        assert result["percentage"] == 0.0

    def test_uncertain_speaker(self):
        """Test someone who trails off frequently."""
        segments = [
            {"text": "So basically I was thinking...", "start": 0, "end": 2},
            {"text": "The budget is kind of, um", "start": 2, "end": 4},
            {"text": "We could maybe try, you know", "start": 4, "end": 6},
        ]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 3
        assert result["percentage"] == 100.0

    def test_mixed_conversation(self):
        """Test a mix of complete and incomplete thoughts."""
        segments = [
            {"text": "First, let me explain the context.", "start": 0, "end": 2},
            {"text": "The thing is, um", "start": 2, "end": 4},
            {
                "text": "Actually, never mind. Here's the solution.",
                "start": 4,
                "end": 6,
            },
            {"text": "We need to reconsider the approach, but", "start": 6, "end": 8},
        ]

        result = detect_incomplete_thoughts(segments)

        # 2 incomplete: "The thing is, um" and "...approach, but"
        assert result["count"] == 2
        assert result["percentage"] == 50.0

    def test_presentation_trailing_off(self):
        """Test a speaker who trails off mid-presentation."""
        segments = [
            {"text": "The key metrics show...", "start": 0, "end": 2},
            {"text": "Revenue is up by 20%.", "start": 2, "end": 4},
            {"text": "Customer satisfaction, well, kind of", "start": 4, "end": 6},
        ]

        result = detect_incomplete_thoughts(segments)

        # 2 incomplete: "The key metrics show..." and "...well, kind of"
        assert result["count"] == 2


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "This is complete.", "start": 1, "end": 2},
        ]

        result = detect_incomplete_thoughts(segments)

        # Only 1 valid segment (the one with text), which is complete
        assert result["count"] == 0
        assert result["percentage"] == 0.0

    def test_simple_responses_not_flagged(self):
        """Test that simple acknowledgments are not flagged."""
        segments = [
            {"text": "Yes", "start": 0, "end": 1},
            {"text": "Okay", "start": 1, "end": 2},
            {"text": "Right", "start": 2, "end": 3},
            {"text": "Gotcha", "start": 3, "end": 4},
        ]

        result = detect_incomplete_thoughts(segments)

        # Simple responses should not be flagged as incomplete
        assert result["count"] == 0

    def test_dash_ending(self):
        """Test detection of segments ending with dash."""
        segments = [{"text": "I was thinking—", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_unicode_ellipsis(self):
        """Test detection of unicode ellipsis character."""
        segments = [{"text": "The plan was to…", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1

    def test_short_incomplete_segment(self):
        """Test very short segments without punctuation."""
        segments = [{"text": "Maybe we", "start": 0, "end": 1}]

        result = detect_incomplete_thoughts(segments)

        # Short segment without punctuation is incomplete
        assert result["count"] == 1

    def test_case_insensitive_markers(self):
        """Test case-insensitive detection of trailing markers."""
        segments = [{"text": "I was saying, UM", "start": 0, "end": 2}]

        result = detect_incomplete_thoughts(segments)

        assert result["count"] == 1


# Mark as unit tests
pytest.mark.unit(TestIncompleteThoughtsBasic)
pytest.mark.unit(TestTrailingMarkers)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
