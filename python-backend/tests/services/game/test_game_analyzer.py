"""
Tests for GameAnalyzer _parse_response method.

Tests the new checklist-based scoring format validation.
"""

import pytest
from app.services.game.game_analyzer import GameAnalyzer


class TestParseResponse:
    """Test _parse_response validation for checklist format."""

    @pytest.fixture
    def analyzer(self):
        """Create analyzer instance with mock API key."""
        return GameAnalyzer(api_key="test-api-key")

    @pytest.fixture
    def valid_response(self):
        """Return a valid checklist-format response."""
        return """{
            "transcript": [
                {"t_start_sec": 0, "t_end_sec": 15, "text": "Hello, welcome to my presentation."},
                {"t_start_sec": 15, "t_end_sec": 30, "text": "Today we will discuss pigeons."}
            ],
            "signals": {
                "ending_strength": "medium",
                "unifying_frame_present": true,
                "transitions_overall": "medium",
                "landed_points_overall": "medium"
            },
            "signal_feedback": [
                {
                    "signal": "ending_strength",
                    "quotes": ["thank you", "that's all"],
                    "tip": "Consider a stronger conclusion."
                }
            ],
            "clarity": {
                "base": 3,
                "bonuses": ["grammar", "explained_bridges"],
                "penalties": [],
                "hard_cap_applied": null,
                "score": 7,
                "explanation": "You spoke clearly with good grammar."
            },
            "confidence": {
                "base": 3,
                "bonuses": ["steady_pace"],
                "penalties": ["fourth_wall"],
                "hard_cap_applied": null,
                "score": 5,
                "explanation": "Mostly confident but broke the fourth wall once."
            },
            "biggest_fixes": {
                "clarity": "Try to explain connections more.",
                "confidence": "Avoid commenting on the game itself."
            }
        }"""

    def test_valid_response_parses_successfully(self, analyzer, valid_response):
        """Test that valid checklist format response parses correctly."""
        result = analyzer._parse_response(valid_response)

        assert result.clarity["score"] == 7
        assert result.confidence["score"] == 5
        assert result.clarity["base"] == 3
        assert result.confidence["base"] == 3
        assert "grammar" in result.clarity["bonuses"]
        assert "fourth_wall" in result.confidence["penalties"]
        assert len(result.transcript) == 2

    def test_computed_fields_are_set(self, analyzer, valid_response):
        """Test that backward-compatible computed fields are set."""
        result = analyzer._parse_response(valid_response)

        assert result.clarity_score == 7
        assert result.confidence_score == 5
        assert result.word_count > 0
        assert result.transcript_text != ""

    def test_missing_transcript_raises_error(self, analyzer):
        """Test that missing transcript field raises ValueError."""
        response = """{
            "signals": {},
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="Missing required field: transcript"):
            analyzer._parse_response(response)

    def test_missing_clarity_raises_error(self, analyzer):
        """Test that missing clarity field raises ValueError."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="Missing required field: clarity"):
            analyzer._parse_response(response)

    def test_invalid_clarity_score_raises_error(self, analyzer):
        """Test that clarity score outside 1-10 range raises ValueError."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": [], "score": 15, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(
            ValueError, match="clarity.score must be an integer between 1 and 10"
        ):
            analyzer._parse_response(response)

    def test_invalid_base_raises_error(self, analyzer):
        """Test that clarity base not equal to 3 raises ValueError."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 10, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="clarity.base must be 3"):
            analyzer._parse_response(response)

    def test_bonuses_must_be_list(self, analyzer):
        """Test that bonuses field must be a list."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": "grammar", "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="clarity.bonuses must be a list"):
            analyzer._parse_response(response)

    def test_penalties_must_be_list(self, analyzer):
        """Test that penalties field must be a list."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": "word_salad", "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="clarity.penalties must be a list"):
            analyzer._parse_response(response)

    def test_missing_signals_field_raises_error(self, analyzer):
        """Test that missing signal fields raise ValueError."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {"ending_strength": "low"},
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(
            ValueError, match="signals.unifying_frame_present is required"
        ):
            analyzer._parse_response(response)

    def test_missing_biggest_fixes_raises_error(self, analyzer):
        """Test that missing biggest_fixes fields raise ValueError."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": ""}
        }"""

        with pytest.raises(
            ValueError, match="biggest_fixes must have clarity and confidence"
        ):
            analyzer._parse_response(response)

    def test_invalid_json_raises_error(self, analyzer):
        """Test that invalid JSON raises ValueError."""
        response = "not valid json"

        with pytest.raises(ValueError, match="Failed to parse Gemini response"):
            analyzer._parse_response(response)

    def test_empty_transcript_raises_error(self, analyzer):
        """Test that empty transcript list raises ValueError."""
        response = """{
            "transcript": [],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="transcript must be a non-empty list"):
            analyzer._parse_response(response)

    def test_transcript_chunk_missing_fields_raises_error(self, analyzer):
        """Test that transcript chunk without required fields raises error."""
        response = """{
            "transcript": [{"text": "Hello"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        with pytest.raises(ValueError, match="transcript\\[0\\] must have t_start_sec"):
            analyzer._parse_response(response)

    def test_hard_cap_applied_field_accepted(self, analyzer):
        """Test that hard_cap_applied field is accepted when set."""
        response = """{
            "transcript": [{"t_start_sec": 0, "t_end_sec": 10, "text": "Um what is it?"}],
            "signals": {
                "ending_strength": "low", "unifying_frame_present": false,
                "transitions_overall": "low", "landed_points_overall": "low"
            },
            "signal_feedback": [],
            "clarity": {
                "base": 3,
                "bonuses": [],
                "penalties": ["word_salad", "broken_grammar"],
                "hard_cap_applied": "Multiple unintelligible sentences",
                "score": 4,
                "explanation": "Mostly word salad."
            },
            "confidence": {"base": 3, "bonuses": [], "penalties": [], "score": 5, "explanation": ""},
            "biggest_fixes": {"clarity": "", "confidence": ""}
        }"""

        result = analyzer._parse_response(response)

        assert result.clarity["hard_cap_applied"] == "Multiple unintelligible sentences"
        assert result.clarity["score"] == 4
