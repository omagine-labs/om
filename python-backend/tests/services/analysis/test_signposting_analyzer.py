"""
Tests for signposting analyzer.

Tests the detection and counting of signposting/structural phrases in transcription segments.
"""

import pytest
from app.services.analysis.signposting_analyzer import detect_signposting


class TestSignpostingBasic:
    """Test suite for basic signposting detection."""

    def test_detects_first(self):
        """Test detection of 'first'."""
        segments = [
            {"text": "First, we should discuss the background", "start": 0, "end": 2}
        ]

        result = detect_signposting(segments)

        assert result["total"] == 1
        assert result["breakdown"]["first"] == 1

    def test_detects_second(self):
        """Test detection of 'second'."""
        segments = [
            {"text": "Second, we need to consider the costs", "start": 0, "end": 2}
        ]

        result = detect_signposting(segments)

        assert result["total"] == 1
        assert result["breakdown"]["second"] == 1

    def test_detects_to_summarize(self):
        """Test detection of 'to summarize'."""
        segments = [
            {"text": "To summarize, we have three options", "start": 0, "end": 2}
        ]

        result = detect_signposting(segments)

        assert result["total"] == 1
        assert result["breakdown"]["to summarize"] == 1

    def test_detects_multiple_signposts(self):
        """Test detection of multiple signposting phrases."""
        segments = [
            {
                "text": "First, we start here. Finally, the conclusion",
                "start": 0,
                "end": 3,
            }
        ]

        result = detect_signposting(segments)

        assert result["total"] == 2
        assert result["breakdown"]["first"] == 1
        assert result["breakdown"]["finally"] == 1

    def test_case_insensitive(self):
        """Test case-insensitive detection."""
        segments = [{"text": "FIRST First first", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["total"] == 3
        assert result["breakdown"]["first"] == 3

    def test_no_signposting(self):
        """Test when no signposting is present."""
        segments = [
            {"text": "We should just do this because it works", "start": 0, "end": 2}
        ]

        result = detect_signposting(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = detect_signposting(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}


class TestAllSignpostingPatterns:
    """Test all signposting patterns are detected."""

    def test_detects_third(self):
        """Test detection of 'third'."""
        segments = [{"text": "Third, the timeline", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["third"] == 1

    def test_detects_finally(self):
        """Test detection of 'finally'."""
        segments = [{"text": "Finally, the last point", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["finally"] == 1

    def test_detects_in_summary(self):
        """Test detection of 'in summary'."""
        segments = [{"text": "In summary, three key points", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["in summary"] == 1

    def test_detects_my_point_is(self):
        """Test detection of 'my point is'."""
        segments = [{"text": "My point is that we need to act", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["my point is"] == 1

    def test_detects_in_conclusion(self):
        """Test detection of 'in conclusion'."""
        segments = [{"text": "In conclusion, we agree", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["in conclusion"] == 1

    def test_detects_next(self):
        """Test detection of 'next'."""
        segments = [{"text": "Next, let's discuss pricing", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["next"] == 1

    def test_detects_let_me_explain(self):
        """Test detection of 'let me explain'."""
        segments = [{"text": "Let me explain why this matters", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["let me explain"] == 1

    def test_detects_the_key_point(self):
        """Test detection of 'the key point'."""
        segments = [{"text": "The key point here is clarity", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["the key point"] == 1

    def test_detects_most_importantly(self):
        """Test detection of 'most importantly'."""
        segments = [{"text": "Most importantly, stay focused", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["breakdown"]["most importantly"] == 1


class TestRealWorldScenarios:
    """Test realistic scenarios."""

    def test_unstructured_speaker(self):
        """Test an unstructured speaker with no signposting."""
        segments = [
            {"text": "So we need to do this thing.", "start": 0, "end": 2},
            {"text": "And also that other thing.", "start": 2, "end": 4},
            {"text": "Yeah and maybe the budget thing too.", "start": 4, "end": 6},
        ]

        result = detect_signposting(segments)

        assert result["total"] == 0

    def test_well_structured_speaker(self):
        """Test a well-structured speaker with clear signposting."""
        segments = [
            {"text": "First, here is the problem.", "start": 0, "end": 2},
            {"text": "Second, here is the solution.", "start": 2, "end": 4},
            {"text": "Finally, in conclusion, we need action.", "start": 4, "end": 6},
        ]

        result = detect_signposting(segments)

        assert result["total"] == 4
        assert result["breakdown"]["first"] == 1
        assert result["breakdown"]["second"] == 1
        assert result["breakdown"]["finally"] == 1
        assert result["breakdown"]["in conclusion"] == 1

    def test_presentation_style(self):
        """Test a presentation-style speaker."""
        segments = [
            {"text": "To begin, here is our approach.", "start": 0, "end": 3},
            {"text": "Moving on to the data analysis.", "start": 3, "end": 6},
            {"text": "To wrap up, the bottom line is growth.", "start": 6, "end": 9},
        ]

        result = detect_signposting(segments)

        assert result["total"] == 4
        assert result["breakdown"]["to begin"] == 1
        assert result["breakdown"]["moving on"] == 1
        assert result["breakdown"]["to wrap up"] == 1
        assert result["breakdown"]["the bottom line"] == 1


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "First, the plan", "start": 1, "end": 2},
        ]

        result = detect_signposting(segments)

        assert result["total"] == 1

    def test_signpost_with_punctuation(self):
        """Test signposts with punctuation."""
        segments = [{"text": "First! Second... Third?", "start": 0, "end": 2}]

        result = detect_signposting(segments)

        assert result["total"] == 3

    def test_first_in_sentence_not_first_word(self):
        """Test 'first' appearing not at start of sentence."""
        segments = [
            {"text": "The first thing we need is clarity", "start": 0, "end": 2}
        ]

        result = detect_signposting(segments)

        # 'first' should still be detected as it's a structural marker
        assert result["total"] == 1


# Mark as unit tests
pytest.mark.unit(TestSignpostingBasic)
pytest.mark.unit(TestAllSignpostingPatterns)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
