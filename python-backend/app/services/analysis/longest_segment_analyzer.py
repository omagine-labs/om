"""
Longest segment analyzer for detecting monologuing behavior.

Calculates the longest uninterrupted speaking turn duration per speaker
in seconds. High values may indicate monologuing behavior.
"""

from typing import Dict, Any, List


def calculate_longest_segment(
    segments: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate the longest segment duration for each speaker.

    Args:
        segments: List of transcription segments with speaker, start, and end times
                  Example: [{"speaker": "A", "text": "...", "start": 0.0, "end": 5.2}, ...]

    Returns:
        Dictionary mapping speaker names to their metrics:
            {
                "Speaker A": {
                    "longest_segment_seconds": 45.2
                },
                ...
            }

    Example:
        >>> segments = [
        ...     {"speaker": "A", "start": 0.0, "end": 10.0, "text": "..."},
        ...     {"speaker": "B", "start": 10.0, "end": 15.0, "text": "..."},
        ...     {"speaker": "A", "start": 15.0, "end": 45.0, "text": "..."},  # 30 seconds
        ... ]
        >>> result = calculate_longest_segment(segments)
        >>> result["A"]["longest_segment_seconds"]
        30.0
    """
    speaker_longest: Dict[str, float] = {}

    for segment in segments:
        speaker = segment.get("speaker")
        if not speaker:
            continue

        start = segment.get("start", 0)
        end = segment.get("end", 0)
        duration = end - start

        # Skip invalid durations
        if duration <= 0:
            continue

        # Track the longest segment for each speaker
        if speaker not in speaker_longest or duration > speaker_longest[speaker]:
            speaker_longest[speaker] = duration

    # Format the result
    return {
        speaker: {"longest_segment_seconds": round(duration, 2)}
        for speaker, duration in speaker_longest.items()
    }
