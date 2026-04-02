"""
Topics per segment analyzer for measuring idea density.

Analyzes how many distinct topics/ideas a speaker covers per speaking segment.
This metric helps identify whether a speaker stays focused (few topics) or
covers many ideas (high topic density).

NOTE: Full LLM-based topic detection is a future enhancement.
Current implementation uses a heuristic approach based on sentence structure.
"""

import re
from typing import Dict, Any, List


def calculate_topics_per_segment(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate average topics per segment using heuristic analysis.

    Current approach estimates topics based on:
    - Sentence count (each sentence often introduces a new idea)
    - Transition phrases (indicate topic shifts)
    - Conjunctions (can indicate multiple ideas)

    A future LLM-based implementation would provide more accurate topic detection.

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with topics metrics:
            - avg_topics_per_segment: Average estimated topics per segment
            - max_topics_in_segment: Maximum topics found in any single segment

    Example:
        >>> segments = [{"text": "First point. Second point. Third point.", "start": 0, "end": 5}]
        >>> result = calculate_topics_per_segment(segments)
        >>> result["avg_topics_per_segment"] >= 2
        True
    """
    if not segments:
        return {
            "avg_topics_per_segment": None,
            "max_topics_in_segment": 0,
        }

    # Filter segments with actual text
    valid_segments = [s for s in segments if s.get("text", "").strip()]

    if not valid_segments:
        return {
            "avg_topics_per_segment": None,
            "max_topics_in_segment": 0,
        }

    total_topics = 0
    max_topics = 0
    segment_count = 0

    for segment in valid_segments:
        text = segment.get("text", "").strip()
        topics_in_segment = _estimate_topics(text)
        total_topics += topics_in_segment
        max_topics = max(max_topics, topics_in_segment)
        segment_count += 1

    if segment_count > 0:
        avg = round(total_topics / segment_count, 2)
    else:
        avg = None

    return {
        "avg_topics_per_segment": avg,
        "max_topics_in_segment": max_topics,
    }


def _estimate_topics(text: str) -> int:
    """
    Estimate number of topics/ideas in a text segment.

    Uses heuristics based on:
    - Sentence count (base estimate)
    - Topic transition markers

    Args:
        text: The text content to analyze

    Returns:
        Estimated number of topics (minimum 1 for non-empty text)
    """
    if not text.strip():
        return 0

    # Count sentences as base estimate
    # Split on period, exclamation, or question mark followed by space or end
    sentences = re.split(r"[.!?]+(?:\s|$)", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    sentence_count = max(1, len(sentences))

    # Count topic transition markers
    transition_patterns = [
        r"\balso\b",
        r"\badditionally\b",
        r"\bfurthermore\b",
        r"\bmoreover\b",
        r"\banother point\b",
        r"\bsecondly\b",
        r"\bthirdly\b",
        r"\bon the other hand\b",
        r"\bhowever\b",
        r"\bthat said\b",
        r"\bmoving on\b",
        r"\bspeaking of\b",
        r"\bregarding\b",
    ]

    transition_count = 0
    text_lower = text.lower()
    for pattern in transition_patterns:
        matches = re.findall(pattern, text_lower)
        transition_count += len(matches)

    # Estimated topics = sentences with bonus for explicit transitions
    # But transitions often connect sentences, so don't double count
    estimated = sentence_count + (transition_count // 2)

    return max(1, estimated)
