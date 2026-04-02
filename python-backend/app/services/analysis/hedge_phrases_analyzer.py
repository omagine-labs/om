"""
Hedge phrases detection service for analyzing communication confidence.

Detects hedging language patterns (e.g., "I think", "maybe", "probably") in
transcript segments. High hedge phrase usage may indicate uncertainty or
lack of confidence.
"""

import re
from typing import Dict, Any, List


# Hedging phrases that indicate uncertainty or lack of commitment
# Note: "i guess" and "i suppose" intentionally overlap with softeners_analyzer.py
# These phrases serve dual purposes - they both express uncertainty AND soften statements.
# The overlap is intentional as the metrics measure different aspects of communication:
# - hedge_phrases: uncertainty/lack of commitment
# - softeners: diminished assertiveness/minimizing contributions
HEDGE_PATTERNS = [
    "i think",
    "maybe",
    "probably",
    "i guess",
    "might",
    "perhaps",
    "i believe",
    "possibly",
    "i suppose",
    "it seems",
    "kind of think",
    "i feel like",
]


def detect_hedge_phrases(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect and count hedge phrases in transcript segments.

    Uses regex with word boundaries to avoid false matches.
    Case-insensitive matching.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with hedge phrase metrics:
            - total: Total count of all hedge phrases
            - breakdown: Dict mapping hedge phrases to their counts

    Example:
        >>> segments = [{"text": "I think we should maybe proceed"}]
        >>> result = detect_hedge_phrases(segments)
        >>> result
        {'total': 2, 'breakdown': {'i think': 1, 'maybe': 1}}
    """
    # Count occurrences of each hedge phrase
    hedge_counts: Dict[str, int] = {}

    for segment in segments:
        text = segment.get("text", "").lower()

        # Count each hedge pattern
        for hedge in HEDGE_PATTERNS:
            # Use word boundaries to avoid matching partial words
            hedge_lower = hedge.lower()
            pattern = r"\b" + re.escape(hedge_lower) + r"\b"
            matches = re.findall(pattern, text)

            if matches:
                if hedge_lower not in hedge_counts:
                    hedge_counts[hedge_lower] = 0
                hedge_counts[hedge_lower] += len(matches)

    # Calculate total
    total = sum(hedge_counts.values())

    return {
        "total": total,
        "breakdown": hedge_counts,
    }
