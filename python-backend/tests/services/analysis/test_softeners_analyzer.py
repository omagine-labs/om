"""
Tests for softeners analyzer.

Tests the detection and counting of softening language in transcription segments.
"""

import pytest
from app.services.analysis.softeners_analyzer import detect_softeners


class TestSoftenersBasic:
    """Test suite for basic softener detection."""

    def test_detects_just(self):
        """Test detection of 'just'."""
        segments = [{"text": "I just wanted to check in", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 1
        assert result["breakdown"]["just"] == 1

    def test_detects_actually(self):
        """Test detection of 'actually'."""
        segments = [{"text": "Actually, I think that's correct", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 1
        assert result["breakdown"]["actually"] == 1

    def test_detects_sort_of(self):
        """Test detection of 'sort of'."""
        segments = [{"text": "It's sort of important", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 1
        assert result["breakdown"]["sort of"] == 1

    def test_detects_kind_of(self):
        """Test detection of 'kind of'."""
        segments = [{"text": "It's kind of a big deal", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 1
        assert result["breakdown"]["kind of"] == 1

    def test_detects_multiple_softeners(self):
        """Test detection of multiple softener phrases."""
        segments = [
            {
                "text": "I just think it's actually kind of important",
                "start": 0,
                "end": 3,
            }
        ]

        result = detect_softeners(segments)

        assert result["total"] == 3
        assert result["breakdown"]["just"] == 1
        assert result["breakdown"]["actually"] == 1
        assert result["breakdown"]["kind of"] == 1

    def test_case_insensitive(self):
        """Test case-insensitive detection."""
        segments = [{"text": "JUST Just just", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 3
        assert result["breakdown"]["just"] == 3

    def test_no_softeners_detected(self):
        """Test when no softeners are present."""
        segments = [{"text": "This is exactly what we need", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = detect_softeners(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}


class TestAllSoftenerPatterns:
    """Test all softener patterns are detected."""

    def test_detects_a_little(self):
        """Test detection of 'a little'."""
        segments = [{"text": "It's a little complicated", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["a little"] == 1

    def test_detects_basically(self):
        """Test detection of 'basically'."""
        segments = [{"text": "Basically, it works like this", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["basically"] == 1

    def test_detects_really(self):
        """Test detection of 'really'."""
        segments = [{"text": "I really think we should proceed", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["really"] == 1

    def test_detects_a_bit(self):
        """Test detection of 'a bit'."""
        segments = [{"text": "It's a bit tricky", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["a bit"] == 1

    def test_detects_somewhat(self):
        """Test detection of 'somewhat'."""
        segments = [{"text": "I'm somewhat concerned", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["somewhat"] == 1

    def test_detects_pretty_much(self):
        """Test detection of 'pretty much'."""
        segments = [{"text": "We're pretty much done", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["pretty much"] == 1

    def test_detects_i_guess(self):
        """Test detection of 'I guess'."""
        segments = [{"text": "I guess that works", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["i guess"] == 1

    def test_detects_i_suppose(self):
        """Test detection of 'I suppose'."""
        segments = [{"text": "I suppose we could try that", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["breakdown"]["i suppose"] == 1


class TestRealWorldScenarios:
    """Test realistic scenarios."""

    def test_confident_speaker(self):
        """Test a confident speaker with no softeners."""
        segments = [
            {"text": "This is exactly what we need to do.", "start": 0, "end": 2},
            {"text": "The solution is clear.", "start": 2, "end": 4},
        ]

        result = detect_softeners(segments)

        assert result["total"] == 0

    def test_hesitant_speaker(self):
        """Test someone who uses softening language frequently."""
        segments = [
            {
                "text": "I just wanted to sort of mention something.",
                "start": 0,
                "end": 2,
            },
            {
                "text": "I kind of think we should basically reconsider.",
                "start": 2,
                "end": 4,
            },
            {"text": "It's actually a little complicated.", "start": 4, "end": 6},
        ]

        result = detect_softeners(segments)

        assert result["total"] == 6
        assert result["breakdown"]["just"] == 1
        assert result["breakdown"]["sort of"] == 1
        assert result["breakdown"]["kind of"] == 1
        assert result["breakdown"]["basically"] == 1
        assert result["breakdown"]["actually"] == 1
        assert result["breakdown"]["a little"] == 1

    def test_over_qualifier(self):
        """Test someone who qualifies everything."""
        segments = [
            {
                "text": "I really just think it's somewhat important.",
                "start": 0,
                "end": 2,
            }
        ]

        result = detect_softeners(segments)

        assert result["total"] == 3
        assert result["breakdown"]["really"] == 1
        assert result["breakdown"]["just"] == 1
        assert result["breakdown"]["somewhat"] == 1


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "I just wanted to ask", "start": 1, "end": 2},
        ]

        result = detect_softeners(segments)

        assert result["total"] == 1

    def test_softener_with_punctuation(self):
        """Test softeners with punctuation."""
        segments = [{"text": "Just! Actually... Kind of?", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 3

    def test_just_not_in_justify(self):
        """Test that 'just' in 'justify' is not counted."""
        segments = [{"text": "We need to justify this decision", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 0
        assert "just" not in result["breakdown"]

    def test_bit_not_in_exhibit(self):
        """Test that 'bit' in 'exhibit' is not counted."""
        segments = [{"text": "Let me exhibit the results", "start": 0, "end": 2}]

        result = detect_softeners(segments)

        assert result["total"] == 0
        assert "a bit" not in result["breakdown"]


# Mark as unit tests
pytest.mark.unit(TestSoftenersBasic)
pytest.mark.unit(TestAllSoftenerPatterns)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
