"""
Helper functions to generate mock AssemblyAI transcription results for testing.

These functions provide realistic test data for various scenarios without
requiring actual API calls to AssemblyAI.
"""

from typing import List, Dict, Any


def create_transcription_segment(
    speaker: str,
    text: str,
    start: float,
    end: float,
) -> Dict[str, Any]:
    """
    Create a single transcription segment.

    Args:
        speaker: Speaker label (e.g., "A", "B")
        text: Text content of the segment
        start: Start time in seconds
        end: End time in seconds

    Returns:
        dict: Segment dictionary matching AssemblyAI format
    """
    return {
        "speaker": speaker,
        "text": text,
        "start": start,
        "end": end,
    }


def create_mock_transcription(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a complete mock transcription result.

    Args:
        segments: List of segment dictionaries

    Returns:
        dict: Complete transcription matching AssemblyAI response format
    """
    return {"segments": segments}


def create_single_speaker_transcription(
    speaker: str = "A",
    segment_count: int = 3,
    words_per_segment: int = 5,
) -> Dict[str, Any]:
    """
    Create a transcription with a single speaker.

    Args:
        speaker: Speaker label
        segment_count: Number of segments
        words_per_segment: Approximate words per segment

    Returns:
        dict: Mock transcription with single speaker
    """
    segments = []
    for i in range(segment_count):
        # Generate text with specified word count
        words = [f"word{j}" for j in range(words_per_segment)]
        text = " ".join(words)

        segments.append(
            create_transcription_segment(
                speaker=speaker,
                text=text,
                start=i * 2.0,
                end=(i * 2.0) + 1.5,
            )
        )

    return create_mock_transcription(segments)


def create_multi_speaker_transcription(
    speakers: List[str] = ["A", "B"],
    segments_per_speaker: int = 3,
    words_per_segment: int = 5,
) -> Dict[str, Any]:
    """
    Create a transcription with multiple speakers alternating.

    Args:
        speakers: List of speaker labels
        segments_per_speaker: Number of segments for each speaker
        words_per_segment: Approximate words per segment

    Returns:
        dict: Mock transcription with multiple speakers
    """
    segments = []
    time = 0.0

    for i in range(segments_per_speaker):
        for speaker in speakers:
            words = [f"word{j}" for j in range(words_per_segment)]
            text = " ".join(words)

            segments.append(
                create_transcription_segment(
                    speaker=speaker,
                    text=text,
                    start=time,
                    end=time + 1.5,
                )
            )
            time += 2.0

    return create_mock_transcription(segments)


def create_empty_transcription() -> Dict[str, Any]:
    """
    Create an empty transcription with no segments.

    Returns:
        dict: Empty transcription
    """
    return create_mock_transcription([])


def create_verbosity_test_transcription() -> Dict[str, Any]:
    """
    Create a transcription specifically for testing verbosity calculations.

    Speaker A: 3 segments with 3, 4, and 5 words (total: 12 words, 3 segments, avg: 4.0)
    Speaker B: 2 segments with 10 and 5 words (total: 15 words, 2 segments, avg: 7.5)

    Returns:
        dict: Mock transcription with known verbosity values
    """
    segments = [
        create_transcription_segment("A", "Hello world test", 0.0, 1.0),
        create_transcription_segment(
            "B", "Hi there friend how are you doing today great thanks", 1.0, 3.0
        ),
        create_transcription_segment("A", "This is four words", 3.0, 4.0),
        create_transcription_segment("B", "Another five word sentence here", 4.0, 5.5),
        create_transcription_segment(
            "A", "Final segment with five words total", 5.5, 7.0
        ),
    ]

    return create_mock_transcription(segments)


def create_edge_case_transcription() -> Dict[str, Any]:
    """
    Create a transcription with edge cases for testing robustness.

    Includes:
    - Empty text
    - Whitespace-only text
    - Multiple consecutive spaces
    - Very long text
    - Single word

    Returns:
        dict: Mock transcription with edge cases
    """
    segments = [
        create_transcription_segment("A", "", 0.0, 1.0),  # Empty
        create_transcription_segment("A", "   ", 1.0, 2.0),  # Whitespace only
        create_transcription_segment(
            "B", "hello  world   test", 2.0, 3.0
        ),  # Multiple spaces
        create_transcription_segment("B", "word", 3.0, 4.0),  # Single word
        create_transcription_segment(
            "C",
            " ".join([f"word{i}" for i in range(100)]),  # Very long (100 words)
            4.0,
            10.0,
        ),
    ]

    return create_mock_transcription(segments)
