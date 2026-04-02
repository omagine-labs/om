"""
Softeners detection service for analyzing communication patterns.

Detects softening language (e.g., "just", "actually", "kind of") that can
indicate hedging or diminishing one's contributions. Higher softener usage
may indicate reduced assertiveness.
"""

import re
from typing import Dict, Any, List


# Softening patterns that diminish assertiveness
# Note: "sort of", "kind of", "actually", "basically" moved here from filler_words_analyzer.py
# Note: "i guess" and "i suppose" intentionally overlap with hedge_phrases_analyzer.py
# These phrases serve dual purposes - they both soften statements AND express uncertainty.
# The overlap is intentional as the metrics measure different aspects of communication:
# - hedge_phrases: uncertainty/lack of commitment
# - softeners: diminished assertiveness/minimizing contributions
SOFTENER_PATTERNS = [
    "just",
    "actually",
    "sort of",
    "kind of",
    "a little",
    "basically",
    "really",
    "a bit",
    "somewhat",
    "pretty much",
    "i guess",
    "i suppose",
]


def detect_softeners(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect and count softener phrases in transcript segments.

    Uses regex with word boundaries to avoid false matches.
    Case-insensitive matching.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with softener metrics:
            - total: Total count of all softener phrases
            - breakdown: Dict mapping softener phrases to their counts

    Example:
        >>> segments = [{"text": "I just think it's kind of important"}]
        >>> result = detect_softeners(segments)
        >>> result
        {'total': 2, 'breakdown': {'just': 1, 'kind of': 1}}
    """
    # Count occurrences of each softener
    softener_counts: Dict[str, int] = {}

    for segment in segments:
        text = segment.get("text", "").lower()

        # Count each softener pattern
        for softener in SOFTENER_PATTERNS:
            softener_lower = softener.lower()
            pattern = r"\b" + re.escape(softener_lower) + r"\b"
            matches = re.findall(pattern, text)

            if matches:
                if softener_lower not in softener_counts:
                    softener_counts[softener_lower] = 0
                softener_counts[softener_lower] += len(matches)

    # Calculate total
    total = sum(softener_counts.values())

    return {
        "total": total,
        "breakdown": softener_counts,
    }
