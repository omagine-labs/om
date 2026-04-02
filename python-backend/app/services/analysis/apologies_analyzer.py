"""
Apologies detection service for analyzing communication confidence.

Detects apologetic phrases (e.g., "sorry", "I apologize") in transcript segments.
Excessive apologies may indicate lack of confidence or over-accommodation.
"""

import re
from typing import Dict, Any, List


# Apology phrases to detect
APOLOGY_PATTERNS = [
    "sorry",
    "i apologize",
    "my bad",
    "excuse me",
    "forgive me",
    "i'm sorry",
    "my apologies",
    "pardon me",
]


def detect_apologies(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect and count apology phrases in transcript segments.

    Uses regex with word boundaries to avoid false matches.
    Case-insensitive matching.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with apology metrics:
            - total: Total count of all apology phrases
            - breakdown: Dict mapping apology phrases to their counts

    Example:
        >>> segments = [{"text": "Sorry, I apologize for the delay"}]
        >>> result = detect_apologies(segments)
        >>> result
        {'total': 2, 'breakdown': {'sorry': 1, 'i apologize': 1}}
    """
    # Count occurrences of each apology phrase
    apology_counts: Dict[str, int] = {}

    for segment in segments:
        text = segment.get("text", "").lower()

        # Count each apology pattern
        for apology in APOLOGY_PATTERNS:
            apology_lower = apology.lower()
            pattern = r"\b" + re.escape(apology_lower) + r"\b"
            matches = re.findall(pattern, text)

            if matches:
                if apology_lower not in apology_counts:
                    apology_counts[apology_lower] = 0
                apology_counts[apology_lower] += len(matches)

    # Calculate total
    total = sum(apology_counts.values())

    return {
        "total": total,
        "breakdown": apology_counts,
    }
