"""
Integration tests for interruption analysis.

Tests the full flow from transcript segments through the analysis
orchestrator to verify interruption metrics are correctly calculated
and integrated with other communication metrics.
"""

import pytest


class TestInterruptionIntegration:
    """Integration tests for interruption analysis in the full analysis pipeline."""

    async def test_full_analysis_with_interruptions(self, metrics_analyzer):
        """Test interruption metrics are correctly included in full analysis."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "I think we should consider the proposal carefully",
                    "start": 0,
                    "end": 5,
                },
                {
                    "speaker": "B",
                    "text": "But wait I disagree",  # Interrupts A
                    "start": 3,
                    "end": 8,
                },
                {
                    "speaker": "A",
                    "text": "Let me finish",  # Interrupts B back
                    "start": 6,
                    "end": 10,
                },
                {
                    "speaker": "B",
                    "text": "Sorry go ahead",  # No interruption
                    "start": 10,
                    "end": 13,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # Verify both speakers have interruption metrics
        assert "A" in results
        assert "B" in results

        # Speaker A: interrupted once (by B at 3s), interrupted once (B at 6s)
        assert results["A"]["times_interrupted"] == 1
        assert results["A"]["times_interrupting"] == 1

        # Speaker B: interrupted once (by A at 6s), interrupted once (A at 3s)
        assert results["B"]["times_interrupted"] == 1
        assert results["B"]["times_interrupting"] == 1

        # Both should have positive interruption rates
        assert results["A"]["interruption_rate"] > 0
        assert results["B"]["interruption_rate"] > 0

        # Verify other metrics are also present
        assert "total_time" in results["A"]
        assert "word_count" in results["A"]
        assert "percentage" in results["A"]

    async def test_no_interruptions_scenario(self, metrics_analyzer):
        """Test polite conversation with no interruptions."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "Thank you for your time today",
                    "start": 0,
                    "end": 3,
                },
                {
                    "speaker": "B",
                    "text": "Of course happy to help",
                    "start": 3.5,
                    "end": 6,
                },
                {
                    "speaker": "A",
                    "text": "I appreciate your feedback",
                    "start": 6.5,
                    "end": 9,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # No interruptions in polite conversation
        assert results["A"]["times_interrupted"] == 0
        assert results["A"]["times_interrupting"] == 0
        assert results["A"]["interruption_rate"] == 0.0

        assert results["B"]["times_interrupted"] == 0
        assert results["B"]["times_interrupting"] == 0
        assert results["B"]["interruption_rate"] == 0.0

        # But should have response latency metrics (positive gaps)
        assert results["A"]["response_latency"] is not None
        assert results["B"]["response_latency"] is not None

    async def test_high_interruption_speaker(self, metrics_analyzer):
        """Test speaker with consistently high interruption behavior."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "So the project timeline",
                    "start": 0,
                    "end": 10,
                },
                {
                    "speaker": "B",
                    "text": "Wait hold on",  # B interrupts
                    "start": 5,
                    "end": 15,
                },
                {
                    "speaker": "C",
                    "text": "I think we need",  # C starts after B
                    "start": 15,
                    "end": 25,
                },
                {
                    "speaker": "B",
                    "text": "No no no",  # B interrupts C
                    "start": 20,
                    "end": 30,
                },
                {
                    "speaker": "A",
                    "text": "Can I speak please",  # A starts after B
                    "start": 30,
                    "end": 40,
                },
                {
                    "speaker": "B",
                    "text": "Just one more thing",  # B interrupts A again
                    "start": 35,
                    "end": 45,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # Speaker B interrupted 3 times (A, C, A again)
        assert results["B"]["times_interrupting"] == 3

        # Speaker A was interrupted twice (by B)
        assert results["A"]["times_interrupted"] == 2
        assert results["A"]["times_interrupting"] == 0

        # Speaker C was interrupted once (by B)
        assert results["C"]["times_interrupted"] == 1
        assert results["C"]["times_interrupting"] == 0

        # B should have highest interruption rate
        assert results["B"]["interruption_rate"] > results["A"]["interruption_rate"]
        assert results["B"]["interruption_rate"] > results["C"]["interruption_rate"]

    async def test_interruptions_with_filler_words(self, metrics_analyzer):
        """Test that interruption analysis works alongside filler word detection."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "Um I think like we should um consider this",
                    "start": 0,
                    "end": 5,
                },
                {
                    "speaker": "B",
                    "text": "You know I totally agree",  # Interrupts
                    "start": 3,
                    "end": 8,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # Verify interruption metrics
        assert results["A"]["times_interrupted"] == 1
        assert results["B"]["times_interrupting"] == 1

        # Verify filler word metrics also present
        assert results["A"]["filler_words_total"] > 0
        assert results["B"]["filler_words_total"] > 0
        assert "filler_words_breakdown" in results["A"]

    async def test_minimal_overlap_still_counts(self, metrics_analyzer):
        """Test that even minimal overlaps (0.01s) are counted as interruptions."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "I am speaking now", "start": 0, "end": 5.0},
                {
                    "speaker": "B",
                    "text": "My turn",
                    "start": 4.99,  # 0.01 second overlap
                    "end": 10,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # Even minimal overlap should count
        assert results["A"]["times_interrupted"] == 1
        assert results["B"]["times_interrupting"] == 1
        assert results["B"]["interruption_rate"] > 0

    async def test_boundary_touch_no_interruption(self, metrics_analyzer):
        """Test that exact boundary touching is not counted as interruption."""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "I am speaking now", "start": 0, "end": 5.0},
                {
                    "speaker": "B",
                    "text": "My turn exactly",
                    "start": 5.0,  # Exactly at boundary
                    "end": 10,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # Exact boundary should NOT count as interruption
        assert results["A"]["times_interrupted"] == 0
        assert results["B"]["times_interrupting"] == 0
        assert results["A"]["interruption_rate"] == 0.0
        assert results["B"]["interruption_rate"] == 0.0

    async def test_quick_response_vs_interruption(self, metrics_analyzer):
        """Test quick responses (gaps) vs interruptions (overlaps)."""
        transcription = {
            "segments": [
                {
                    "speaker": "A",
                    "text": "What do you think",
                    "start": 0,
                    "end": 2,
                },
                {
                    "speaker": "B",
                    "text": "Great idea",  # Quick response with 0.1s gap
                    "start": 2.1,
                    "end": 4,
                },
                {
                    "speaker": "A",
                    "text": "But hold on",  # Interruption with overlap
                    "start": 3,
                    "end": 6,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # B's first response: gap (not interruption)
        # A's second segment: overlap (interruption)

        # A interrupted B once (second segment overlaps B)
        assert results["A"]["times_interrupting"] == 1
        assert results["B"]["times_interrupted"] == 1

        # B did not interrupt (had a gap, not overlap)
        assert results["B"]["times_interrupting"] == 0
        assert results["A"]["times_interrupted"] == 0  # First segment not interrupted

        # Both should have response latency metrics for the gaps
        assert results["A"]["response_latency"] is not None
        assert results["B"]["response_latency"] is not None

        # B should have quick response recorded (gap < 1s)
        assert results["B"]["quick_responses_percentage"] > 0

    async def test_three_speaker_panel_discussion(self, metrics_analyzer):
        """Test realistic panel discussion with multiple speakers and cross-talk."""
        transcription = {
            "segments": [
                {
                    "speaker": "Moderator",
                    "text": "Let's begin with the first question",
                    "start": 0,
                    "end": 5,
                },
                {
                    "speaker": "Panelist_A",
                    "text": "I believe the answer is",
                    "start": 6,
                    "end": 15,
                },
                {
                    "speaker": "Panelist_B",
                    "text": "Actually I disagree",  # Interrupts A
                    "start": 12,
                    "end": 20,
                },
                {
                    "speaker": "Panelist_A",
                    "text": "Let me finish please",  # Interrupts B back
                    "start": 17,
                    "end": 25,
                },
                {
                    "speaker": "Moderator",
                    "text": "One at a time please",  # Interrupts A
                    "start": 22,
                    "end": 30,
                },
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # Verify all speakers analyzed
        assert "Moderator" in results
        assert "Panelist_A" in results
        assert "Panelist_B" in results

        # Panelist_A: interrupted by B and Moderator
        assert results["Panelist_A"]["times_interrupted"] == 2

        # Panelist_A: interrupted B once (second segment)
        assert results["Panelist_A"]["times_interrupting"] == 1

        # Panelist_B: interrupted A, then interrupted by A
        assert results["Panelist_B"]["times_interrupting"] == 1
        assert results["Panelist_B"]["times_interrupted"] == 1

        # Moderator: interrupted A once
        assert results["Moderator"]["times_interrupting"] == 1
        assert results["Moderator"]["times_interrupted"] == 0

    async def test_rate_calculation_with_varying_talk_times(self, metrics_analyzer):
        """Test that interruption rate normalizes correctly for different talk times."""
        transcription = {
            "segments": [
                # Speaker A: 60 seconds total, 2 interruptions
                {"speaker": "A", "text": "Starting point", "start": 0, "end": 30},
                {
                    "speaker": "B",
                    "text": "Quick comment",
                    "start": 25,
                    "end": 35,
                },  # A interrupted
                {"speaker": "A", "text": "Continuing", "start": 36, "end": 66},
                {
                    "speaker": "B",
                    "text": "Another point",
                    "start": 60,
                    "end": 70,
                },  # A interrupted again
                # Speaker B: 20 seconds total, 2 interruptions
                {"speaker": "B", "text": "Third segment", "start": 71, "end": 81},
            ]
        }

        results = await metrics_analyzer.analyze("test-job-123", transcription)

        # A: talked ~60 seconds (30 + 30), interrupted 0 times
        # Rate = 0 / 1 minute = 0.0
        assert results["A"]["times_interrupting"] == 0
        assert results["A"]["interruption_rate"] == 0.0

        # B: talked ~30 seconds (10 + 10 + 10), interrupted 2 times
        # Rate = 2 / 0.5 minutes = 4.0 per minute
        assert results["B"]["times_interrupting"] == 2
        # B's interruption rate should be higher than A's (who never interrupted)
        assert results["B"]["interruption_rate"] > results["A"]["interruption_rate"]

        # Verify rate is per minute (not per meeting)
        # B interrupted 2 times in ~30 seconds = 4.0 per minute
        assert results["B"]["interruption_rate"] == pytest.approx(4.0, abs=0.1)


# Mark all tests as integration tests
pytest.mark.integration(TestInterruptionIntegration)
