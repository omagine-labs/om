"""
Tests for apologies analyzer.

Tests the detection and counting of apology phrases in transcription segments.
"""

import pytest
from app.services.analysis.apologies_analyzer import detect_apologies


class TestApologiesBasic:
    """Test suite for basic apology detection."""

    def test_detects_sorry(self):
        """Test detection of 'sorry'."""
        segments = [{"text": "Sorry, I didn't mean to interrupt", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["total"] == 1
        assert result["breakdown"]["sorry"] == 1

    def test_detects_i_apologize(self):
        """Test detection of 'I apologize'."""
        segments = [{"text": "I apologize for the confusion", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["total"] == 1
        assert result["breakdown"]["i apologize"] == 1

    def test_detects_my_bad(self):
        """Test detection of 'my bad'."""
        segments = [{"text": "Oh my bad, I misunderstood", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["total"] == 1
        assert result["breakdown"]["my bad"] == 1

    def test_detects_multiple_apologies(self):
        """Test detection of multiple apology phrases."""
        segments = [
            {"text": "Sorry, I apologize for my bad performance", "start": 0, "end": 3}
        ]

        result = detect_apologies(segments)

        assert result["total"] == 3
        assert result["breakdown"]["sorry"] == 1
        assert result["breakdown"]["i apologize"] == 1
        assert result["breakdown"]["my bad"] == 1

    def test_case_insensitive(self):
        """Test case-insensitive detection."""
        segments = [{"text": "SORRY Sorry sorry", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["total"] == 3
        assert result["breakdown"]["sorry"] == 3

    def test_no_apologies_detected(self):
        """Test when no apologies are present."""
        segments = [{"text": "Thank you for your patience", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = detect_apologies(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}


class TestAllApologyPatterns:
    """Test all apology patterns are detected."""

    def test_detects_excuse_me(self):
        """Test detection of 'excuse me'."""
        segments = [{"text": "Excuse me, could you repeat that", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["breakdown"]["excuse me"] == 1

    def test_detects_forgive_me(self):
        """Test detection of 'forgive me'."""
        segments = [{"text": "Forgive me for asking", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["breakdown"]["forgive me"] == 1

    def test_detects_im_sorry(self):
        """Test detection of 'I'm sorry'."""
        segments = [{"text": "I'm sorry about that", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["breakdown"]["i'm sorry"] == 1

    def test_detects_my_apologies(self):
        """Test detection of 'my apologies'."""
        segments = [{"text": "My apologies for the delay", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["breakdown"]["my apologies"] == 1

    def test_detects_pardon_me(self):
        """Test detection of 'pardon me'."""
        segments = [{"text": "Pardon me, what did you say", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["breakdown"]["pardon me"] == 1


class TestRealWorldScenarios:
    """Test realistic scenarios."""

    def test_confident_speaker(self):
        """Test a confident speaker with no apologies."""
        segments = [
            {"text": "Let me clarify that point.", "start": 0, "end": 2},
            {"text": "We need to proceed differently.", "start": 2, "end": 4},
        ]

        result = detect_apologies(segments)

        assert result["total"] == 0

    def test_over_apologizer(self):
        """Test someone who apologizes frequently."""
        segments = [
            {"text": "Sorry, can I just say something?", "start": 0, "end": 2},
            {"text": "My bad, I should have been clearer.", "start": 2, "end": 4},
            {"text": "I apologize if that was confusing.", "start": 4, "end": 6},
        ]

        result = detect_apologies(segments)

        assert result["total"] == 3

    def test_sorry_in_different_contexts(self):
        """Test sorry used genuinely vs as filler."""
        segments = [
            {"text": "Sorry to interrupt, but sorry about that.", "start": 0, "end": 2}
        ]

        result = detect_apologies(segments)

        assert result["total"] == 2
        assert result["breakdown"]["sorry"] == 2


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "Sorry about that", "start": 1, "end": 2},
        ]

        result = detect_apologies(segments)

        assert result["total"] == 1

    def test_apology_with_punctuation(self):
        """Test apologies with punctuation."""
        segments = [{"text": "Sorry! I apologize... My bad?", "start": 0, "end": 2}]

        result = detect_apologies(segments)

        assert result["total"] == 3


# Mark as unit tests
pytest.mark.unit(TestApologiesBasic)
pytest.mark.unit(TestAllApologyPatterns)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
