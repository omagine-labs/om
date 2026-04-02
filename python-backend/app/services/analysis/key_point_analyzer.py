"""
Key point position analyzer for measuring communication structure.

Analyzes where a speaker's main point appears in their communication:
- 0% = Key point at the very start (bottom-line up front)
- 50% = Key point in the middle
- 100% = Key point at the very end (builds up to conclusion)

This metric helps identify communication patterns and clarity.

NOTE: Full LLM-based key point detection is a future enhancement.
Current implementation uses a heuristic approach based on structure markers.
"""

import re
from typing import Dict, Any, List, Optional


# Phrases that often indicate the main point
KEY_POINT_MARKERS = [
    r"\bmy point is\b",
    r"\bthe key point\b",
    r"\bthe main thing\b",
    r"\bmost importantly\b",
    r"\bthe bottom line\b",
    r"\bin summary\b",
    r"\bto summarize\b",
    r"\bin conclusion\b",
    r"\bmy recommendation\b",
    r"\bwhat I'm saying is\b",
    r"\bthe takeaway\b",
    r"\bhere's the thing\b",
    r"\bthe point is\b",
    r"\bwhat matters is\b",
    r"\bessentially\b",
]

# Phrases that indicate building up to a point
LEAD_UP_MARKERS = [
    r"\bfirst\b",
    r"\blet me explain\b",
    r"\bto give you some context\b",
    r"\bsome background\b",
    r"\bbefore I get to\b",
    r"\bto understand this\b",
]

# Phrases that indicate starting with the conclusion
BOTTOM_LINE_MARKERS = [
    r"\bbottom line\b",
    r"\blong story short\b",
    r"\bto cut to the chase\b",
    r"\bhere's the bottom line\b",
    r"\bthe answer is\b",
    r"\bin short\b",
]


def calculate_key_point_position(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Estimate where the speaker's key points typically appear.

    Current approach uses heuristics based on:
    - Position of key point markers in text
    - Presence of lead-up vs bottom-line language
    - Sentence structure patterns

    A future LLM-based implementation would provide more accurate detection.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with key point metrics:
            - position: Estimated position 0-100 (0=start, 100=end), or None
            - summary: Brief description of the pattern detected

    Example:
        >>> segments = [{"text": "Bottom line, we need to act now.", "start": 0, "end": 2}]
        >>> result = calculate_key_point_position(segments)
        >>> result["position"] <= 30  # Key point near the start
        True
    """
    if not segments:
        return {
            "position": None,
            "summary": None,
        }

    # Combine all text for analysis
    all_text = " ".join(segment.get("text", "") for segment in segments)

    if not all_text.strip():
        return {
            "position": None,
            "summary": None,
        }

    text_lower = all_text.lower()
    text_length = len(all_text)

    # Find positions of key point markers
    marker_positions = []
    for pattern in KEY_POINT_MARKERS:
        for match in re.finditer(pattern, text_lower):
            relative_position = (match.start() / text_length) * 100
            marker_positions.append(relative_position)

    # Check for bottom-line up front pattern
    has_bottom_line_start = False
    for pattern in BOTTOM_LINE_MARKERS:
        match = re.search(pattern, text_lower[: min(200, len(text_lower))])
        if match and match.start() < 100:
            has_bottom_line_start = True
            break

    # Check for lead-up pattern
    has_lead_up_start = False
    for pattern in LEAD_UP_MARKERS:
        match = re.search(pattern, text_lower[: min(200, len(text_lower))])
        if match and match.start() < 100:
            has_lead_up_start = True
            break

    # Determine position estimate
    position: Optional[float] = None
    summary: Optional[str] = None

    if marker_positions:
        # Use average position of key point markers
        position = round(sum(marker_positions) / len(marker_positions), 1)
        if position <= 30:
            summary = "Key points typically near the beginning"
        elif position >= 70:
            summary = "Key points typically toward the end"
        else:
            summary = "Key points distributed throughout"
    elif has_bottom_line_start:
        position = 15.0
        summary = "Uses bottom-line up front approach"
    elif has_lead_up_start:
        position = 75.0
        summary = "Builds context before main points"
    else:
        # Default heuristic: assume middle-to-end for most speakers
        # This can be improved with LLM analysis
        position = None
        summary = None

    return {
        "position": position,
        "summary": summary,
    }
