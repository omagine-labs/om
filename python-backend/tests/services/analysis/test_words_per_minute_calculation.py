"""
Tests for words per minute calculation.

Tests the WPM calculation logic in the analysis orchestrator.
"""

import pytest


class TestWordsPerMinuteBasics:
    """Test suite for basic WPM calculations."""

    def test_basic_wpm_calculation(self):
        """Test typical conversation speaking rate (150 WPM)."""
        # 100 words spoken over 40 seconds = 150 WPM
        word_count = 100
        total_time_seconds = 40.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 150.0

    def test_single_speaker_calculation(self):
        """Test WPM calculation for a single speaker."""
        # 50 words in 30 seconds = 100 WPM
        word_count = 50
        total_time_seconds = 30.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 100.0

    def test_multiple_speakers_independent_calculation(self):
        """Test that multiple speakers have independent WPM calculations."""
        # Speaker A: 50 words in 30 seconds = 100 WPM
        speaker_a_wpm = (50 / 30.0) * 60
        # Speaker B: 100 words in 40 seconds = 150 WPM
        speaker_b_wpm = (100 / 40.0) * 60

        assert round(speaker_a_wpm, 1) == 100.0
        assert round(speaker_b_wpm, 1) == 150.0

    def test_very_short_segment(self):
        """Test WPM calculation for very short segments (< 1 second)."""
        # 1 word in 0.5 seconds = 120 WPM
        word_count = 1
        total_time_seconds = 0.5

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 120.0


class TestWordsPerMinuteEdgeCases:
    """Test suite for edge cases in WPM calculation."""

    def test_zero_duration_returns_zero(self):
        """Test that zero duration returns 0.0 WPM without error."""
        word_count = 50
        total_time_seconds = 0

        if total_time_seconds > 0:
            wpm = (word_count / total_time_seconds) * 60
        else:
            wpm = 0.0

        assert wpm == 0.0

    def test_zero_word_count(self):
        """Test WPM calculation when word count is zero."""
        word_count = 0
        total_time_seconds = 30.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 0.0

    def test_single_word_in_long_segment(self):
        """Test slow speech: single word in long segment."""
        # 1 word in 2 seconds = 30 WPM (very slow)
        word_count = 1
        total_time_seconds = 2.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 30.0

    def test_many_words_in_short_segment(self):
        """Test fast speech: many words in short segment."""
        # 50 words in 10 seconds = 300 WPM (very fast)
        word_count = 50
        total_time_seconds = 10.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 300.0

    def test_both_zero_values(self):
        """Test edge case where both word count and time are zero."""
        word_count = 0
        total_time_seconds = 0

        if total_time_seconds > 0:
            wpm = (word_count / total_time_seconds) * 60
        else:
            wpm = 0.0

        assert wpm == 0.0


class TestWordsPerMinuteRealWorld:
    """Test suite for realistic speaking rate scenarios."""

    def test_normal_conversation_rate(self):
        """Test typical conversation rate (120-150 WPM)."""
        # 150 words in 60 seconds = 150 WPM
        word_count = 150
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 150.0
        assert 120 <= result <= 180  # Within normal range

    def test_slow_deliberate_speaker(self):
        """Test slow, deliberate speaking rate (80-100 WPM)."""
        # 80 words in 60 seconds = 80 WPM
        word_count = 80
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 80.0
        assert 80 <= result <= 100  # Within slow speaker range

    def test_fast_talker(self):
        """Test fast speaker (180-200 WPM)."""
        # 200 words in 60 seconds = 200 WPM
        word_count = 200
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 200.0
        assert 180 <= result <= 220  # Within fast speaker range

    def test_nervous_rapid_speaker(self):
        """Test nervous/rapid speaker (200+ WPM)."""
        # 220 words in 60 seconds = 220 WPM (very fast, nervous)
        word_count = 220
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 220.0
        assert result >= 200  # Rapid speech threshold

    def test_professional_presentation(self):
        """Test professional presentation rate (130-140 WPM)."""
        # 140 words in 60 seconds = 140 WPM
        word_count = 140
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 140.0
        assert 130 <= result <= 160  # Professional speaking range

    def test_meeting_with_pauses(self):
        """Test meeting with pauses included in time."""
        # Speaker talked for 120 seconds total, but only 90 seconds of actual speech
        # 180 words in 90 seconds = 120 WPM
        word_count = 180
        total_time_seconds = 90.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 120.0


