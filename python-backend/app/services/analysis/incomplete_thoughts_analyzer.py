"""
Incomplete thoughts detection service for analyzing communication clarity.

Detects segments that end without completing a thought - trailing off,
ending with filler words, or lacking proper sentence closure.

NOTE on false positives: Short segments (≤3 words) without terminal punctuation
are flagged as incomplete, which may produce false positives when:
- Transcription segments are split mid-sentence by the ASR system
- Short acknowledgments aren't in the simple_responses whitelist
- Technical terms or proper nouns appear as standalone segments

The current heuristic balances recall (catching actual incomplete thoughts) vs
precision (avoiding false flags). Consider the percentage metric rather than
raw count for a more robust signal.
"""

import re
from typing import Dict, Any, List


# Trailing markers that suggest incomplete thoughts
TRAILING_MARKERS = [
    "um",
    "uh",
    "so",
    "so yeah",
    "anyway",
    "but",
    "and",
    "or",
    "like",
    "you know",
    "I mean",
    "just",
    "well",
    "I guess",
    "kind of",
    "sort of",
]

# Terminal punctuation that indicates complete thoughts
TERMINAL_PUNCTUATION = [".", "!", "?"]


def detect_incomplete_thoughts(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect segments that appear to be incomplete thoughts.

    Detection heuristics:
    1. Ends with trailing markers (um, so yeah, anyway, but, and, etc.)
    2. Ends with ellipsis (...) suggesting trailing off
    3. No terminal punctuation and ends with filler/connector words

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with incomplete thoughts metrics:
            - count: Number of segments with incomplete thoughts
            - percentage: Percentage of segments that are incomplete
            - incomplete_segments: List of segment indices that are incomplete

    Example:
        >>> segments = [
        ...     {"text": "We should consider...", "start": 0, "end": 2},
        ...     {"text": "That's a good point.", "start": 2, "end": 4}
        ... ]
        >>> result = detect_incomplete_thoughts(segments)
        >>> result
        {'count': 1, 'percentage': 50.0, 'incomplete_segments': [0]}
    """
    if not segments:
        return {
            "count": 0,
            "percentage": 0.0,
            "incomplete_segments": [],
        }

    incomplete_count = 0
    incomplete_indices = []

    for idx, segment in enumerate(segments):
        text = segment.get("text", "").strip()

        if not text:
            continue

        if _is_incomplete_thought(text):
            incomplete_count += 1
            incomplete_indices.append(idx)

    # Calculate percentage
    total_segments = len([s for s in segments if s.get("text", "").strip()])
    if total_segments > 0:
        percentage = round((incomplete_count / total_segments) * 100, 1)
    else:
        percentage = 0.0

    return {
        "count": incomplete_count,
        "percentage": percentage,
        "incomplete_segments": incomplete_indices,
    }


def _is_incomplete_thought(text: str) -> bool:
    """
    Determine if a text segment represents an incomplete thought.

    Args:
        text: The text content to analyze

    Returns:
        True if the text appears to be an incomplete thought
    """
    text = text.strip()
    text_lower = text.lower()

    # Check for explicit ellipsis (trailing off)
    if text.endswith("...") or text.endswith("…"):
        return True

    # Check for trailing dash (cut off)
    if text.endswith("-") or text.endswith("—"):
        return True

    # Check if ends with terminal punctuation (complete thought)
    has_terminal_punct = any(text.endswith(p) for p in TERMINAL_PUNCTUATION)

    if has_terminal_punct:
        return False

    # Check if ends with a trailing marker word/phrase
    for marker in TRAILING_MARKERS:
        marker_lower = marker.lower()
        # Check if text ends with this marker (with word boundary)
        pattern = r"\b" + re.escape(marker_lower) + r"\s*$"
        if re.search(pattern, text_lower):
            return True

    # If no terminal punctuation and segment is short, likely incomplete
    # But only if it doesn't look like a complete statement
    words = text.split()
    if len(words) <= 3 and not has_terminal_punct:
        # Very short segments without punctuation are often incomplete
        # But skip if it looks like a complete response (e.g., "Yes", "Okay", "Got it")
        simple_responses = [
            "yes",
            "no",
            "okay",
            "ok",
            "sure",
            "right",
            "yeah",
            "yep",
            "nope",
            "gotcha",
            "exactly",
            "absolutely",
            "definitely",
            "agreed",
            "correct",
        ]
        if text_lower not in simple_responses:
            return True

    return False
