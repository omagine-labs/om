"""
Tests for response latency analyzer.

Tests the calculation of response timing metrics between speakers.
"""

import pytest
from app.services.analysis.response_latency_analyzer import (
    calculate_per_speaker_response_latency,
)


class TestBasicResponseLatency:
    """Test suite for basic response latency calculation."""

    def test_calculates_simple_gap(self):
        """Test calculation of a simple gap between speakers."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 6, "end": 10},  # 1 second gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert "B" in result
        assert result["B"]["average_seconds"] == 1.0
        assert result["B"]["response_count"] == 1

    def test_no_gap_immediate_response(self):
        """Test when speaker responds immediately with no gap."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 5, "end": 10},  # 0 second gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert "B" in result
        assert result["B"]["average_seconds"] == 0.0
        assert result["B"]["response_count"] == 1

    def test_multiple_responses_same_speaker(self):
        """Test averaging multiple responses from the same speaker."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 6, "end": 10},  # 1 second gap
            {"speaker": "A", "start": 12, "end": 15},  # 2 second gap
            {"speaker": "B", "start": 15.5, "end": 20},  # 0.5 second gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        # A responds twice: 2s average
        assert result["A"]["average_seconds"] == 2.0
        assert result["A"]["response_count"] == 1

        # B responds twice: (1 + 0.5) / 2 = 0.75
        assert result["B"]["average_seconds"] == 0.75
        assert result["B"]["response_count"] == 2

    def test_single_segment_no_response(self):
        """Test with single segment - no responses to calculate."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result == {}

    def test_empty_segments(self):
        """Test with empty segments list."""
        segments = []

        result = calculate_per_speaker_response_latency(segments)

        assert result == {}

    def test_same_speaker_consecutive_segments(self):
        """Test that consecutive segments from same speaker don't count as responses."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "A", "start": 6, "end": 10},  # Same speaker, not a response
            {"speaker": "B", "start": 11, "end": 15},  # This is a response
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Only B responded (to A's second segment)
        assert "B" in result
        assert result["B"]["response_count"] == 1
        # A didn't respond to anyone
        assert "A" not in result


class TestQuickResponses:
    """Test suite for quick response percentage calculation."""

    def test_all_quick_responses(self):
        """Test when all responses are quick (< 1 second)."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 5.5, "end": 10},  # 0.5s gap
            {"speaker": "A", "start": 10.2, "end": 15},  # 0.2s gap
            {"speaker": "B", "start": 15.8, "end": 20},  # 0.8s gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["A"]["quick_responses_percentage"] == 100.0
        assert result["A"]["quick_responses_count"] == 1
        assert result["B"]["quick_responses_percentage"] == 100.0
        assert result["B"]["quick_responses_count"] == 2

    def test_no_quick_responses(self):
        """Test when no responses are quick (all >= 1 second)."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 7, "end": 10},  # 2s gap
            {"speaker": "A", "start": 12, "end": 15},  # 2s gap
            {"speaker": "B", "start": 18, "end": 20},  # 3s gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["A"]["quick_responses_percentage"] == 0.0
        assert result["A"]["quick_responses_count"] == 0
        assert result["B"]["quick_responses_percentage"] == 0.0
        assert result["B"]["quick_responses_count"] == 0

    def test_mixed_quick_and_slow_responses(self):
        """Test with mix of quick and slow responses."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 5.5, "end": 10},  # 0.5s (quick)
            {"speaker": "A", "start": 12, "end": 15},  # 2s (slow)
            {"speaker": "B", "start": 15.3, "end": 20},  # 0.3s (quick)
            {"speaker": "A", "start": 23, "end": 25},  # 3s (slow)
        ]

        result = calculate_per_speaker_response_latency(segments)

        # B: 2 quick out of 2 = 100%
        assert result["B"]["quick_responses_percentage"] == 100.0
        assert result["B"]["quick_responses_count"] == 2

        # A: 0 quick out of 2 = 0%
        assert result["A"]["quick_responses_percentage"] == 0.0
        assert result["A"]["quick_responses_count"] == 0

    def test_exactly_one_second_not_quick(self):
        """Test that exactly 1 second gap is not counted as quick."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 6, "end": 10},  # Exactly 1s gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["B"]["quick_responses_percentage"] == 0.0
        assert result["B"]["quick_responses_count"] == 0


class TestMultipleSpeakers:
    """Test suite for scenarios with multiple speakers."""

    def test_three_speakers_response_chain(self):
        """Test response latency with three speakers in sequence."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 6, "end": 10},  # B responds to A: 1s
            {"speaker": "C", "start": 11.5, "end": 15},  # C responds to B: 1.5s
            {"speaker": "A", "start": 16, "end": 20},  # A responds to C: 1s
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["A"]["average_seconds"] == 1.0
        assert result["B"]["average_seconds"] == 1.0
        assert result["C"]["average_seconds"] == 1.5

    def test_multiple_speakers_different_patterns(self):
        """Test multiple speakers with different response patterns."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 5.2, "end": 10},  # B quick: 0.2s
            {"speaker": "C", "start": 13, "end": 15},  # C slow: 3s
            {"speaker": "A", "start": 15.5, "end": 20},  # A quick: 0.5s
            {"speaker": "B", "start": 23, "end": 25},  # B slow: 3s
        ]

        result = calculate_per_speaker_response_latency(segments)

        # B: (0.2 + 3) / 2 = 1.6, 1 quick out of 2 = 50%
        assert result["B"]["average_seconds"] == 1.6
        assert result["B"]["quick_responses_percentage"] == 50.0

        # C: 3s, 0 quick
        assert result["C"]["average_seconds"] == 3.0
        assert result["C"]["quick_responses_percentage"] == 0.0

        # A: 0.5s, 1 quick out of 1 = 100%
        assert result["A"]["average_seconds"] == 0.5
        assert result["A"]["quick_responses_percentage"] == 100.0


class TestEdgeCases:
    """Test suite for edge cases and unusual scenarios."""

    def test_negative_gap_overlapping_segments(self):
        """Test handling of overlapping segments (negative gap)."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 4, "end": 10},  # Overlaps with A
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Negative gaps should not be counted
        assert "B" not in result

    def test_very_long_gap(self):
        """Test with very long gap between speakers."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 100, "end": 105},  # 95 second gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["B"]["average_seconds"] == 95.0
        assert result["B"]["quick_responses_percentage"] == 0.0

    def test_missing_speaker_field(self):
        """Test handling of segments without speaker field."""
        segments = [
            {"start": 0, "end": 5},  # Missing speaker
            {"speaker": "B", "start": 6, "end": 10},
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Should handle gracefully - returns empty when speaker changes from None
        assert isinstance(result, dict)

    def test_missing_time_fields(self):
        """Test handling of segments with missing start/end times."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B"},  # Missing start/end
            {"speaker": "A", "start": 10, "end": 15},
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Should use default 0 values for missing fields
        assert "B" in result or "A" in result

    def test_fractional_seconds_precision(self):
        """Test that fractional seconds are handled with proper precision."""
        segments = [
            {"speaker": "A", "start": 0, "end": 5.123},
            {"speaker": "B", "start": 5.456, "end": 10},  # 0.333s gap
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Should round to 2 decimal places
        assert result["B"]["average_seconds"] == 0.33

    def test_zero_duration_segment(self):
        """Test segment with zero duration (start == end)."""
        segments = [
            {"speaker": "A", "start": 5, "end": 5},
            {"speaker": "B", "start": 6, "end": 10},
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["B"]["average_seconds"] == 1.0


class TestRealWorldScenarios:
    """Test suite for realistic conversation scenarios."""

    def test_active_discussion_quick_exchanges(self):
        """Test an active discussion with quick back-and-forth."""
        segments = [
            {"speaker": "A", "start": 0, "end": 3},
            {"speaker": "B", "start": 3.2, "end": 6},  # 0.2s
            {"speaker": "A", "start": 6.1, "end": 9},  # 0.1s
            {"speaker": "B", "start": 9.3, "end": 12},  # 0.3s
            {"speaker": "A", "start": 12.2, "end": 15},  # 0.2s
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Both speakers very responsive
        assert result["A"]["average_seconds"] <= 0.2
        assert result["A"]["quick_responses_percentage"] == 100.0
        assert result["B"]["average_seconds"] <= 0.3
        assert result["B"]["quick_responses_percentage"] == 100.0

    def test_slow_deliberate_conversation(self):
        """Test a slow, deliberate conversation with long pauses."""
        segments = [
            {"speaker": "A", "start": 0, "end": 10},
            {"speaker": "B", "start": 15, "end": 25},  # 5s pause
            {"speaker": "A", "start": 30, "end": 40},  # 5s pause
            {"speaker": "B", "start": 46, "end": 50},  # 6s pause
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Both speakers take time to respond
        assert result["A"]["average_seconds"] == 5.0
        assert result["A"]["quick_responses_percentage"] == 0.0
        assert result["B"]["average_seconds"] == 5.5
        assert result["B"]["quick_responses_percentage"] == 0.0

    def test_presenter_and_audience_pattern(self):
        """Test presenter speaking at length with brief audience responses."""
        segments = [
            {"speaker": "Presenter", "start": 0, "end": 60},  # Long presentation
            {"speaker": "Audience", "start": 62, "end": 65},  # 2s to respond
            {"speaker": "Presenter", "start": 66, "end": 120},  # 1s to continue
            {"speaker": "Audience", "start": 123, "end": 126},  # 3s to respond
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Presenter responds once with 1.0s gap
        assert result["Presenter"]["average_seconds"] == 1.0
        assert result["Presenter"]["response_count"] == 1
        # Only 1 response, and it's quick (1s is not < 1.0, so not quick)
        assert result["Presenter"]["quick_responses_percentage"] == 0.0
        assert result["Presenter"]["quick_responses_count"] == 0

        # Audience responds twice: 2s and 3s = average 2.5s
        assert result["Audience"]["average_seconds"] == 2.5
        assert result["Audience"]["response_count"] == 2
        assert result["Audience"]["quick_responses_percentage"] == 0.0


class TestPerSpeakerIsolation:
    """Test suite for validating per-speaker metric isolation.

    Ensures that each speaker's response latency metrics only include their own
    response times, not other speakers' response times.
    """

    def test_speaker_metrics_exclude_other_speakers_responses(self):
        """Verify each speaker's metrics only include their own response times.

        This test validates the critical requirement for per-speaker isolation:
        - Speaker A responds in 0.5s → Speaker A sees 0.5s in their metrics
        - Speaker B responds in 1.5s → Speaker B sees 1.5s in their metrics
        - Speaker A's metrics do NOT include Speaker B's 1.5s responses
        """
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 6.5, "end": 10},  # B responds: 1.5s
            {"speaker": "A", "start": 10.5, "end": 15},  # A responds: 0.5s
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Speaker A only has 1 response (0.5s)
        assert result["A"]["average_seconds"] == 0.5
        assert result["A"]["response_count"] == 1

        # Speaker B only has 1 response (1.5s)
        assert result["B"]["average_seconds"] == 1.5
        assert result["B"]["response_count"] == 1

        # Verify isolation: A's avg should NOT equal B's avg
        assert result["A"]["average_seconds"] != result["B"]["average_seconds"]

    def test_three_speaker_isolation(self):
        """Verify isolation works correctly with three speakers.

        Each speaker should have different response latencies based only on
        their own response patterns, not contaminated by other speakers.
        """
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 5.3, "end": 10},  # B: 0.3s (quick)
            {"speaker": "C", "start": 12.5, "end": 15},  # C: 2.5s (slow)
            {"speaker": "A", "start": 16, "end": 20},  # A: 1.0s (boundary)
        ]

        result = calculate_per_speaker_response_latency(segments)

        assert result["A"]["average_seconds"] == 1.0
        assert result["B"]["average_seconds"] == 0.3
        assert result["C"]["average_seconds"] == 2.5

        # All three should be different
        averages = [r["average_seconds"] for r in result.values()]
        assert len(set(averages)) == 3, "All speakers should have unique averages"

        # Verify quick response percentages are also isolated
        assert result["B"]["quick_responses_percentage"] == 100.0  # 0.3s is quick
        assert result["A"]["quick_responses_percentage"] == 0.0  # 1.0s is not quick
        assert result["C"]["quick_responses_percentage"] == 0.0  # 2.5s is not quick

    def test_multi_response_per_speaker_isolation(self):
        """Verify isolation with multiple responses per speaker.

        When speakers have multiple responses, their averages should only
        reflect their own response patterns across all their responses.
        """
        segments = [
            {"speaker": "A", "start": 0, "end": 5},
            {"speaker": "B", "start": 6, "end": 10},  # B: 1.0s
            {"speaker": "A", "start": 10.5, "end": 15},  # A: 0.5s
            {"speaker": "B", "start": 18, "end": 22},  # B: 3.0s
            {"speaker": "A", "start": 22.2, "end": 27},  # A: 0.2s
        ]

        result = calculate_per_speaker_response_latency(segments)

        # Speaker A: (0.5 + 0.2) / 2 = 0.35
        assert result["A"]["average_seconds"] == 0.35
        assert result["A"]["response_count"] == 2
        assert result["A"]["quick_responses_percentage"] == 100.0

        # Speaker B: (1.0 + 3.0) / 2 = 2.0
        assert result["B"]["average_seconds"] == 2.0
        assert result["B"]["response_count"] == 2
        assert result["B"]["quick_responses_percentage"] == 0.0

        # Verify B's slow 3.0s response doesn't affect A's metrics
        assert result["A"]["average_seconds"] < 1.0

    def test_speaker_with_no_responses_excluded(self):
        """Verify that a speaker who never responds is not in the results.

        If Speaker A talks but never responds to anyone else (only talks first
        or consecutively), they should not have response latency metrics.
        """
        segments = [
            {"speaker": "A", "start": 0, "end": 5},  # A starts
            {"speaker": "A", "start": 6, "end": 10},  # A continues (consecutive)
            {"speaker": "B", "start": 11, "end": 15},  # B responds to A
            {"speaker": "C", "start": 16, "end": 20},  # C responds to B
        ]

        result = calculate_per_speaker_response_latency(segments)

        # A never responded to anyone, so shouldn't have metrics
        assert "A" not in result

        # B and C both responded once
        assert "B" in result
        assert result["B"]["response_count"] == 1
        assert "C" in result
        assert result["C"]["response_count"] == 1


# Mark all test classes as unit tests
pytest.mark.unit(TestBasicResponseLatency)
pytest.mark.unit(TestQuickResponses)
pytest.mark.unit(TestMultipleSpeakers)
pytest.mark.unit(TestEdgeCases)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestPerSpeakerIsolation)