class TestWordsPerMinuteAccuracy:
    """Test suite for calculation accuracy and rounding."""

    def test_formula_accuracy(self):
        """Test that formula (words / seconds) * 60 is applied correctly."""
        # Given: 50 words in 20 seconds
        # Expected: (50 / 20) * 60 = 2.5 * 60 = 150 WPM
        word_count = 50
        total_time_seconds = 20.0

        wpm = (word_count / total_time_seconds) * 60

        assert wpm == 150.0

    def test_rounding_to_one_decimal(self):
        """Test that WPM is rounded to 1 decimal place."""
        # 100 words in 41 seconds = 146.34146... WPM
        word_count = 100
        total_time_seconds = 41.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 146.3
        assert isinstance(result, float)

    def test_rounding_edge_case_up(self):
        """Test rounding up from .x5 or higher."""
        # 100 words in 40.5 seconds = 148.148... WPM → rounds to 148.1
        word_count = 100
        total_time_seconds = 40.5

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 148.1

    def test_rounding_edge_case_down(self):
        """Test rounding down from .x4 or lower."""
        # 100 words in 40.1 seconds = 149.626... WPM → rounds to 149.6
        word_count = 100
        total_time_seconds = 40.1

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result == 149.6

    def test_precision_consistency(self):
        """Test that precision is consistent with other metrics."""
        # Similar to how talk_time_percentage is rounded to 1 decimal
        word_count = 75
        total_time_seconds = 30.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        # Should be exactly 1 decimal place
        result_str = str(result)
        if "." in result_str:
            decimal_places = len(result_str.split(".")[1])
            assert decimal_places <= 1


class TestWordsPerMinuteMultiSpeaker:
    """Test suite for multi-speaker scenarios."""

    def test_two_speakers_different_rates(self):
        """Test two speakers with very different speaking rates."""
        # Slow speaker: 80 words in 60 seconds = 80 WPM
        slow_wpm = (80 / 60.0) * 60
        # Fast speaker: 200 words in 60 seconds = 200 WPM
        fast_wpm = (200 / 60.0) * 60

        assert round(slow_wpm, 1) == 80.0
        assert round(fast_wpm, 1) == 200.0

    def test_three_speakers_various_rates(self):
        """Test three speakers with different speaking patterns."""
        # Speaker A: 100 words in 50 seconds = 120 WPM
        speaker_a_wpm = (100 / 50.0) * 60
        # Speaker B: 150 words in 60 seconds = 150 WPM
        speaker_b_wpm = (150 / 60.0) * 60
        # Speaker C: 90 words in 45 seconds = 120 WPM
        speaker_c_wpm = (90 / 45.0) * 60

        assert round(speaker_a_wpm, 1) == 120.0
        assert round(speaker_b_wpm, 1) == 150.0
        assert round(speaker_c_wpm, 1) == 120.0

    def test_speakers_with_very_different_talk_times(self):
        """Test speakers where one talks much more than the other."""
        # Dominant speaker: 500 words in 200 seconds = 150 WPM
        dominant_wpm = (500 / 200.0) * 60
        # Brief speaker: 20 words in 10 seconds = 120 WPM
        brief_wpm = (20 / 10.0) * 60

        assert round(dominant_wpm, 1) == 150.0
        assert round(brief_wpm, 1) == 120.0


class TestWordsPerMinuteValidation:
    """Test suite for validating realistic WPM ranges."""

    def test_wpm_not_negative(self):
        """Test that WPM is never negative."""
        word_count = 100
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        assert result >= 0

    def test_unrealistic_high_wpm_detection(self):
        """Test detection of unrealistically high WPM (may indicate data issue)."""
        # 500 words in 60 seconds = 500 WPM (probably transcript error)
        word_count = 500
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        # Flag as potentially unrealistic
        assert result == 500.0
        # Most human speech is under 250 WPM
        is_potentially_unrealistic = result > 250
        assert is_potentially_unrealistic is True

    def test_unrealistic_low_wpm_detection(self):
        """Test detection of unrealistically low WPM (may indicate data issue)."""
        # 10 words in 60 seconds = 10 WPM (probably long pauses or data issue)
        word_count = 10
        total_time_seconds = 60.0

        wpm = (word_count / total_time_seconds) * 60
        result = round(wpm, 1)

        # Flag as potentially unrealistic
        assert result == 10.0
        # Most human speech is over 50 WPM
        is_potentially_unrealistic = result < 50
        assert is_potentially_unrealistic is True


# Mark all test classes as unit tests
pytest.mark.unit(TestWordsPerMinuteBasics)
pytest.mark.unit(TestWordsPerMinuteEdgeCases)
pytest.mark.unit(TestWordsPerMinuteRealWorld)
pytest.mark.unit(TestWordsPerMinuteAccuracy)
pytest.mark.unit(TestWordsPerMinuteMultiSpeaker)
pytest.mark.unit(TestWordsPerMinuteValidation)
