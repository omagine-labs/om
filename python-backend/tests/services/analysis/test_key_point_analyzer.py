"""
Tests for key point position analyzer.

Tests the detection of where key points appear in communication.
"""

import pytest
from app.services.analysis.key_point_analyzer import calculate_key_point_position


class TestKeyPointBasic:
    """Test suite for basic key point detection."""

    def test_bottom_line_up_front(self):
        """Test detection of bottom-line up front pattern."""
        segments = [
            {
                "text": "Bottom line, we need to invest now. Here's why that matters.",
                "start": 0,
                "end": 3,
            }
        ]

        result = calculate_key_point_position(segments)

        # Key point at the start
        assert result["position"] is not None
        assert result["position"] <= 30

    def test_key_point_at_end(self):
        """Test detection of key point at end (building to conclusion)."""
        segments = [
            {
                "text": (
                    "Let me give you some context first. Here's the background. "
                    "The analysis shows growth. In conclusion, the key point is "
                    "we should proceed."
                ),
                "start": 0,
                "end": 5,
            }
        ]

        result = calculate_key_point_position(segments)

        # Should detect key point marker toward the end
        assert result["position"] is not None

    def test_explicit_key_point_marker(self):
        """Test detection of explicit 'the key point' phrase."""
        segments = [
            {
                "text": "There are many factors. The key point here is efficiency.",
                "start": 0,
                "end": 3,
            }
        ]

        result = calculate_key_point_position(segments)

        assert result["position"] is not None

    def test_empty_segments(self):
        """Test handling of empty segments."""
        segments = []

        result = calculate_key_point_position(segments)

        assert result["position"] is None
        assert result["summary"] is None


class TestKeyPointMarkers:
    """Test various key point markers are detected."""

    def test_my_point_is(self):
        """Test 'my point is' marker."""
        segments = [{"text": "My point is that we need action.", "start": 0, "end": 2}]

        result = calculate_key_point_position(segments)

        assert result["position"] is not None

    def test_most_importantly(self):
        """Test 'most importantly' marker."""
        segments = [
            {"text": "Most importantly, timing is critical.", "start": 0, "end": 2}
        ]

        result = calculate_key_point_position(segments)

        assert result["position"] is not None

    def test_the_bottom_line(self):
        """Test 'the bottom line' marker."""
        segments = [
            {"text": "The bottom line is we need more resources.", "start": 0, "end": 2}
        ]

        result = calculate_key_point_position(segments)

        assert result["position"] is not None

    def test_in_summary(self):
        """Test 'in summary' marker."""
        segments = [
            {
                "text": "We discussed many points. In summary, action is needed.",
                "start": 0,
                "end": 3,
            }
        ]

        result = calculate_key_point_position(segments)

        assert result["position"] is not None


class TestRealWorldScenarios:
    """Test realistic scenarios."""

    def test_executive_summary_style(self):
        """Test executive summary style (conclusion first)."""
        segments = [
            {
                "text": "Long story short, we need to hire 10 more people.",
                "start": 0,
                "end": 2,
            },
            {"text": "Here's the supporting data...", "start": 2, "end": 4},
        ]

        result = calculate_key_point_position(segments)

        # Should detect bottom-line up front
        assert result["position"] is not None
        assert result["position"] <= 30

    def test_context_first_style(self):
        """Test building context before conclusion."""
        segments = [
            {"text": "First, let me explain the background.", "start": 0, "end": 2},
            {
                "text": "To give you some context, we've been analyzing...",
                "start": 2,
                "end": 4,
            },
            {"text": "In conclusion, the key point is action.", "start": 4, "end": 6},
        ]

        result = calculate_key_point_position(segments)

        # Should detect key point toward the end
        assert result["position"] is not None

    def test_no_clear_structure(self):
        """Test conversation without clear key point markers."""
        segments = [
            {"text": "We should probably consider the options.", "start": 0, "end": 2},
            {"text": "There are a few things to think about.", "start": 2, "end": 4},
        ]

        result = calculate_key_point_position(segments)

        # May or may not detect a position
        # Should handle gracefully either way
        assert "position" in result
        assert "summary" in result


class TestEdgeCases:
    """Test edge cases."""

    def test_missing_text_field(self):
        """Test segment without text field."""
        segments = [
            {"start": 0, "end": 1},
            {"text": "The key point is clarity.", "start": 1, "end": 2},
        ]

        result = calculate_key_point_position(segments)

        assert result["position"] is not None

    def test_empty_text(self):
        """Test segment with empty text."""
        segments = [
            {"text": "", "start": 0, "end": 1},
        ]

        result = calculate_key_point_position(segments)

        assert result["position"] is None

    def test_multiple_key_point_markers(self):
        """Test text with multiple key point markers."""
        segments = [
            {
                "text": "The key point is growth. Most importantly, we need focus. In conclusion, act now.",
                "start": 0,
                "end": 5,
            }
        ]

        result = calculate_key_point_position(segments)

        # Should average the positions
        assert result["position"] is not None


# Mark as unit tests
pytest.mark.unit(TestKeyPointBasic)
pytest.mark.unit(TestKeyPointMarkers)
pytest.mark.unit(TestRealWorldScenarios)
pytest.mark.unit(TestEdgeCases)
