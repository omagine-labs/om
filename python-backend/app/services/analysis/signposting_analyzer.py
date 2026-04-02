"""
Signposting phrases detection service for analyzing communication clarity.

Detects structural/signposting markers (e.g., "first", "to summarize") in
transcript segments. Higher signposting indicates clearer, more organized
communication.
"""

import re
from typing import Dict, Any, List


# Signposting phrases that indicate clear structure
SIGNPOSTING_PATTERNS = [
    "first",
    "second",
    "third",
    "finally",
    "to summarize",
    "in summary",
    "my point is",
    "in conclusion",
    "to begin",
    "to start",
    "next",
    "lastly",
    "another point",
    "on one hand",
    "on the other hand",
    "moving on",
    "let me explain",
    "here's the key",
    "the key point",
    "the main takeaway",
    "to wrap up",
    "in short",
    "the bottom line",
    "most importantly",
]


def detect_signposting(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect and count signposting phrases in transcript segments.

    Uses regex with word boundaries to avoid false matches.
    Case-insensitive matching.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with signposting metrics:
            - total: Total count of all signposting phrases
            - breakdown: Dict mapping signposting phrases to their counts

    Example:
        >>> segments = [{"text": "First, let me explain the key point"}]
        >>> result = detect_signposting(segments)
        >>> result
        {'total': 3, 'breakdown': {'first': 1, 'let me explain': 1, 'the key point': 1}}
    """
    # Count occurrences of each signposting phrase
    signpost_counts: Dict[str, int] = {}

    for segment in segments:
        text = segment.get("text", "").lower()

        # Count each signposting pattern
        for signpost in SIGNPOSTING_PATTERNS:
            signpost_lower = signpost.lower()
            pattern = r"\b" + re.escape(signpost_lower) + r"\b"
            matches = re.findall(pattern, text)

            if matches:
                if signpost_lower not in signpost_counts:
                    signpost_counts[signpost_lower] = 0
                signpost_counts[signpost_lower] += len(matches)

    # Calculate total
    total = sum(signpost_counts.values())

    return {
        "total": total,
        "breakdown": signpost_counts,
    }
