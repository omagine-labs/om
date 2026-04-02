"""
Tests for topics per segment analyzer.

Tests the estimation of topic/idea density per speaking segment.
"""

import pytest
from app.services.analysis.topics_analyzer import calculate_topics_per_segment


class TestTopicsBasic:
    """Test suite for basic topics detection."""

    def test_single_sentence_single_topic(self):
        """Test single sentence counts as one topic."""
        segments = [{"text": "We need to increase revenue.", "start": 0, "end": 2}]

        result = calculate_topics_per_segment(segments)

        assert result["avg_topics_per_segment"] is not None
        assert result["avg_topics_per_segment"] >= 1

    def test_multiple_sentences_multiple_topics(self):
        """Test multiple sentences estimate multiple topics."""
        segments = [
            {
                "text": "First, we need to increase revenue. Second, we must cut costs. Third, improve efficiency.",
                "start": 0,
                "end": 5,
            }
        ]

        result = calculate_topics_per_segment(segments)

        assert result["avg_topics_per_segment"] >= 2

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = calculate_topics_per_segment(segments)

        assert result["avg_topics_per_segment"] is None
        assert result["max_topics_in_segment"] == 0

    def test_segments_with_transitions(self):
        """Test transition phrases add to topic count."""
        segments = [
            {
                "text": "Revenue is up. Additionally, costs are down. Furthermore, efficiency improved.",
                "start": 0,
                "end": 5,
            }
        ]

        result = calculate_topics_per_segment(segments)

        # Transition words indicate topic shifts
        assert result["avg_topics_per_segment"] >= 3


class TestMultipleSegments:
    """Test analysis across multiple segments."""

    def test_averages_across_segments(self):
        """Test average is calculated across segments."""
        segments = [
            {"text": "Point one. Point two.", "start": 0, "end": 2},
            {"text": "Single point.", "start": 2, "end": 4},
        ]

        result = calculate_topics_per_segment(segments)

        # First segment: 2 topics, second segment: 1 topic
        # Average should be around 1.5
        assert result["avg_topics_per_segment"] is not None
        assert result["avg_topics_per_segment"] >= 1

    def test_long_presentation(self):
        """Test a longer presentation with many topics."""
        segments = [
            {"text": "First point. Second point.", "start": 0, "end": 3},
            {
                "text": "Moving on to the next topic. Also, another consideration.",
                "start": 3,
                "end": 6,
            },
            {"text": "In conclusion, here is the summary.", "start": 6, "end": 9},
        ]

        result = calculate_topics_per_segment(segments)

        assert result["avg_topics_per_segment"] >= 1
        assert result["max_topics_in_segment"] >= 2


class TestMaxTopicsInSegment:
    """Test max_topics_in_segment calculation."""

    def test_max_topics_single_segment(self):
        """Test max_topics for a single segment with multiple points."""
        segments = [
            {"text": "Point one. Point two. Point three.", "start": 0, "end": 3}
        ]

        result = calculate_topics_per_segment(segments)

        # Single segment, so max equals avg
        assert result["max_topics_in_segment"] >= 3
        assert result["max_topics_in_segment"] == result["avg_topics_per_segment"]

    def test_max_topics_multiple_segments(self):
        """Test max_topics finds the segment with most topics."""
        segments = [
            {"text": "One point.", "start": 0, "end": 1},  # 1 topic
            {
                "text": "First. Second. Third. Fourth.",
                "start": 1,
                "end": 3,
            },  # 4 topics
            {"text": "Single point.", "start": 3, "end": 4},  # 1 topic
        ]

        result = calculate_topics_per_segment(segments)

        # Max should be at least 3 (the dense segment)
        assert result["max_topics_in_segment"] >= 3

    def test_max_topics_empty_segments(self):
        """Test max_topics is 0 for empty segments."""
        segments = []

        result = calculate_topics_per_segment(segments)

        assert result["max_topics_in_segment"] == 0


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "One point. Two points.", "start": 1, "end": 2},
        ]

        result = calculate_topics_per_segment(segments)

        # Should only analyze the valid segment
        assert result["avg_topics_per_segment"] >= 1

    def test_empty_text(self):
        """Test segment with empty text."""
        segments = [
            {"text": "", "start": 0, "end": 1},
        ]

        result = calculate_topics_per_segment(segments)

        assert result["avg_topics_per_segment"] is None

    def test_only_transitions_no_sentences(self):
        """Test text with transition words but no clear sentences."""
        segments = [{"text": "Also additionally moreover", "start": 0, "end": 2}]

        result = calculate_topics_per_segment(segments)

        # Should still estimate at least 1 topic
        assert result["avg_topics_per_segment"] >= 1


# Mark as unit tests
pytest.mark.unit(TestTopicsBasic)
pytest.mark.unit(TestMultipleSegments)
pytest.mark.unit(TestEdgeCases)
