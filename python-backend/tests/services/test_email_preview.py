"""
Tests for email preview generation for anonymous uploads.
"""

from app.services.email_preview import (
    generate_insight_headline,
    generate_key_metrics_html,
    generate_email_preview,
    extract_preview_data,
)


class TestGenerateInsightHeadline:
    """Test suite for generating insight headlines."""

    def test_empty_speaker_stats_returns_default(self):
        """Test that empty speaker stats returns default message."""
        result = generate_insight_headline({})
        assert result == "Your meeting analysis is ready!"

    def test_single_speaker_low_filler_rate(self):
        """Test single speaker with low filler rate returns polished message."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 100,
                "percentage": 100,
                "filler_words_per_minute": 5,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "Polished solo presentation with strong clarity."

    def test_single_speaker_high_filler_rate(self):
        """Test single speaker with high filler rate returns improvement message."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 100,
                "percentage": 100,
                "filler_words_per_minute": 20,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "Solo presentation with opportunities to reduce filler words."

    def test_dominant_speaker_over_70_percent(self):
        """Test dominant speaker message when one speaker exceeds 70%."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 80,
                "percentage": 80,
                "filler_words_per_minute": 5,
                "times_interrupting": 2,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 20,
                "percentage": 20,
                "filler_words_per_minute": 3,
                "times_interrupting": 1,
                "times_interrupted": 2,
            },
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "One speaker dominated at 80% talk time — see who and why."

    def test_balanced_conversation_with_interruptions(self):
        """Test balanced conversation with interruptions shows dynamic message."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 3,
                "times_interrupting": 3,
                "times_interrupted": 2,
            },
            "Speaker B": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 4,
                "times_interrupting": 2,
                "times_interrupted": 3,
            },
            "Speaker C": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 2,
                "times_interrupting": 1,
                "times_interrupted": 1,
            },
            "Speaker D": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 5,
                "times_interrupting": 2,
                "times_interrupted": 2,
            },
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "Dynamic 4-way conversation with active back-and-forth."

    def test_balanced_conversation_smooth(self):
        """Test balanced conversation without interruptions shows collaborative message."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 3,
                "times_interrupting": 0,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 4,
                "times_interrupting": 1,
                "times_interrupted": 0,
            },
            "Speaker C": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 2,
                "times_interrupting": 0,
                "times_interrupted": 0,
            },
            "Speaker D": {
                "total_time": 25,
                "percentage": 25,
                "filler_words_per_minute": 5,
                "times_interrupting": 0,
                "times_interrupted": 0,
            },
        }
        result = generate_insight_headline(speaker_stats)
        assert (
            result
            == "Collaborative discussion with balanced participation across 4 speakers."
        )

    def test_fast_paced_conversation(self):
        """Test fast-paced conversation with many interruptions."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 60,
                "filler_words_per_minute": 5,
                "times_interrupting": 8,
                "times_interrupted": 7,
            },
            "Speaker B": {
                "total_time": 40,
                "percentage": 40,
                "filler_words_per_minute": 6,
                "times_interrupting": 7,
                "times_interrupted": 8,
            },
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "Fast-paced conversation with 30 interruptions detected."

    def test_high_filler_rate_message(self):
        """Test message for high filler word rate."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 60,
                "filler_words_per_minute": 22,
                "times_interrupting": 2,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 40,
                "percentage": 40,
                "filler_words_per_minute": 25,
                "times_interrupting": 1,
                "times_interrupted": 2,
            },
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "2 speakers analyzed — opportunities to improve clarity."

    def test_multi_speaker_default_message(self):
        """Test default message for multiple speakers without clear pattern."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 60,
                "filler_words_per_minute": 5,
                "times_interrupting": 2,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 40,
                "percentage": 40,
                "filler_words_per_minute": 6,
                "times_interrupting": 1,
                "times_interrupted": 2,
            },
        }
        result = generate_insight_headline(speaker_stats)
        assert result == "2 speakers analyzed with personalized communication insights."


