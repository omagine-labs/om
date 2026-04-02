"""
Response latency analysis service.

Calculates response timing metrics for speakers in a conversation,
measuring how quickly speakers respond when the conversation turns to them.
"""

from typing import Dict, Any, List


def calculate_per_speaker_response_latency(
    segments: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate response latency metrics per speaker.

    Response latency is measured as the gap between when the previous speaker
    finishes and when the current speaker starts. This helps identify speakers
    who respond quickly vs. those who pause before speaking.

    IMPORTANT - Per-Speaker Isolation:
        Each speaker's metric includes ONLY their own response times, not other
        speakers' responses. The gap is assigned to the speaker who is responding
        (current_speaker), not the previous speaker.

        For example:
        - Speaker A finishes at 5s, Speaker B starts at 6.5s → 1.5s gap belongs to B
        - Speaker B finishes at 10s, Speaker A starts at 10.5s → 0.5s gap belongs to A
        - Speaker A sees only 0.5s in their metrics (not B's 1.5s)
        - Speaker B sees only 1.5s in their metrics (not A's 0.5s)

    Args:
        segments: List of transcription segments with start, end, and speaker

    Returns:
        Dictionary mapping speaker to their response latency metrics:
            - average_seconds: Average gap before this speaker responds
            - response_count: Number of times this speaker responded
            - quick_responses_count: Number of responses < 1 second
            - quick_responses_percentage: Percentage of quick responses

    Notes:
        - Consecutive segments from the same speaker are NOT counted as responses
        - Negative gaps (overlapping speech) are excluded from calculations
        - Only positive gaps (speaker transitions) are included

    Example:
        >>> segments = [
        ...     {"speaker": "A", "start": 0, "end": 5},
        ...     {"speaker": "B", "start": 6, "end": 10},  # B responds: 1.0s gap
        ...     {"speaker": "A", "start": 10.5, "end": 15}  # A responds: 0.5s gap
        ... ]
        >>> result = calculate_per_speaker_response_latency(segments)
        >>> result["B"]["average_seconds"]
        1.0
        >>> result["A"]["average_seconds"]  # A's metric excludes B's 1.0s
        0.5
    """
    if len(segments) < 2:
        return {}

    speaker_gaps: Dict[str, List[float]] = {}
    prev_speaker = None
    prev_end = None

    for segment in segments:
        current_speaker = segment.get("speaker")
        current_start = segment.get("start", 0)

        # Calculate gap if speaker changed
        if prev_speaker and prev_end is not None and prev_speaker != current_speaker:
            gap = current_start - prev_end
            if gap >= 0:  # Only count positive gaps
                # This gap belongs to the current speaker (who is responding)
                if current_speaker not in speaker_gaps:
                    speaker_gaps[current_speaker] = []
                speaker_gaps[current_speaker].append(gap)

        prev_speaker = current_speaker
        prev_end = segment.get("end", 0)

    # Calculate metrics for each speaker
    result = {}
    for speaker, gaps in speaker_gaps.items():
        if not gaps:
            continue

        average_gap = sum(gaps) / len(gaps)
        quick_responses = [g for g in gaps if g < 1.0]
        quick_percentage = len(quick_responses) / len(gaps) * 100

        result[speaker] = {
            "average_seconds": round(average_gap, 2),
            "response_count": len(gaps),
            "quick_responses_count": len(quick_responses),
            "quick_responses_percentage": round(quick_percentage, 1),
        }

    return result
