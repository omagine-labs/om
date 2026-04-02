"""
Interruption analysis service.

Analyzes conversation segments to detect and count interruptions,
providing metrics on how often speakers interrupt or are interrupted.
"""

from typing import Dict, Any, List


def calculate_per_speaker_interruptions(
    segments: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate interruption metrics per speaker.

    An interruption occurs when two speakers' segments overlap in time.
    This function tracks both how often each speaker interrupts others
    and how often they are interrupted.

    Args:
        segments: List of transcription segments with start, end, and speaker

    Returns:
        Dictionary mapping speaker to their interruption metrics:
            - times_interrupted: Times this speaker was interrupted
            - times_interrupting: Times this speaker interrupted others
            - interruption_rate: Interruptions per minute of their talk time

    Example:
        >>> segments = [
        ...     {"speaker": "A", "start": 0, "end": 10},
        ...     {"speaker": "B", "start": 5, "end": 15},  # Overlaps with A
        ...     {"speaker": "A", "start": 20, "end": 30}
        ... ]
        >>> result = calculate_per_speaker_interruptions(segments)
        >>> result["A"]["times_interrupted"]
        1
        >>> result["B"]["times_interrupting"]
        1
    """
    if len(segments) < 2:
        return {}

    speaker_interruptions: Dict[str, Dict[str, Any]] = {}
    speaker_talk_time: Dict[str, float] = {}

    # Initialize speaker metrics
    for seg in segments:
        speaker = seg.get("speaker")
        if speaker not in speaker_interruptions:
            speaker_interruptions[speaker] = {
                "times_interrupted": 0,
                "times_interrupting": 0,
            }
            speaker_talk_time[speaker] = 0.0

        # Track talk time
        duration = seg.get("end", 0) - seg.get("start", 0)
        speaker_talk_time[speaker] += duration

    # Detect interruptions
    for i, seg1 in enumerate(segments):
        speaker1 = seg1.get("speaker")
        start1 = seg1.get("start", 0)
        end1 = seg1.get("end", 0)

        for seg2 in segments[i + 1 :]:
            speaker2 = seg2.get("speaker")
            start2 = seg2.get("start", 0)
            end2 = seg2.get("end", 0)

            # Check if different speakers and overlapping time
            if speaker1 != speaker2:
                overlap_start = max(start1, start2)
                overlap_end = min(end1, end2)

                if overlap_start < overlap_end:
                    # speaker2 interrupted speaker1
                    speaker_interruptions[speaker1]["times_interrupted"] += 1
                    speaker_interruptions[speaker2]["times_interrupting"] += 1

    # Calculate interruption rates
    result = {}
    for speaker, metrics in speaker_interruptions.items():
        talk_time_minutes = speaker_talk_time[speaker] / 60
        interruption_rate = 0.0
        if talk_time_minutes > 0:
            # Interruption rate = how often YOU interrupt others per minute
            interruption_rate = metrics["times_interrupting"] / talk_time_minutes

        result[speaker] = {
            "times_interrupted": metrics["times_interrupted"],
            "times_interrupting": metrics["times_interrupting"],
            "interruption_rate": round(interruption_rate, 2),
        }

    return result