class TestGenerateKeyMetricsHtml:
    """Test suite for generating key metrics HTML."""

    def test_empty_speaker_stats_returns_empty_string(self):
        """Test that empty speaker stats returns empty string."""
        result = generate_key_metrics_html({}, 0)
        assert result == ""

    def test_html_contains_basic_metrics(self):
        """Test that generated HTML contains meeting overview."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 120,
                "percentage": 60,
                "word_count": 500,
                "filler_words_per_minute": 2.5,
                "times_interrupting": 3,
                "times_interrupted": 2,
            },
            "Speaker B": {
                "total_time": 80,
                "percentage": 40,
                "word_count": 300,
                "filler_words_per_minute": 1.5,
                "times_interrupting": 1,
                "times_interrupted": 3,
            },
        }
        duration_seconds = 200

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        # Check for duration & speakers (always shown)
        assert "3 min" in result
        assert "2 speakers" in result
        assert "Meeting Overview" in result

    def test_dynamic_metric_unbalanced_talk_time(self):
        """Test that unbalanced talk time shows balance metric."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 150,
                "percentage": 85,
                "word_count": 600,
                "filler_words_per_minute": 5,
                "times_interrupting": 2,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 50,
                "percentage": 15,
                "word_count": 200,
                "filler_words_per_minute": 3,
                "times_interrupting": 1,
                "times_interrupted": 2,
            },
        }
        duration_seconds = 200

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        # Should show talk time balance (gap > 50%)
        assert "Talk Time Balance" in result
        assert "85% to 15% split" in result

    def test_dynamic_metric_fast_paced(self):
        """Test that fast-paced meetings show words per minute."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 100,
                "percentage": 50,
                "word_count": 1000,
                "filler_words_per_minute": 5,
                "times_interrupting": 2,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 100,
                "percentage": 50,
                "word_count": 1000,
                "filler_words_per_minute": 6,
                "times_interrupting": 1,
                "times_interrupted": 2,
            },
        }
        duration_seconds = 600  # 10 min, 2000 words = 200 wpm

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        # Should show meeting pace (wpm > 180)
        assert "Meeting Pace" in result
        assert "words/min" in result
        assert "Fast!" in result

    def test_dynamic_metric_high_interruptions(self):
        """Test that high interruptions show conversation energy."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 100,
                "percentage": 50,
                "word_count": 400,
                "filler_words_per_minute": 5,
                "times_interrupting": 5,
                "times_interrupted": 4,
            },
            "Speaker B": {
                "total_time": 100,
                "percentage": 50,
                "word_count": 400,
                "filler_words_per_minute": 6,
                "times_interrupting": 4,
                "times_interrupted": 5,
            },
        }
        duration_seconds = 600

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        # Should show interruptions (total = 18 > 5)
        assert "Conversation Energy" in result
        assert "18 interruptions" in result

    def test_dynamic_metric_smooth_focused(self):
        """Test that smooth meetings show focused style."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 100,
                "percentage": 50,
                "word_count": 400,
                "filler_words_per_minute": 5,
                "times_interrupting": 1,
                "times_interrupted": 1,
            },
            "Speaker B": {
                "total_time": 100,
                "percentage": 50,
                "word_count": 400,
                "filler_words_per_minute": 6,
                "times_interrupting": 1,
                "times_interrupted": 1,
            },
        }
        duration_seconds = 600

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        # Should show smooth & focused (low filler, low interruptions)
        assert "Communication Style" in result
        assert "Smooth & Focused" in result

    def test_html_formatting(self):
        """Test that HTML is properly formatted with inline styles."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 1.0,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        duration_seconds = 60

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        # Check for proper HTML structure
        assert "<div style=" in result
        assert "background-color" in result
        assert "border-radius" in result
        assert "Key Takeaways" in result  # Updated section title

    def test_singular_speaker_text(self):
        """Test that 'speaker' (singular) is used for single speaker."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 1.0,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        duration_seconds = 60

        result = generate_key_metrics_html(speaker_stats, duration_seconds)

        assert "1 speaker" in result
        assert "1 speakers" not in result


class TestGenerateEmailPreview:
    """Test suite for complete email generation."""

    def test_email_contains_required_sections(self):
        """Test that email contains all required sections."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 100,
                "percentage": 100,
                "word_count": 300,
                "filler_words_per_minute": 1.5,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        meeting_id = "meeting-123"
        duration_seconds = 120

        result = generate_email_preview(meeting_id, duration_seconds, speaker_stats)

        # Check for HTML structure
        assert "<!DOCTYPE html>" in result
        assert '<html lang="en">' in result

        # Check for header
        assert "Your Meeting Analysis is Ready!" in result

        # Check for CTA
        assert "Identify Yourself & See Your Results" in result
        assert "View My Analysis" in result

        # Check for footer
        assert "Omagine" in result
        assert "automatically deleted after 7 days" in result

    def test_custom_signup_url_is_ignored(self):
        """Test that custom signup URL parameter is ignored (deprecated)."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 1.0,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        meeting_id = "meeting-456"
        duration_seconds = 60
        custom_url = "https://custom.example.com/signup?email=test@example.com"

        result = generate_email_preview(
            meeting_id, duration_seconds, speaker_stats, signup_url=custom_url
        )

        # Custom URL should be ignored, preview URL should be used instead
        assert custom_url not in result
        assert f"/analysis/{meeting_id}" in result

    def test_preview_url_includes_meeting_id(self):
        """Test that preview URL includes meeting ID in path."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 1.0,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        meeting_id = "meeting-789"
        duration_seconds = 60

        result = generate_email_preview(meeting_id, duration_seconds, speaker_stats)

        # Should link to analysis preview page, not signup
        assert f"/analysis/{meeting_id}" in result
        # Should not link to signup page
        assert "/signup" not in result

    def test_preview_url_includes_access_token(self):
        """Test that preview URL includes access_token query parameter when provided."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 1.0,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        meeting_id = "meeting-789"
        duration_seconds = 60
        access_token = "test-token-abc123"

        result = generate_email_preview(
            meeting_id, duration_seconds, speaker_stats, access_token=access_token
        )

        # Should include access token in URL
        assert f"/analysis/{meeting_id}?token={access_token}" in result

    def test_preview_url_without_access_token(self):
        """Test that preview URL works without access_token for backward compatibility."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 1.0,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        meeting_id = "meeting-789"
        duration_seconds = 60

        result = generate_email_preview(meeting_id, duration_seconds, speaker_stats)

        # Should link to analysis page without token
        assert f"/analysis/{meeting_id}" in result
        # Should NOT have ?token= in URL
        assert "?token=" not in result


