"""
Tests for hedge phrases analyzer.

Tests the detection and counting of hedging language patterns in transcription segments.
"""

import pytest
from app.services.analysis.hedge_phrases_analyzer import detect_hedge_phrases


class TestHedgePhrasesBasic:
    """Test suite for basic hedge phrases detection."""

    def test_detects_i_think(self):
        """Test detection of 'I think' hedge phrase."""
        segments = [
            {
                "text": "I think we should proceed with this approach",
                "start": 0,
                "end": 2,
            }
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["i think"] == 1

    def test_detects_maybe(self):
        """Test detection of 'maybe' hedge word."""
        segments = [
            {"text": "Maybe we could try a different approach", "start": 0, "end": 2}
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["maybe"] == 1

    def test_detects_probably(self):
        """Test detection of 'probably' hedge word."""
        segments = [{"text": "This is probably the best option", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["probably"] == 1

    def test_detects_i_guess(self):
        """Test detection of 'I guess' hedge phrase."""
        segments = [{"text": "I guess that makes sense", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["i guess"] == 1

    def test_detects_multiple_hedge_types(self):
        """Test detection of multiple different hedge phrases."""
        segments = [
            {
                "text": "I think maybe we should probably consider this",
                "start": 0,
                "end": 3,
            }
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 3
        assert result["breakdown"]["i think"] == 1
        assert result["breakdown"]["maybe"] == 1
        assert result["breakdown"]["probably"] == 1

    def test_case_insensitive_detection(self):
        """Test that hedge phrases are detected regardless of case."""
        segments = [
            {"text": "MAYBE Maybe maybe PROBABLY Probably", "start": 0, "end": 2}
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 5
        assert result["breakdown"]["maybe"] == 3
        assert result["breakdown"]["probably"] == 2

    def test_no_hedges_detected(self):
        """Test handling when no hedge phrases are present."""
        segments = [
            {
                "text": "We will implement this solution immediately",
                "start": 0,
                "end": 2,
            }
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}

    def test_empty_segments(self):
        """Test handling of empty segments list."""
        segments = []

        result = detect_hedge_phrases(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}


class TestHedgePatternsComplete:
    """Test suite to verify all hedge patterns are detected."""

    def test_detects_might(self):
        """Test detection of 'might' hedge word."""
        segments = [{"text": "We might need to reconsider", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["might"] == 1

    def test_detects_perhaps(self):
        """Test detection of 'perhaps' hedge word."""
        segments = [{"text": "Perhaps there is another way", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["perhaps"] == 1

    def test_detects_i_believe(self):
        """Test detection of 'I believe' hedge phrase."""
        segments = [{"text": "I believe this is correct", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["i believe"] == 1

    def test_detects_possibly(self):
        """Test detection of 'possibly' hedge word."""
        segments = [{"text": "It could possibly work", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["possibly"] == 1

    def test_detects_i_suppose(self):
        """Test detection of 'I suppose' hedge phrase."""
        segments = [{"text": "I suppose we could try", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["i suppose"] == 1

    def test_detects_it_seems(self):
        """Test detection of 'it seems' hedge phrase."""
        segments = [{"text": "It seems like the right choice", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["it seems"] == 1

    def test_detects_i_feel_like(self):
        """Test detection of 'I feel like' hedge phrase."""
        segments = [{"text": "I feel like we should wait", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["breakdown"]["i feel like"] == 1


class TestWordBoundaryDetection:
    """Test suite for word boundary handling."""

    def test_might_not_detected_in_almighty(self):
        """Test that 'might' in 'almighty' is not counted."""
        segments = [{"text": "The almighty power of nature", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 0
        assert "might" not in result["breakdown"]

    def test_hedge_at_word_boundary_detected(self):
        """Test that hedges at actual word boundaries are detected."""
        segments = [
            {"text": "I might go", "start": 0, "end": 1},
            {"text": "almighty", "start": 1, "end": 2},
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["might"] == 1


class TestMultipleSegments:
    """Test suite for hedge detection across multiple segments."""

    def test_aggregates_across_segments(self):
        """Test that hedge phrases are counted across all segments."""
        segments = [
            {"text": "I think this is good", "start": 0, "end": 1},
            {"text": "Maybe we should wait", "start": 1, "end": 2},
            {"text": "I think we could try", "start": 2, "end": 3},
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 3
        assert result["breakdown"]["i think"] == 2
        assert result["breakdown"]["maybe"] == 1


class TestRealWorldScenarios:
    """Test suite for realistic conversation scenarios."""

    def test_confident_speaker(self):
        """Test a confident speaker with few hedges."""
        segments = [
            {"text": "We will launch next week.", "start": 0, "end": 2},
            {"text": "The data clearly shows improvement.", "start": 2, "end": 4},
            {"text": "I recommend we proceed.", "start": 4, "end": 6},
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 0

    def test_uncertain_speaker(self):
        """Test an uncertain speaker with many hedges."""
        segments = [
            {"text": "I think maybe we should probably wait", "start": 0, "end": 2},
            {"text": "I guess it might work, perhaps", "start": 2, "end": 4},
            {"text": "I believe we could possibly try it", "start": 4, "end": 6},
        ]

        result = detect_hedge_phrases(segments)

        # i think, maybe, probably, i guess, might, perhaps, i believe, possibly = 8
        assert result["total"] == 8

    def test_mixed_confidence(self):
        """Test a speaker who mixes confident and hedging language."""
        segments = [
            {"text": "We need to act now.", "start": 0, "end": 2},
            {"text": "I think the approach might work.", "start": 2, "end": 4},
            {"text": "Let's proceed immediately.", "start": 4, "end": 6},
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 2
        assert result["breakdown"]["i think"] == 1
        assert result["breakdown"]["might"] == 1


class TestEdgeCases:
    """Test suite for edge cases."""

    def test_missing_text_field(self):
        """Test handling of segments without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "I think yes", "start": 1, "end": 2},
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["i think"] == 1

    def test_empty_text_in_segment(self):
        """Test handling of segments with empty text."""
        segments = [
            {"text": "", "start": 0, "end": 1},
            {"text": "Maybe later", "start": 1, "end": 2},
        ]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 1
        assert result["breakdown"]["maybe"] == 1

    def test_hedge_with_punctuation(self):
        """Test hedge detection with various punctuation."""
        segments = [{"text": "Maybe... I think! Probably?", "start": 0, "end": 2}]

        result = detect_hedge_phrases(segments)

        assert result["total"] == 3


# Mark all test classes as unit tests
pytest.mark.unit(TestHedgePhrasesBasic)
pytest.mark.unit(TestHedgePatternsComplete)
pytest.mark.unit(TestWordBoundaryDetection)
pytest.mark.unit(TestMultipleSegments)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
