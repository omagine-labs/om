"""
Tests for MetricsAnalyzer service.

These tests demonstrate testing patterns for metrics calculation logic
and serve as examples for validating metrics like verbosity.
"""

import pytest
from tests.fixtures.mock_transcription import (
    create_single_speaker_transcription,
    create_multi_speaker_transcription,
    create_empty_transcription,
    create_verbosity_test_transcription,
    create_edge_case_transcription,
)


class TestMetricsAnalyzer:
    """Test suite for AnalysisOrchestrator.analyze() method."""

    async def test_analyze_returns_dict(self, metrics_analyzer, mock_transcription):
        """Test that analyze returns a dictionary."""
        result = await metrics_analyzer.analyze("job-123", mock_transcription)

        assert isinstance(result, dict)

    async def test_analyze_empty_transcription(self, metrics_analyzer):
        """Test handling of empty transcription."""
        empty_transcription = create_empty_transcription()

        result = await metrics_analyzer.analyze("job-123", empty_transcription)

        # Should return empty dict for no speakers
        assert result == {}

    async def test_analyze_single_speaker(self, metrics_analyzer):
        """Test analysis with single speaker."""
        transcription = create_single_speaker_transcription(
            speaker="A", segment_count=3, words_per_segment=5
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should have one speaker
        assert "A" in result
        assert len(result) == 1

        # Should have basic stats
        assert "total_time" in result["A"]
        assert "word_count" in result["A"]
        assert "segments" in result["A"]
        assert "percentage" in result["A"]
        assert "verbosity" in result["A"]
        assert "words_per_minute" in result["A"]

    async def test_analyze_multiple_speakers(self, metrics_analyzer):
        """Test analysis with multiple speakers."""
        transcription = create_multi_speaker_transcription(
            speakers=["A", "B", "C"], segments_per_speaker=2, words_per_segment=5
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should have three speakers
        assert "A" in result
        assert "B" in result
        assert "C" in result
        assert len(result) == 3


class TestVerbosityMetric:
    """
    Test suite for verbosity metric calculation (word_count / segments).

    These tests validate the calculation accuracy for verbosity metrics.
    """

    async def test_basic_verbosity_calculation(self, metrics_analyzer):
        """Test standard verbosity calculation with known values."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello world test", "start": 0, "end": 1},
                {
                    "speaker": "A",
                    "text": "Another sentence here",
                    "start": 2,
                    "end": 3,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Verify raw metrics
        assert result["A"]["word_count"] == 6  # 3 + 3 words
        assert result["A"]["segments"] == 2

        # Implied verbosity = 6 / 2 = 3.0 words per segment

    async def test_verbosity_with_known_values(self, metrics_analyzer):
        """Test verbosity calculation with pre-calculated expected values."""
        transcription = create_verbosity_test_transcription()

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Speaker A: 13 words / 3 segments = 4.33 words/segment
        assert result["A"]["word_count"] == 13
        assert result["A"]["segments"] == 3

        # Speaker B: 15 words / 2 segments = 7.5 words/segment
        assert result["B"]["word_count"] == 15
        assert result["B"]["segments"] == 2

    async def test_verbosity_multiple_speakers_tracked_separately(
        self, metrics_analyzer
    ):
        """Test that each speaker's verbosity is tracked independently."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello", "start": 0, "end": 1},
                {
                    "speaker": "B",
                    "text": "Hi there friend",
                    "start": 1,
                    "end": 2,
                },
                {"speaker": "A", "text": "How are you", "start": 2, "end": 3},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Speaker A: 4 words / 2 segments = 2.0 words/segment
        assert result["A"]["word_count"] == 4  # "Hello" (1) + "How are you" (3)
        assert result["A"]["segments"] == 2

        # Speaker B: 3 words / 1 segment = 3.0 words/segment
        assert result["B"]["word_count"] == 3
        assert result["B"]["segments"] == 1

    async def test_verbosity_single_segment(self, metrics_analyzer):
        """Test verbosity with only one segment."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "This is a longer monologue with fourteen words in it here now done",
                    "start": 0,
                    "end": 5,
                }
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Single segment: verbosity = total word count (13 words)
        assert result["A"]["word_count"] == 13
        assert result["A"]["segments"] == 1

    async def test_verbosity_empty_segment_handling(self, metrics_analyzer):
        """Test handling of empty text in segments."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "", "start": 0, "end": 1},
                {
                    "speaker": "A",
                    "text": "   ",
                    "start": 2,
                    "end": 3,
                },  # Whitespace only
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Empty and whitespace-only segments should count as 0 words
        assert result["A"]["word_count"] == 0
        assert result["A"]["segments"] == 2
        # Implied verbosity = 0 / 2 = 0.0 words/segment

    async def test_verbosity_multiple_spaces_handling(self, metrics_analyzer):
        """Test that multiple consecutive spaces are handled correctly."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "hello  world   test",  # Multiple spaces
                    "start": 0,
                    "end": 1,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Python's split() handles multiple spaces correctly (returns 3 words)
        assert result["A"]["word_count"] == 3

    async def test_verbosity_edge_cases(self, metrics_analyzer):
        """Test verbosity calculation with various edge cases."""
        transcription = create_edge_case_transcription()

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Speaker A: 0 words (empty + whitespace) / 2 segments = 0.0
        assert result["A"]["word_count"] == 0
        assert result["A"]["segments"] == 2
        assert result["A"]["verbosity"] == 0.0

        # Speaker B: 4 words (3 + 1) / 2 segments = 2.0
        assert result["B"]["word_count"] == 4
        assert result["B"]["segments"] == 2
        assert result["B"]["verbosity"] == 2.0

        # Speaker C: 100 words / 1 segment = 100.0 (very high verbosity)
        assert result["C"]["word_count"] == 100
        assert result["C"]["segments"] == 1
        assert result["C"]["verbosity"] == 100.0


class TestPercentageCalculation:
    """Test suite for speaker percentage calculation."""

    async def test_percentage_calculation(self, metrics_analyzer):
        """Test that speaker percentages sum to 100%."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello", "start": 0, "end": 10},  # 10 seconds
                {"speaker": "B", "text": "Hi", "start": 10, "end": 20},  # 10 seconds
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Each speaker has 50% of talk time
        assert result["A"]["percentage"] == 50.0
        assert result["B"]["percentage"] == 50.0

        # Total should sum to 100%
        total_percentage = sum(stats["percentage"] for stats in result.values())
        assert total_percentage == 100.0

    async def test_percentage_with_zero_total_time(self, metrics_analyzer):
        """Test percentage calculation when total time is zero."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello", "start": 0, "end": 0},  # 0 seconds
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should handle division by zero gracefully
        assert result["A"]["percentage"] == 0


class TestResponseLatency:
    """Test suite for response latency metrics."""

    async def test_response_latency_calculated(self, metrics_analyzer):
        """Test that response latency is included in results."""
        transcription = create_multi_speaker_transcription(
            speakers=["A", "B"], segments_per_speaker=2
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Response latency metrics should be present
        assert "response_latency" in result["A"]
        assert "response_count" in result["A"]
        assert "quick_responses_percentage" in result["A"]

    async def test_orchestrator_maintains_speaker_isolation(self, metrics_analyzer):
        """Integration test: Verify orchestrator maintains per-speaker isolation.

        This test validates that each speaker's response latency metrics only
        include their own response times, not other speakers' response times.
        """
        transcription = {
            "segments": [
                {"speaker": "A", "start": 0, "end": 5, "text": "Hello there"},
                {"speaker": "B", "start": 8, "end": 12, "text": "Hi"},  # 3s gap
                {
                    "speaker": "A",
                    "start": 12.5,
                    "end": 17,
                    "text": "How are you",
                },  # 0.5s gap
            ],
            "duration": 20,
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Verify isolation: A's response latency is 0.5s, B's is 3.0s
        assert result["A"]["response_latency"] == 0.5
        assert result["B"]["response_latency"] == 3.0
        assert result["A"]["response_count"] == 1
        assert result["B"]["response_count"] == 1

        # Verify they are different (no cross-contamination)
        assert result["A"]["response_latency"] != result["B"]["response_latency"]

    async def test_three_speaker_orchestrator_isolation(self, metrics_analyzer):
        """Integration test: Verify isolation with three speakers.

        Each speaker should have distinct response latency based only on
        their own responses.
        """
        transcription = {
            "segments": [
                {"speaker": "A", "start": 0, "end": 5, "text": "Starting"},
                {
                    "speaker": "B",
                    "start": 5.3,
                    "end": 10,
                    "text": "Quick response",
                },  # 0.3s
                {
                    "speaker": "C",
                    "start": 12.5,
                    "end": 15,
                    "text": "Slow response",
                },  # 2.5s
                {
                    "speaker": "A",
                    "start": 16,
                    "end": 20,
                    "text": "Normal response",
                },  # 1.0s
            ],
            "duration": 25,
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Each speaker should have unique response latency
        assert result["A"]["response_latency"] == 1.0
        assert result["B"]["response_latency"] == 0.3
        assert result["C"]["response_latency"] == 2.5

        # Verify all different
        latencies = [
            result["A"]["response_latency"],
            result["B"]["response_latency"],
            result["C"]["response_latency"],
        ]
        assert len(set(latencies)) == 3, "All speakers should have unique latencies"


class TestPillarScores:
    """Test suite for pillar score metrics."""

    async def test_pillar_scores_included_in_results(self, metrics_analyzer):
        """Test that pillar score fields are included in results."""
        transcription = create_multi_speaker_transcription(
            speakers=["A", "B"], segments_per_speaker=2
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Pillar score fields should be present (may be None if agentic scores failed)
        assert "content_pillar_score" in result["A"]
        assert "poise_pillar_score" in result["A"]
        assert "connection_pillar_score" in result["A"]

    async def test_pillar_scores_type(self, metrics_analyzer):
        """Test that pillar scores are float or None."""
        transcription = create_single_speaker_transcription(
            speaker="A", segment_count=3
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Each pillar score should be float or None
        for pillar_key in [
            "content_pillar_score",
            "poise_pillar_score",
            "connection_pillar_score",
        ]:
            value = result["A"][pillar_key]
            assert value is None or isinstance(value, float)


class TestInterruptions:
    """Test suite for interruption metrics."""

    async def test_interruption_metrics_calculated(self, metrics_analyzer):
        """Test that interruption metrics are included in results."""
        transcription = create_multi_speaker_transcription(
            speakers=["A", "B"], segments_per_speaker=2
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Interruption metrics should be present
        assert "times_interrupted" in result["A"]
        assert "times_interrupting" in result["A"]
        assert "interruption_rate" in result["A"]

    async def test_no_interruptions_for_single_speaker(self, metrics_analyzer):
        """Test that single speaker has no interruptions."""
        transcription = create_single_speaker_transcription(
            speaker="A", segment_count=3
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Single speaker cannot interrupt or be interrupted
        assert result["A"]["times_interrupted"] == 0
        assert result["A"]["times_interrupting"] == 0
        assert result["A"]["interruption_rate"] == 0.0


class TestWordsPerMinute:
    """Test suite for words per minute calculation."""

    async def test_wpm_metric_included(self, metrics_analyzer):
        """Test that WPM metric is included in results."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello world test", "start": 0, "end": 1.2},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # WPM should be present
        assert "words_per_minute" in result["A"]
        assert isinstance(result["A"]["words_per_minute"], float)

    async def test_wpm_calculation_accuracy(self, metrics_analyzer):
        """Test WPM calculation with known values."""
        # 100 words in 40 seconds = 150 WPM
        words = " ".join(["word"] * 100)
        transcription = {
            "segments": [
                {"speaker": "A", "text": words, "start": 0, "end": 40.0},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should calculate 150 WPM
        assert result["A"]["word_count"] == 100
        assert result["A"]["total_time"] == 40.0
        assert result["A"]["words_per_minute"] == 150.0

    async def test_wpm_zero_duration_handling(self, metrics_analyzer):
        """Test WPM with zero duration returns 0.0."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello world", "start": 0, "end": 0},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should handle zero duration gracefully
        assert result["A"]["words_per_minute"] == 0.0

    async def test_wpm_multiple_speakers_independent(self, metrics_analyzer):
        """Test that WPM is calculated independently per speaker."""
        # Speaker A: 50 words in 30 seconds = 100 WPM
        # Speaker B: 100 words in 40 seconds = 150 WPM
        words_a = " ".join(["word"] * 50)
        words_b = " ".join(["word"] * 100)
        transcription = {
            "segments": [
                {"speaker": "A", "text": words_a, "start": 0, "end": 30.0},
                {"speaker": "B", "text": words_b, "start": 30, "end": 70.0},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Each speaker should have independent WPM
        assert result["A"]["words_per_minute"] == 100.0
        assert result["B"]["words_per_minute"] == 150.0

    async def test_wpm_realistic_range(self, metrics_analyzer):
        """Test WPM with realistic speaking rates."""
        # 150 words in 60 seconds = 150 WPM (normal conversation)
        words = " ".join(["word"] * 150)
        transcription = {
            "segments": [
                {"speaker": "A", "text": words, "start": 0, "end": 60.0},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should be in typical range (120-180 WPM)
        assert 120 <= result["A"]["words_per_minute"] <= 180

    async def test_wpm_rounding_precision(self, metrics_analyzer):
        """Test that WPM is rounded to 1 decimal place."""
        # 100 words in 41 seconds = 146.34... WPM
        words = " ".join(["word"] * 100)
        transcription = {
            "segments": [
                {"speaker": "A", "text": words, "start": 0, "end": 41.0},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should be rounded to 1 decimal place
        assert result["A"]["words_per_minute"] == 146.3


class TestFillerWordsPerMinute:
    """Test suite for filler words per minute calculation."""

    async def test_filler_words_per_minute_metric_included(self, metrics_analyzer):
        """Test that filler words per minute metric is included in results."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "um like hello world",
                    "start": 0,
                    "end": 60.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Filler words per minute should be present
        assert "filler_words_per_minute" in result["A"]
        assert isinstance(result["A"]["filler_words_per_minute"], float)

    async def test_filler_words_per_minute_calculation_accuracy(self, metrics_analyzer):
        """Test filler words per minute calculation with known values."""
        # 12 filler words in 60 seconds = 12 per minute
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "um like you know I mean uh so okay gotcha um like",
                    "start": 0,
                    "end": 60.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should have 10 filler words (basically/actually moved to softeners)
        assert result["A"]["filler_words_total"] == 10
        # Should calculate 10 filler words per minute
        assert result["A"]["filler_words_per_minute"] == 10.0

    async def test_filler_words_per_minute_with_30_seconds(self, metrics_analyzer):
        """Test filler words per minute with non-60-second duration."""
        # 6 filler words in 30 seconds = 12 per minute
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "um like you know I mean uh so",
                    "start": 0,
                    "end": 30.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should have 6 filler words
        assert result["A"]["filler_words_total"] == 6
        # Should calculate 12 filler words per minute (6 / 0.5)
        assert result["A"]["filler_words_per_minute"] == 12.0

    async def test_filler_words_per_minute_zero_duration_handling(
        self, metrics_analyzer
    ):
        """Test filler words per minute with zero duration returns 0.0."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "um like hello", "start": 0, "end": 0},
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should handle zero duration gracefully
        assert result["A"]["filler_words_per_minute"] == 0.0

    async def test_filler_words_per_minute_no_filler_words(self, metrics_analyzer):
        """Test filler words per minute when no filler words are present."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "This is a clean sentence without any filler words",
                    "start": 0,
                    "end": 60.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should have 0 filler words
        assert result["A"]["filler_words_total"] == 0
        # Should calculate 0 filler words per minute
        assert result["A"]["filler_words_per_minute"] == 0.0

    async def test_filler_words_per_minute_multiple_speakers_independent(
        self, metrics_analyzer
    ):
        """Test that filler words per minute is calculated independently per speaker."""
        # Speaker A: 6 filler words in 30 seconds = 12 per minute
        # Speaker B: 3 filler words in 60 seconds = 3 per minute
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "um like you know I mean uh so",
                    "start": 0,
                    "end": 30.0,
                },
                {
                    "speaker": "B",
                    "text": "um like uh this is better",
                    "start": 30,
                    "end": 90.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Each speaker should have independent rate
        assert result["A"]["filler_words_per_minute"] == 12.0
        assert result["B"]["filler_words_per_minute"] == 3.0

    async def test_filler_words_per_minute_rounding_precision(self, metrics_analyzer):
        """Test that filler words per minute is rounded to 2 decimal places."""
        # 7 filler words in 41 seconds = 10.24... per minute
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "um like you know I mean uh so okay",
                    "start": 0,
                    "end": 41.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should have 7 filler words
        assert result["A"]["filler_words_total"] == 7
        # Should be rounded to 2 decimal places (7 / (41/60) = 10.24)
        assert result["A"]["filler_words_per_minute"] == 10.24

    async def test_filler_words_per_minute_with_multiple_segments(
        self, metrics_analyzer
    ):
        """Test filler words per minute calculation across multiple segments."""
        # Speaker A: 2 segments, 6 filler words total, 60 seconds total
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "um like you know",
                    "start": 0,
                    "end": 30.0,
                },
                {
                    "speaker": "A",
                    "text": "I mean uh so",
                    "start": 30,
                    "end": 60.0,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should accumulate filler words across segments
        assert result["A"]["filler_words_total"] == 6
        # Should calculate rate based on total time (6 / 1 minute = 6.0)
        assert result["A"]["filler_words_per_minute"] == 6.0


class TestTurnTakingBalance:
    """
    Test suite for Turn Taking Balance metric calculation.

    Turn Taking Balance is a tri-factor composite metric that measures
    how evenly distributed speaking participation is among participants.

    Formula:
    - Segment Balance: (user_segments / total_segments) * 100
    - Duration Balance: (user_duration / total_duration) * 100
    - Word Balance: (user_words / total_words) * 100
    - Expected: 100 / num_speakers
    - Deviations: actual% - expected%
    - Turn Taking Balance: (segment_deviation + duration_deviation + word_deviation) / 3

    Positive = dominating conversation
    Negative = under-participating
    Zero = balanced participation
    """

    async def test_turn_taking_balance_metric_included(self, metrics_analyzer):
        """Test that turn_taking_balance metric is included in results."""
        transcription = create_multi_speaker_transcription(
            speakers=["A", "B"], segments_per_speaker=2
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Turn taking balance should be present
        assert "turn_taking_balance" in result["A"]
        assert "turn_taking_balance" in result["B"]
        assert isinstance(result["A"]["turn_taking_balance"], float)
        assert isinstance(result["B"]["turn_taking_balance"], float)

    async def test_perfectly_balanced_two_speakers(self, metrics_analyzer):
        """Test perfectly balanced conversation with 2 speakers (50/50/50)."""
        # Expected: 50% for each factor for each speaker
        transcription = {
            "segments": [
                # Speaker A: 1 segment, 10 seconds, 10 words
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 10),
                    "start": 0,
                    "end": 10,
                },
                # Speaker B: 1 segment, 10 seconds, 10 words
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 10),
                    "start": 10,
                    "end": 20,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Both speakers should have 0.0 balance (perfectly balanced)
        # Segment balance: 50% - 50% = 0
        # Duration balance: 50% - 50% = 0
        # Word balance: 50% - 50% = 0
        # Average: (0 + 0 + 0) / 3 = 0.0
        assert result["A"]["turn_taking_balance"] == 0.0
        assert result["B"]["turn_taking_balance"] == 0.0

    async def test_perfectly_balanced_three_speakers(self, metrics_analyzer):
        """Test perfectly balanced conversation with 3 speakers (33.3/33.3/33.3)."""
        # Expected: 33.3% for each factor for each speaker
        transcription = {
            "segments": [
                # Speaker A: 1 segment, 10 seconds, 30 words
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 30),
                    "start": 0,
                    "end": 10,
                },
                # Speaker B: 1 segment, 10 seconds, 30 words
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 30),
                    "start": 10,
                    "end": 20,
                },
                # Speaker C: 1 segment, 10 seconds, 30 words
                {
                    "speaker": "C",
                    "text": " ".join(["word"] * 30),
                    "start": 20,
                    "end": 30,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # All speakers should be close to 0.0 (perfectly balanced)
        # Small rounding differences acceptable
        assert abs(result["A"]["turn_taking_balance"]) < 0.1
        assert abs(result["B"]["turn_taking_balance"]) < 0.1
        assert abs(result["C"]["turn_taking_balance"]) < 0.1

    async def test_dominating_speaker(self, metrics_analyzer):
        """Test speaker dominating conversation across all three factors."""
        # Speaker A dominates with more segments, duration, and words
        transcription = {
            "segments": [
                # Speaker A: 3 segments, 60 seconds total, 60 words
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 20),
                    "start": 0,
                    "end": 20,
                },
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 20),
                    "start": 20,
                    "end": 40,
                },
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 20),
                    "start": 40,
                    "end": 60,
                },
                # Speaker B: 1 segment, 20 seconds, 20 words
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 20),
                    "start": 60,
                    "end": 80,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Expected: 50% each
        # Speaker A actual:
        # - Segments: 75% (3/4 * 100)
        # - Duration: 75% (60/80 * 100)
        # - Words: 75% (60/80 * 100)
        # Deviations: 25%, 25%, 25% = avg 25.0

        # Speaker B actual:
        # - Segments: 25% (1/4 * 100)
        # - Duration: 25% (20/80 * 100)
        # - Words: 25% (20/80 * 100)
        # Deviations: -25%, -25%, -25% = avg -25.0

        assert result["A"]["turn_taking_balance"] == 25.0
        assert result["B"]["turn_taking_balance"] == -25.0

    async def test_mixed_balance_factors(self, metrics_analyzer):
        """Test when different factors show different balance levels."""
        # Speaker A: Many short segments, less total time, fewer words
        # Speaker B: Few long segments, more total time, more words
        transcription = {
            "segments": [
                # Speaker A: 6 segments, 30 seconds total, 30 words
                {"speaker": "A", "text": " ".join(["word"] * 5), "start": 0, "end": 5},
                {"speaker": "A", "text": " ".join(["word"] * 5), "start": 5, "end": 10},
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 5),
                    "start": 10,
                    "end": 15,
                },
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 5),
                    "start": 15,
                    "end": 20,
                },
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 5),
                    "start": 20,
                    "end": 25,
                },
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 5),
                    "start": 25,
                    "end": 30,
                },
                # Speaker B: 2 segments, 70 seconds total, 70 words
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 35),
                    "start": 30,
                    "end": 65,
                },
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 35),
                    "start": 65,
                    "end": 100,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Expected: 50% each
        # Speaker A:
        # - Segments: 75% (6/8 * 100) → deviation: +25%
        # - Duration: 30% (30/100 * 100) → deviation: -20%
        # - Words: 30% (30/100 * 100) → deviation: -20%
        # Average: (25 - 20 - 20) / 3 = -5.0

        # Speaker B:
        # - Segments: 25% (2/8 * 100) → deviation: -25%
        # - Duration: 70% (70/100 * 100) → deviation: +20%
        # - Words: 70% (70/100 * 100) → deviation: +20%
        # Average: (-25 + 20 + 20) / 3 = 5.0

        assert result["A"]["turn_taking_balance"] == -5.0
        assert result["B"]["turn_taking_balance"] == 5.0

    async def test_single_speaker_zero_balance(self, metrics_analyzer):
        """Test that single speaker has 0.0 balance (no comparison)."""
        transcription = create_single_speaker_transcription(
            speaker="A", segment_count=3, words_per_segment=10
        )

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Single speaker: expected = 100%, actual = 100%, deviation = 0
        # All three factors: 0% deviation
        # Average: (0 + 0 + 0) / 3 = 0.0
        assert result["A"]["turn_taking_balance"] == 0.0

    async def test_four_speakers_varying_participation(self, metrics_analyzer):
        """Test 4 speakers with varying levels of participation."""
        # Expected: 25% each
        transcription = {
            "segments": [
                # Speaker A: 2 segments, 40 seconds, 40 words (dominant)
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 20),
                    "start": 0,
                    "end": 20,
                },
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 20),
                    "start": 20,
                    "end": 40,
                },
                # Speaker B: 1 segment, 30 seconds, 30 words (slightly over)
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 30),
                    "start": 40,
                    "end": 70,
                },
                # Speaker C: 1 segment, 20 seconds, 20 words (balanced)
                {
                    "speaker": "C",
                    "text": " ".join(["word"] * 20),
                    "start": 70,
                    "end": 90,
                },
                # Speaker D: 1 segment, 10 seconds, 10 words (under-participating)
                {
                    "speaker": "D",
                    "text": " ".join(["word"] * 10),
                    "start": 90,
                    "end": 100,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Total: 5 segments, 100 seconds, 100 words
        # Expected: 25% each

        # Speaker A:
        # - Segments: 40% (2/5) → +15%
        # - Duration: 40% (40/100) → +15%
        # - Words: 40% (40/100) → +15%
        # Average: 15.0
        assert result["A"]["turn_taking_balance"] == 15.0

        # Speaker B:
        # - Segments: 20% (1/5) → -5%
        # - Duration: 30% (30/100) → +5%
        # - Words: 30% (30/100) → +5%
        # Average: 1.67 (rounded to 1.67)
        assert abs(result["B"]["turn_taking_balance"] - 1.67) < 0.01

        # Speaker C:
        # - Segments: 20% (1/5) → -5%
        # - Duration: 20% (20/100) → -5%
        # - Words: 20% (20/100) → -5%
        # Average: -5.0
        assert result["C"]["turn_taking_balance"] == -5.0

        # Speaker D:
        # - Segments: 20% (1/5) → -5%
        # - Duration: 10% (10/100) → -15%
        # - Words: 10% (10/100) → -15%
        # Average: -11.67 (rounded to -11.67)
        assert abs(result["D"]["turn_taking_balance"] - (-11.67)) < 0.01

    async def test_turn_taking_balance_sum_zero(self, metrics_analyzer):
        """Test that all turn taking balance scores sum to approximately zero."""
        # The sum of all deviations should be zero (sum of deviations from mean)
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": " ".join(["word"] * 30),
                    "start": 0,
                    "end": 30,
                },
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 20),
                    "start": 30,
                    "end": 50,
                },
                {
                    "speaker": "C",
                    "text": " ".join(["word"] * 10),
                    "start": 50,
                    "end": 60,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Sum of all turn taking balances should be close to 0
        total_balance = sum(stats["turn_taking_balance"] for stats in result.values())
        assert abs(total_balance) < 0.1  # Allow small rounding error

    async def test_turn_taking_balance_empty_segments_handled(self, metrics_analyzer):
        """Test handling of empty text in segments for balance calculation."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "", "start": 0, "end": 5},  # Empty
                {
                    "speaker": "A",
                    "text": "   ",
                    "start": 5,
                    "end": 10,
                },  # Whitespace only
                {
                    "speaker": "B",
                    "text": " ".join(["word"] * 10),
                    "start": 10,
                    "end": 20,
                },
            ]
        }

        result = await metrics_analyzer.analyze("job-123", transcription)

        # Should handle empty segments gracefully
        assert "turn_taking_balance" in result["A"]
        assert "turn_taking_balance" in result["B"]
        assert isinstance(result["A"]["turn_taking_balance"], float)
        assert isinstance(result["B"]["turn_taking_balance"], float)


# Mark tests for categorization
pytest.mark.unit(TestMetricsAnalyzer)
pytest.mark.unit(TestVerbosityMetric)
pytest.mark.unit(TestPercentageCalculation)
pytest.mark.unit(TestResponseLatency)
pytest.mark.unit(TestPillarScores)
pytest.mark.unit(TestInterruptions)
pytest.mark.unit(TestWordsPerMinute)
pytest.mark.unit(TestFillerWordsPerMinute)
pytest.mark.unit(TestTurnTakingBalance)