class TestExtractPreviewData:
    """Test suite for extracting preview data for storage."""

    def test_empty_speaker_stats_returns_default(self):
        """Test that empty stats returns default data."""
        result = extract_preview_data({}, 0)

        assert result["headline"] == "Your meeting analysis is ready!"
        assert result["metrics"] == {}

    def test_extract_all_metrics(self):
        """Test that all metrics are correctly extracted."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 120,
                "percentage": 60,
                "word_count": 500,
                "filler_words_per_minute": 2.5,
                "times_interrupting": 3,
                "times_interrupted": 2,
            },
            "Speaker B": {
                "total_time": 80,
                "percentage": 40,
                "word_count": 300,
                "filler_words_per_minute": 1.5,
                "times_interrupting": 1,
                "times_interrupted": 3,
            },
        }
        duration_seconds = 200

        result = extract_preview_data(speaker_stats, duration_seconds)

        # Headline uses new dynamic format
        assert (
            result["headline"]
            == "2 speakers analyzed with personalized communication insights."
        )
        assert result["metrics"]["duration_minutes"] == 3
        assert result["metrics"]["num_speakers"] == 2
        assert result["metrics"]["total_words"] == 800
        assert result["metrics"]["avg_filler_rate"] == 2.0
        assert result["metrics"]["total_interruptions"] == 9

    def test_filler_rate_rounded_to_one_decimal(self):
        """Test that filler rate is properly rounded."""
        speaker_stats = {
            "Speaker A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 200,
                "filler_words_per_minute": 2.567,
                "times_interrupting": 0,
                "times_interrupted": 0,
            }
        }
        duration_seconds = 60

        result = extract_preview_data(speaker_stats, duration_seconds)

        # Should round to 2.6
        assert result["metrics"]["avg_filler_rate"] == 2.6
