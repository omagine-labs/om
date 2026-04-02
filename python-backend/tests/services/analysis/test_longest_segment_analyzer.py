"""
Tests for longest segment analyzer.

Tests the calculation of longest uninterrupted speaking turn duration per speaker.
"""

import pytest
from app.services.analysis.longest_segment_analyzer import calculate_longest_segment


class TestLongestSegmentBasic:
    """Test suite for basic longest segment calculation."""

    def test_single_segment_single_speaker(self):
        """Test with a single segment from one speaker."""
        segments = [{"speaker": "A", "start": 0.0, "end": 10.0, "text": "Hello world"}]

        result = calculate_longest_segment(segments)

        assert "A" in result
        assert result["A"]["longest_segment_seconds"] == 10.0

    def test_multiple_segments_same_speaker(self):
        """Test finding the longest among multiple segments from same speaker."""
        segments = [
            {"speaker": "A", "start": 0.0, "end": 5.0, "text": "Short segment"},
            {
                "speaker": "A",
                "start": 10.0,
                "end": 35.0,
                "text": "This is a much longer segment",
            },
            {"speaker": "A", "start": 40.0, "end": 48.0, "text": "Medium segment"},
        ]

        result = calculate_longest_segment(segments)

        assert result["A"]["longest_segment_seconds"] == 25.0

    def test_multiple_speakers(self):
        """Test longest segment calculation for multiple speakers."""
        segments = [
            {"speaker": "A", "start": 0.0, "end": 10.0, "text": "Speaker A first"},
            {"speaker": "B", "start": 10.0, "end": 25.0, "text": "Speaker B longer"},
            {
                "speaker": "A",
                "start": 25.0,
                "end": 55.0,
                "text": "Speaker A much longer",
            },
            {"speaker": "B", "start": 55.0, "end": 65.0, "text": "Speaker B shorter"},
        ]

        result = calculate_longest_segment(segments)

        assert result["A"]["longest_segment_seconds"] == 30.0  # 55 - 25
        assert result["B"]["longest_segment_seconds"] == 15.0  # 25 - 10

    def test_rounds_to_two_decimals(self):
        """Test that results are rounded to 2 decimal places."""
        segments = [{"speaker": "A", "start": 0.0, "end": 10.12345, "text": "Hello"}]

        result = calculate_longest_segment(segments)

        assert result["A"]["longest_segment_seconds"] == 10.12


class TestLongestSegmentEdgeCases:
    """Test suite for edge cases."""

    def test_empty_segments(self):
        """Test handling of empty segments list."""
        segments = []

        result = calculate_longest_segment(segments)

        assert result == {}

    def test_zero_duration_segment(self):
        """Test handling of segments with zero duration."""
        segments = [
            {"speaker": "A", "start": 5.0, "end": 5.0, "text": "Zero duration"},
            {"speaker": "A", "start": 10.0, "end": 15.0, "text": "Normal segment"},
        ]

        result = calculate_longest_segment(segments)

        # Zero duration should be skipped
        assert result["A"]["longest_segment_seconds"] == 5.0

    def test_negative_duration_segment(self):
        """Test handling of segments with negative duration (end < start)."""
        segments = [
            {"speaker": "A", "start": 10.0, "end": 5.0, "text": "Invalid segment"},
            {"speaker": "A", "start": 20.0, "end": 25.0, "text": "Valid segment"},
        ]

        result = calculate_longest_segment(segments)

        # Negative duration should be skipped
        assert result["A"]["longest_segment_seconds"] == 5.0

    def test_missing_speaker(self):
        """Test handling of segments without speaker field."""
        segments = [
            {"start": 0.0, "end": 10.0, "text": "No speaker"},
            {"speaker": "A", "start": 10.0, "end": 20.0, "text": "Has speaker"},
        ]

        result = calculate_longest_segment(segments)

        assert len(result) == 1
        assert "A" in result
        assert result["A"]["longest_segment_seconds"] == 10.0

    def test_missing_start_time(self):
        """Test handling of segments without start time."""
        segments = [
            {"speaker": "A", "end": 10.0, "text": "No start"},
            {"speaker": "A", "start": 15.0, "end": 25.0, "text": "Normal"},
        ]

        result = calculate_longest_segment(segments)

        # First segment: end (10) - start (0 default) = 10
        # Second segment: 25 - 15 = 10
        # Both are 10, so result is 10
        assert result["A"]["longest_segment_seconds"] == 10.0

    def test_missing_end_time(self):
        """Test handling of segments without end time."""
        segments = [
            {"speaker": "A", "start": 0.0, "text": "No end"},  # end defaults to 0
            {"speaker": "A", "start": 10.0, "end": 20.0, "text": "Normal"},
        ]

        result = calculate_longest_segment(segments)

        # First segment would have negative duration (0 - 0 = 0), skipped
        # Second segment: 20 - 10 = 10
        assert result["A"]["longest_segment_seconds"] == 10.0


