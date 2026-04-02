"""
Tests for filler words analyzer.

Tests the detection and counting of filler words/phrases in transcription segments.
"""

import pytest
from app.services.analysis.filler_words_analyzer import detect_filler_words


class TestFillerWordsDetection:
    """Test suite for basic filler words detection."""

    def test_detects_um_filler(self):
        """Test detection of 'um' filler word."""
        segments = [
            {"text": "Um, I think we should um proceed with this", "start": 0, "end": 2}
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 2
        assert result["breakdown"]["um"] == 2

    def test_detects_uh_filler(self):
        """Test detection of 'uh' filler word."""
        segments = [
            {
                "text": "Uh, let me think about that uh for a moment",
                "start": 0,
                "end": 2,
            }
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 2
        assert result["breakdown"]["uh"] == 2

    def test_detects_like_filler(self):
        """Test detection of 'like' as a filler word."""
        segments = [
            {"text": "It was like really good and like amazing", "start": 0, "end": 2}
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 2
        assert result["breakdown"]["like"] == 2

    def test_detects_you_know_phrase(self):
        """Test detection of 'you know' filler phrase."""
        segments = [
            {
                "text": "You know, it's important, you know, really",
                "start": 0,
                "end": 2,
            }
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 2
        assert result["breakdown"]["you know"] == 2

    def test_detects_multiple_filler_types(self):
        """Test detection of multiple different filler words in one segment."""
        segments = [
            {
                "text": "Um, you know, I mean, like, we should proceed",
                "start": 0,
                "end": 3,
            }
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 4
        assert result["breakdown"]["um"] == 1
        assert result["breakdown"]["you know"] == 1
        assert result["breakdown"]["i mean"] == 1
        assert result["breakdown"]["like"] == 1

    def test_case_insensitive_detection(self):
        """Test that filler words are detected regardless of case."""
        segments = [{"text": "UM, Um, uM, like, LIKE, Like", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["total"] == 6
        assert result["breakdown"]["um"] == 3
        assert result["breakdown"]["like"] == 3

    def test_no_fillers_detected(self):
        """Test handling when no filler words are present."""
        segments = [
            {"text": "This is a clean sentence with no fillers", "start": 0, "end": 2}
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}

    def test_empty_segments(self):
        """Test handling of empty segments list."""
        segments = []

        result = detect_filler_words(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}

    def test_empty_text_in_segment(self):
        """Test handling of segments with empty text."""
        segments = [
            {"text": "", "start": 0, "end": 1},
            {"text": "   ", "start": 1, "end": 2},
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 0
        assert result["breakdown"] == {}


class TestWordBoundaryDetection:
    """Test suite for word boundary handling to avoid false positives."""

    def test_um_not_detected_in_umbrella(self):
        """Test that 'um' in 'umbrella' is not counted as a filler."""
        segments = [{"text": "I brought my umbrella today", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["total"] == 0
        assert "um" not in result["breakdown"]

    def test_like_not_detected_in_likely(self):
        """Test that 'like' in 'likely' is not counted as a filler."""
        segments = [{"text": "It's likely to rain tomorrow", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["total"] == 0
        assert "like" not in result["breakdown"]

    def test_so_not_detected_in_also(self):
        """Test that 'so' in 'also' is not counted as a filler."""
        segments = [{"text": "I also need to mention this", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["total"] == 0
        assert "so" not in result["breakdown"]

    def test_filler_at_word_boundary_detected(self):
        """Test that fillers at actual word boundaries are detected."""
        segments = [
            {"text": "um umbrella", "start": 0, "end": 1},  # 'um' as separate word
            {"text": "umbrella um", "start": 1, "end": 2},  # 'um' as separate word
            {"text": "umbrella", "start": 2, "end": 3},  # 'um' inside word, not counted
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 2
        assert result["breakdown"]["um"] == 2


class TestMultipleSegments:
    """Test suite for filler word detection across multiple segments."""

    def test_aggregates_across_segments(self):
        """Test that filler words are counted across all segments."""
        segments = [
            {"text": "Um, let me think", "start": 0, "end": 1},
            {"text": "Uh, yes I agree", "start": 1, "end": 2},
            {"text": "Um, definitely", "start": 2, "end": 3},
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 3
        assert result["breakdown"]["um"] == 2
        assert result["breakdown"]["uh"] == 1

    def test_counts_same_filler_in_multiple_segments(self):
        """Test that same filler in different segments is counted correctly."""
        segments = [
            {"text": "I think this", "start": 0, "end": 1},
            {"text": "Like really?", "start": 1, "end": 2},
            {"text": "Like absolutely", "start": 2, "end": 3},
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 2
        assert result["breakdown"]["like"] == 2


class TestAllFillerPatterns:
    """Test suite to verify all filler patterns are detected."""

    def test_detects_i_mean(self):
        """Test detection of 'I mean' filler phrase."""
        segments = [
            {"text": "I mean, it's good, I mean really good", "start": 0, "end": 2}
        ]

        result = detect_filler_words(segments)

        assert result["breakdown"]["i mean"] == 2

    def test_detects_so(self):
        """Test detection of 'so' filler word."""
        segments = [{"text": "So, what we need to do, so yeah", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["breakdown"]["so"] == 2

    def test_detects_okay(self):
        """Test detection of 'okay' filler word."""
        segments = [{"text": "Okay, let me see, okay?", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["breakdown"]["okay"] == 2

    def test_detects_gotcha(self):
        """Test detection of 'gotcha' filler word."""
        segments = [{"text": "Gotcha, I understand, gotcha", "start": 0, "end": 2}]

        result = detect_filler_words(segments)

        assert result["breakdown"]["gotcha"] == 2


class TestRealWorldScenarios:
    """Test suite for realistic conversation scenarios."""

    def test_professional_meeting_with_few_fillers(self):
        """Test a professional conversation with minimal filler words."""
        segments = [
            {
                "text": "Good morning everyone. Let's discuss the quarterly results.",
                "start": 0,
                "end": 3,
            },
            {
                "text": "The revenue is up by fifteen percent this quarter.",
                "start": 3,
                "end": 6,
            },
            {
                "text": "Um, we should celebrate this achievement.",
                "start": 6,
                "end": 8,
            },
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 1
        assert result["breakdown"]["um"] == 1

    def test_casual_conversation_with_many_fillers(self):
        """Test a casual conversation with many filler words."""
        segments = [
            {
                "text": "Um, so like, I was thinking, you know, about the project",
                "start": 0,
                "end": 3,
            },
            {
                "text": "And, uh, it's important, I mean, gotcha",
                "start": 3,
                "end": 6,
            },
            {
                "text": "Okay, we should, like, get started",
                "start": 6,
                "end": 9,
            },
        ]

        result = detect_filler_words(segments)

        # um, so, like, you know, uh, i mean, gotcha, okay, like = 9
        assert result["total"] == 9
        assert result["breakdown"]["um"] == 1
        assert result["breakdown"]["so"] == 1
        assert result["breakdown"]["like"] == 2
        assert result["breakdown"]["you know"] == 1
        assert result["breakdown"]["uh"] == 1
        assert result["breakdown"]["i mean"] == 1
        assert result["breakdown"]["gotcha"] == 1
        assert result["breakdown"]["okay"] == 1

    def test_nervous_speaker_many_repetitions(self):
        """Test a nervous speaker repeating the same filler word."""
        segments = [
            {"text": "Um, um, um, let me, um, think about that", "start": 0, "end": 3}
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 4
        assert result["breakdown"]["um"] == 4

    def test_mixed_punctuation_and_fillers(self):
        """Test filler words with various punctuation."""
        segments = [
            {
                "text": "So, like, here's the thing... um, you know? Gotcha!",
                "start": 0,
                "end": 3,
            }
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 5
        assert result["breakdown"]["so"] == 1
        assert result["breakdown"]["like"] == 1
        assert result["breakdown"]["um"] == 1
        assert result["breakdown"]["you know"] == 1
        assert result["breakdown"]["gotcha"] == 1


class TestEdgeCases:
    """Test suite for edge cases and unusual inputs."""

    def test_filler_word_as_only_content(self):
        """Test segment containing only filler words."""
        segments = [{"text": "um uh like", "start": 0, "end": 1}]

        result = detect_filler_words(segments)

        assert result["total"] == 3
        assert result["breakdown"]["um"] == 1
        assert result["breakdown"]["uh"] == 1
        assert result["breakdown"]["like"] == 1

    def test_missing_text_field(self):
        """Test handling of segments without text field."""
        segments = [
            {"start": 0, "end": 1},  # Missing 'text' field
            {"text": "um hello", "start": 1, "end": 2},
        ]

        result = detect_filler_words(segments)

        # Should handle missing text gracefully and count the valid segment
        assert result["total"] == 1
        assert result["breakdown"]["um"] == 1

    def test_very_long_text_with_many_fillers(self):
        """Test performance with a very long text containing many fillers."""
        long_text = " ".join(["um"] * 50 + ["like"] * 30 + ["okay"] * 20)
        segments = [{"text": long_text, "start": 0, "end": 10}]

        result = detect_filler_words(segments)

        assert result["total"] == 100
        assert result["breakdown"]["um"] == 50
        assert result["breakdown"]["like"] == 30
        assert result["breakdown"]["okay"] == 20

    def test_special_characters_in_text(self):
        """Test filler detection with special characters in text."""
        segments = [
            {
                "text": "Um... like, $1000? Okay—you know!",
                "start": 0,
                "end": 2,
            }
        ]

        result = detect_filler_words(segments)

        assert result["total"] == 4
        assert result["breakdown"]["um"] == 1
        assert result["breakdown"]["like"] == 1
        assert result["breakdown"]["okay"] == 1
        assert result["breakdown"]["you know"] == 1


# Mark all test classes as unit tests
pytest.mark.unit(TestFillerWordsDetection)
pytest.mark.unit(TestWordBoundaryDetection)
pytest.mark.unit(TestMultipleSegments)
pytest.mark.unit(TestAllFillerPatterns)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
