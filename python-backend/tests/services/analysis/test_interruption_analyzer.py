"""
Tests for interruption analyzer.

Tests the detection and counting of interruptions between speakers.
"""

import pytest
from app.services.analysis.interruption_analyzer import (
    calculate_per_speaker_interruptions,
)


class TestBasicInterruptions:
    """Test suite for basic interruption detection."""

    def test_simple_interruption(self):
        """Test detection of a simple interruption (overlapping segments)."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 5, "end": 15},  # Overlaps with A
        ]

        result = calculate_per_speaker_interruptions(segments)

        # B interrupted A
        assert result["A"]["times_interrupted"] == 1
        assert result["A"]["times_interrupting"] == 0
        assert result["B"]["times_interrupted"] == 0
        assert result["B"]["times_interrupting"] == 1

    def test_no_interruption_sequential_speech(self):
        """Test that sequential non-overlapping segments show no interruptions."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 10, "end": 20},  # No overlap
            {"speaker": "A", "start": 20, "end": 30},  # No overlap
        ]

        result = calculate_per_speaker_interruptions(segments)

        # No interruptions
        assert result["A"]["times_interrupted"] == 0
        assert result["A"]["times_interrupting"] == 0
        assert result["B"]["times_interrupted"] == 0
        assert result["B"]["times_interrupting"] == 0

    def test_multiple_interruptions_same_pair(self):
        """Test multiple interruptions between the same speakers."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 5, "end": 15},  # B interrupts A
            {"speaker": "A", "start": 12, "end": 20},  # A interrupts B
            {"speaker": "B", "start": 18, "end": 25},  # B interrupts A again
        ]

        result = calculate_per_speaker_interruptions(segments)

        # A: interrupted 2 times, interrupting 1 time
        assert result["A"]["times_interrupted"] == 2
        assert result["A"]["times_interrupting"] == 1

        # B: interrupted 1 time, interrupting 2 times
        assert result["B"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 2

    def test_same_speaker_no_self_interruption(self):
        """Test that same speaker consecutive segments don't count as interruptions."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "A", "start": 5, "end": 15},  # Same speaker overlap
        ]

        result = calculate_per_speaker_interruptions(segments)

        # No interruptions (same speaker)
        assert result["A"]["times_interrupted"] == 0
        assert result["A"]["times_interrupting"] == 0

    def test_single_segment_no_interruption(self):
        """Test with single segment - no interruptions possible."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
        ]

        result = calculate_per_speaker_interruptions(segments)

        assert result == {}

    def test_empty_segments(self):
        """Test with empty segments list."""
        segments = []

        result = calculate_per_speaker_interruptions(segments)

        assert result == {}


class TestInterruptionRate:
    """Test suite for interruption rate calculation."""

    def test_interruption_rate_calculation(self):
        """Test that interruption rate is calculated correctly (per minute)."""
        segments = [
            {"speaker": "A", "start": 0, "end": 60},  # 1 minute of talk
            {"speaker": "B", "start": 30, "end": 90},  # 1 minute, interrupts A
        ]

        result = calculate_per_speaker_interruptions(segments)

        # A: interrupted 1 time, but never interrupted anyone = 0.0 rate
        assert result["A"]["interruption_rate"] == 0.0

        # B: interrupted A once in 1 minute = 1.0 per minute
        assert result["B"]["interruption_rate"] == 1.0

    def test_high_interruption_rate(self):
        """Test speaker with high interruption rate."""
        segments = [
            {"speaker": "A", "start": 0, "end": 30},  # 30 seconds
            {"speaker": "B", "start": 10, "end": 40},  # Interrupts A segment 0
            {"speaker": "A", "start": 25, "end": 50},  # Interrupts B segment 1
            {"speaker": "B", "start": 35, "end": 60},  # Interrupts A segment 2
        ]

        result = calculate_per_speaker_interruptions(segments)

        # A: Talk time = (30-0) + (50-25) = 30 + 25 = 55 seconds = 0.92 minutes
        # A was interrupted 2 times (by B segment 1 and B segment 3)
        # A interrupted 1 time (B segment 1)
        # Rate = 1 / 0.92 = 1.09 per minute
        assert result["A"]["interruption_rate"] == 1.09
        assert result["A"]["times_interrupted"] == 2
        assert result["A"]["times_interrupting"] == 1

        # B: Talk time = (40-10) + (60-35) = 30 + 25 = 55 seconds = 0.92 minutes
        # B was interrupted 1 time (by A segment 2)
        # B interrupted 2 times (A segment 0 and A segment 2)
        # Rate = 2 / 0.92 = 2.18 per minute (rounded)
        assert result["B"]["interruption_rate"] == 2.18
        assert result["B"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 2

    def test_zero_interruption_rate(self):
        """Test speakers with no interruptions."""
        segments = [
            {"speaker": "A", "start": 0, "end": 60},
            {"speaker": "B", "start": 60, "end": 120},  # No overlap
        ]

        result = calculate_per_speaker_interruptions(segments)

        assert result["A"]["interruption_rate"] == 0.0
        assert result["B"]["interruption_rate"] == 0.0

    def test_interruption_rate_short_talk_time(self):
        """Test interruption rate with very short talk time."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},  # 5 seconds
            {"speaker": "B", "start": 3, "end": 8},  # Interrupts
        ]

        result = calculate_per_speaker_interruptions(segments)

        # A: was interrupted but didn't interrupt anyone = 0.0 rate
        # B: 5 seconds = 5/60 minutes, interrupted A once
        # Rate = 1 / (5/60) = 12.0 per minute
        assert result["A"]["interruption_rate"] == 0.0
        assert result["B"]["interruption_rate"] == 12.0