class TestLongestSegmentRealWorld:
    """Test suite for realistic scenarios."""

    def test_monologuing_detection(self):
        """Test detecting a long monologue among shorter segments."""
        segments = [
            {"speaker": "A", "start": 0.0, "end": 5.0, "text": "Quick intro"},
            {"speaker": "B", "start": 5.0, "end": 8.0, "text": "Brief response"},
            {
                "speaker": "A",
                "start": 8.0,
                "end": 68.0,
                "text": "Long monologue...",
            },  # 60 seconds!
            {"speaker": "B", "start": 68.0, "end": 72.0, "text": "Uh huh"},
            {"speaker": "A", "start": 72.0, "end": 77.0, "text": "Wrapping up"},
        ]

        result = calculate_longest_segment(segments)

        # Speaker A's longest is the 60-second monologue
        assert result["A"]["longest_segment_seconds"] == 60.0
        # Speaker B's longest is 4 seconds
        assert result["B"]["longest_segment_seconds"] == 4.0

    def test_balanced_conversation(self):
        """Test a balanced conversation with similar segment lengths."""
        segments = [
            {"speaker": "A", "start": 0.0, "end": 12.0, "text": "First point"},
            {"speaker": "B", "start": 12.0, "end": 25.0, "text": "Response"},
            {"speaker": "A", "start": 25.0, "end": 35.0, "text": "Follow up"},
            {"speaker": "B", "start": 35.0, "end": 48.0, "text": "Agreement"},
        ]

        result = calculate_longest_segment(segments)

        assert result["A"]["longest_segment_seconds"] == 12.0
        assert result["B"]["longest_segment_seconds"] == 13.0

    def test_interview_format(self):
        """Test interview with short questions and long answers."""
        segments = [
            {"speaker": "Interviewer", "start": 0.0, "end": 5.0, "text": "Q1"},
            {"speaker": "Candidate", "start": 5.0, "end": 65.0, "text": "A1"},
            {"speaker": "Interviewer", "start": 65.0, "end": 70.0, "text": "Q2"},
            {"speaker": "Candidate", "start": 70.0, "end": 150.0, "text": "A2"},
            {"speaker": "Interviewer", "start": 150.0, "end": 155.0, "text": "Q3"},
            {"speaker": "Candidate", "start": 155.0, "end": 200.0, "text": "A3"},
        ]

        result = calculate_longest_segment(segments)

        # Interviewer's longest question is 5 seconds
        assert result["Interviewer"]["longest_segment_seconds"] == 5.0
        # Candidate's longest answer is 80 seconds (A2)
        assert result["Candidate"]["longest_segment_seconds"] == 80.0

    def test_many_speakers(self):
        """Test handling of many speakers in a meeting."""
        segments = [
            {"speaker": "Alice", "start": 0.0, "end": 15.0, "text": "..."},
            {"speaker": "Bob", "start": 15.0, "end": 25.0, "text": "..."},
            {"speaker": "Charlie", "start": 25.0, "end": 30.0, "text": "..."},
            {"speaker": "Diana", "start": 30.0, "end": 50.0, "text": "..."},
            {"speaker": "Alice", "start": 50.0, "end": 55.0, "text": "..."},
        ]

        result = calculate_longest_segment(segments)

        assert len(result) == 4
        assert result["Alice"]["longest_segment_seconds"] == 15.0
        assert result["Bob"]["longest_segment_seconds"] == 10.0
        assert result["Charlie"]["longest_segment_seconds"] == 5.0
        assert result["Diana"]["longest_segment_seconds"] == 20.0


class TestLongestSegmentPrecision:
    """Test suite for numerical precision."""

    def test_very_short_segment(self):
        """Test handling of very short segments."""
        segments = [
            {"speaker": "A", "start": 0.0, "end": 0.5, "text": "Hi"},
        ]

        result = calculate_longest_segment(segments)

        assert result["A"]["longest_segment_seconds"] == 0.5

    def test_very_long_segment(self):
        """Test handling of very long segments."""
        segments = [
            {"speaker": "A", "start": 0.0, "end": 3600.0, "text": "Hour-long segment"},
        ]

        result = calculate_longest_segment(segments)

        assert result["A"]["longest_segment_seconds"] == 3600.0

    def test_floating_point_precision(self):
        """Test floating point precision is handled correctly."""
        segments = [
            {"speaker": "A", "start": 0.1, "end": 10.2, "text": "Test"},
        ]

        result = calculate_longest_segment(segments)

        # Should be 10.1, rounded to 2 decimal places
        assert result["A"]["longest_segment_seconds"] == 10.1


# Mark all test classes as unit tests
pytest.mark.unit(TestLongestSegmentBasic)
pytest.mark.unit(TestLongestSegmentEdgeCases)
pytest.mark.unit(TestLongestSegmentRealWorld)
pytest.mark.unit(TestLongestSegmentPrecision)
