"""
Filler words detection service for analyzing speech patterns.

Detects common filler words and phrases in transcript segments and returns
aggregated counts for analysis.
"""

import re
from typing import Dict, Any, List


# Common filler words and phrases to detect
# Note: "sort of", "kind of", "actually", "basically" moved to softeners_analyzer.py
FILLER_PATTERNS = [
    "um",
    "uh",
    "like",
    "you know",
    "I mean",
    "so",
    "okay",
    "gotcha",
]


def detect_filler_words(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect and count filler words in transcript segments.

    Uses regex with word boundaries to avoid false matches (e.g., "um" in "umbrella").
    Case-insensitive matching.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with filler word metrics:
            - total: Total count of all filler words
            - breakdown: Dict mapping filler words to their counts (e.g., {"um": 12, "like": 8})

    Example:
        >>> segments = [{"text": "Um, I think, like, you know what I mean"}]
        >>> result = detect_filler_words(segments)
        >>> result
        {'total': 4, 'breakdown': {'um': 1, 'like': 1, 'you know': 1, 'I mean': 1}}
    """
    # Count occurrences of each filler
    filler_counts: Dict[str, int] = {}

    for segment in segments:
        text = segment.get("text", "").lower()

        # Count each filler pattern
        for filler in FILLER_PATTERNS:
            # Use word boundaries to avoid matching "um" in "umbrella"
            # re.escape handles special characters in multi-word phrases like "you know"
            # Convert filler to lowercase for case-insensitive matching
            filler_lower = filler.lower()
            pattern = r"\b" + re.escape(filler_lower) + r"\b"
            matches = re.findall(pattern, text)

            if matches:
                if filler_lower not in filler_counts:
                    filler_counts[filler_lower] = 0
                filler_counts[filler_lower] += len(matches)

    # Calculate total
    total = sum(filler_counts.values())

    return {
        "total": total,
        "breakdown": filler_counts,
    }