class TestThreeSpeakers:
    """Test suite for scenarios with three or more speakers."""

    def test_three_speakers_mixed_interruptions(self):
        """Test interruptions between three speakers."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 5, "end": 15},  # B interrupts A
            {"speaker": "C", "start": 12, "end": 20},  # C interrupts B
            {"speaker": "A", "start": 18, "end": 25},  # A interrupts C
        ]

        result = calculate_per_speaker_interruptions(segments)

        # A: interrupted 1 time (by B), interrupting 1 time (C)
        assert result["A"]["times_interrupted"] == 1
        assert result["A"]["times_interrupting"] == 1

        # B: interrupted 1 time (by C), interrupting 1 time (A)
        assert result["B"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1

        # C: interrupted 1 time (by A), interrupting 1 time (B)
        assert result["C"]["times_interrupted"] == 1
        assert result["C"]["times_interrupting"] == 1

    def test_one_speaker_interrupts_everyone(self):
        """Test one speaker interrupting multiple others."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "C", "start": 5, "end": 15},  # C interrupts A
            {"speaker": "B", "start": 12, "end": 20},  # B interrupts C
            {"speaker": "C", "start": 18, "end": 25},  # C interrupts B
        ]

        result = calculate_per_speaker_interruptions(segments)

        # C interrupts A once and B once = 2 interruptions
        # C is interrupted by B once = 1 time interrupted
        assert result["C"]["times_interrupting"] == 2
        assert result["C"]["times_interrupted"] == 1

        # A interrupted once by C
        assert result["A"]["times_interrupted"] == 1
        assert result["A"]["times_interrupting"] == 0

        # B interrupts C once and is interrupted by C once
        assert result["B"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1


class TestOverlapDetection:
    """Test suite for different types of overlapping scenarios."""

    def test_partial_overlap_beginning(self):
        """Test overlap at the beginning of a segment."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 8, "end": 15},  # Overlaps last 2 seconds
        ]

        result = calculate_per_speaker_interruptions(segments)

        assert result["A"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1

    def test_partial_overlap_end(self):
        """Test overlap at the end of a segment."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 2, "end": 8},  # Overlaps middle portion
        ]

        result = calculate_per_speaker_interruptions(segments)

        assert result["A"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1

    def test_complete_overlap(self):
        """Test when one segment completely overlaps another."""
        segments = [
            {"speaker": "A", "start": 0, "end": 20},
            {"speaker": "B", "start": 5, "end": 15},  # Completely inside A
        ]

        result = calculate_per_speaker_interruptions(segments)

        assert result["A"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1

    def test_exact_boundary_no_overlap(self):
        """Test that exact boundaries don't count as overlap."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 10, "end": 20},  # Start exactly at A's end
        ]

        result = calculate_per_speaker_interruptions(segments)

        # No overlap (boundary touch)
        assert result["A"]["times_interrupted"] == 0
        assert result["B"]["times_interrupting"] == 0

    def test_minimal_overlap(self):
        """Test minimal overlap (fraction of a second)."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 9.99, "end": 15},  # 0.01 second overlap
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Even minimal overlap counts
        assert result["A"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1


class TestEdgeCases:
    """Test suite for edge cases and unusual scenarios."""

    def test_missing_speaker_field(self):
        """Test handling of segments without speaker field."""
        segments = [
            {"start": 0, "end": 10},  # Missing speaker
            {"speaker": "B", "start": 5, "end": 15},
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Should handle gracefully
        assert isinstance(result, dict)

    def test_missing_time_fields(self):
        """Test handling of segments with missing start/end times."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B"},  # Missing start/end
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Should use default 0 values
        assert isinstance(result, dict)

    def test_zero_duration_segment(self):
        """Test segment with zero duration (start == end)."""
        segments = [
            {"speaker": "A", "start": 5, "end": 5},
            {"speaker": "B", "start": 5, "end": 10},
        ]

        result = calculate_per_speaker_interruptions(segments)

        # No overlap with zero duration
        assert result["A"]["times_interrupted"] == 0
        assert result["B"]["times_interrupting"] == 0

    def test_reversed_time_invalid_segment(self):
        """Test segment with end before start (invalid)."""
        segments = [
            {"speaker": "A", "start": 10, "end": 5},  # Invalid
            {"speaker": "B", "start": 7, "end": 12},
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Should handle gracefully (no overlap detected)
        assert result["A"]["times_interrupted"] == 0
        assert result["B"]["times_interrupting"] == 0

    def test_very_long_overlap(self):
        """Test very long overlapping segments."""
        segments = [
            {"speaker": "A", "start": 0, "end": 1000},
            {"speaker": "B", "start": 100, "end": 900},  # 800 second overlap
        ]

        result = calculate_per_speaker_interruptions(segments)

        assert result["A"]["times_interrupted"] == 1
        assert result["B"]["times_interrupting"] == 1


class TestRealWorldScenarios:
    """Test suite for realistic conversation scenarios."""

    def test_heated_debate_many_interruptions(self):
        """Test a heated debate with frequent interruptions."""
        segments = [
            {"speaker": "A", "start": 0, "end": 15},
            {"speaker": "B", "start": 5, "end": 20},  # Interrupts
            {"speaker": "A", "start": 12, "end": 25},  # Interrupts back
            {"speaker": "B", "start": 18, "end": 30},  # Interrupts again
            {"speaker": "A", "start": 22, "end": 35},  # Interrupts again
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Both speakers interrupt frequently
        assert result["A"]["times_interrupting"] >= 2
        assert result["B"]["times_interrupting"] >= 2
        assert result["A"]["interruption_rate"] > 0
        assert result["B"]["interruption_rate"] > 0

    def test_polite_conversation_no_interruptions(self):
        """Test polite conversation with clear turn-taking."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 11, "end": 20},
            {"speaker": "A", "start": 21, "end": 30},
            {"speaker": "B", "start": 31, "end": 40},
        ]

        result = calculate_per_speaker_interruptions(segments)

        # No interruptions in polite conversation
        assert result["A"]["times_interrupted"] == 0
        assert result["A"]["times_interrupting"] == 0
        assert result["A"]["interruption_rate"] == 0.0
        assert result["B"]["times_interrupted"] == 0
        assert result["B"]["times_interrupting"] == 0
        assert result["B"]["interruption_rate"] == 0.0

    def test_presenter_with_questions(self):
        """Test presenter being interrupted by questions."""
        segments = [
            {"speaker": "Presenter", "start": 0, "end": 60},
            {"speaker": "Audience", "start": 30, "end": 35},  # Question interrupts
            {"speaker": "Presenter", "start": 36, "end": 90},
            {"speaker": "Audience", "start": 75, "end": 80},  # Another question
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Presenter gets interrupted by audience questions
        assert result["Presenter"]["times_interrupted"] == 2
        assert result["Audience"]["times_interrupting"] == 2

    def test_panel_discussion_cross_talk(self):
        """Test panel discussion with occasional cross-talk."""
        segments = [
            {"speaker": "A", "start": 0, "end": 20},
            {"speaker": "B", "start": 15, "end": 35},  # Overlaps with A
            {"speaker": "C", "start": 30, "end": 50},  # Overlaps with B
            {"speaker": "A", "start": 45, "end": 60},  # Overlaps with C
        ]

        result = calculate_per_speaker_interruptions(segments)

        # Each speaker gets interrupted once
        assert result["A"]["times_interrupted"] == 1
        assert result["B"]["times_interrupted"] == 1
        assert result["C"]["times_interrupted"] == 1

        # Each speaker interrupts once
        assert result["A"]["times_interrupting"] == 1
        assert result["B"]["times_interrupting"] == 1
        assert result["C"]["times_interrupting"] == 1


# Mark all test classes as unit tests
pytest.mark.unit(TestBasicInterruptions)
pytest.mark.unit(TestInterruptionRate)
pytest.mark.unit(TestThreeSpeakers)
pytest.mark.unit(TestOverlapDetection)
pytest.mark.unit(TestEdgeCases)
pytest.mark.unit(TestRealWorldScenarios)
