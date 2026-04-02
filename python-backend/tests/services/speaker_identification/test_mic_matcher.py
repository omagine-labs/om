"""
Unit tests for MicMatcher (speaker identification via microphone matching).

Tests VAD timestamp matching to speaker segments with volume analysis.
"""

import pytest
import numpy as np
import soundfile as sf
from pathlib import Path
import tempfile
from unittest.mock import patch

from app.services.speaker_identification.mic_matcher import MicMatcher


@pytest.fixture
def mic_matcher():
    """Create MicMatcher instance."""
    return MicMatcher()


@pytest.fixture
def vad_timestamps_simple():
    """Simple VAD timestamps - user spoke for 30 seconds total."""
    return [
        {"start": 0.0, "end": 10.0},  # 10 seconds
        {"start": 20.0, "end": 40.0},  # 20 seconds
        # Total: 30 seconds
    ]


@pytest.fixture
def speaker_segments_two_speakers():
    """Speaker segments with two speakers (A and B)."""
    return [
        {"speaker": "A", "start": 0.0, "end": 12.0, "text": "Hello there"},
        {"speaker": "B", "start": 12.0, "end": 22.0, "text": "Hi friend"},
        {"speaker": "A", "start": 22.0, "end": 45.0, "text": "How are you doing"},
        {"speaker": "B", "start": 45.0, "end": 50.0, "text": "Great thanks"},
    ]


@pytest.fixture
def mock_mic_audio_file():
    """Create a mock microphone audio file with clear volume differences."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

        sample_rate = 16000
        duration = 50  # 50 seconds

        # Generate audio matching speaker_segments_two_speakers fixture:
        # Speaker A: 0-12s, 22-45s (user - loud on mic)
        # Speaker B: 12-22s, 45-50s (other person - quiet on mic)
        audio_data = np.zeros(int(sample_rate * duration), dtype=np.int16)

        # Speaker A segments (user) - MUCH louder (amplitude 25000)
        for start, end in [(0, 12), (22, 45)]:
            start_idx = int(start * sample_rate)
            end_idx = int(end * sample_rate)
            segment_duration = end - start
            segment_t = np.linspace(0, segment_duration, end_idx - start_idx)
            audio_data[start_idx:end_idx] = (
                25000 * np.sin(2 * np.pi * 440 * segment_t)
            ).astype(np.int16)

        # Speaker B segments (other person) - quieter (amplitude 8000)
        for start, end in [(12, 22), (45, 50)]:
            start_idx = int(start * sample_rate)
            end_idx = int(end * sample_rate)
            segment_duration = end - start
            segment_t = np.linspace(0, segment_duration, end_idx - start_idx)
            audio_data[start_idx:end_idx] = (
                8000 * np.sin(2 * np.pi * 880 * segment_t)
            ).astype(np.int16)

        sf.write(str(tmp_path), audio_data, sample_rate, subtype="PCM_16")

        yield tmp_path

        if tmp_path.exists():
            tmp_path.unlink()


@pytest.mark.asyncio
async def test_identify_user_speaker_high_confidence(
    mic_matcher,
    vad_timestamps_simple,
    speaker_segments_two_speakers,
    mock_mic_audio_file,
):
    """Test successful user identification with high confidence."""
    result = await mic_matcher.identify_user_speaker(
        vad_timestamps_simple,
        speaker_segments_two_speakers,
        str(mock_mic_audio_file),
    )

    # Should identify Speaker A (better overlap with VAD)
    assert result["user_speaker"] == "A"

    # Confidence should be high (>0.6 minimum)
    assert result["confidence"] >= 0.6
    assert result["confidence"] <= 1.0

    # Should meet the threshold for auto-assignment
    assert result["meets_threshold"] is True

    # Shared mic should not be detected (only one speaker matches VAD significantly)
    assert result["shared_mic_detected"] is False

    # No alternative speakers
    assert len(result["alternative_speakers"]) == 0


@pytest.mark.asyncio
async def test_identify_user_speaker_no_vad_timestamps(
    mic_matcher, speaker_segments_two_speakers, mock_mic_audio_file
):
    """Test that no VAD timestamps raises ValueError."""
    with pytest.raises(ValueError, match="No microphone audio detected"):
        await mic_matcher.identify_user_speaker(
            [],  # No VAD timestamps
            speaker_segments_two_speakers,
            str(mock_mic_audio_file),
        )


@pytest.mark.asyncio
async def test_identify_user_speaker_low_confidence(
    mic_matcher, speaker_segments_two_speakers, mock_mic_audio_file
):
    """Test that low confidence (<0.6) returns result with meets_threshold=False."""
    # VAD timestamps that barely overlap with any speaker
    vad_timestamps_low_overlap = [
        {"start": 11.5, "end": 12.5},  # 1 second, minimal overlap
    ]

    result = await mic_matcher.identify_user_speaker(
        vad_timestamps_low_overlap,
        speaker_segments_two_speakers,
        str(mock_mic_audio_file),
    )

    # Should return a result even with low confidence
    assert result is not None
    assert "user_speaker" in result
    assert "confidence" in result

    # Should indicate that threshold is not met
    assert result["meets_threshold"] is False

    # Confidence should be below threshold
    assert result["confidence"] < 0.6


@pytest.mark.asyncio
async def test_identify_user_speaker_shared_mic_detected(
    mic_matcher, mock_mic_audio_file
):
    """Test shared microphone detection when multiple speakers overlap significantly."""
    # VAD timestamps that overlap with both speakers
    vad_timestamps_shared = [
        {"start": 0.0, "end": 20.0},  # Overlaps with both A (0-12) and B (12-20)
        {"start": 22.0, "end": 48.0},  # Overlaps with both A (22-45) and B (45-48)
    ]

    # Speaker segments aligned with mock audio timing
    # Both speakers get significant VAD overlap
    speaker_segments_shared = [
        {"speaker": "A", "start": 0.0, "end": 12.0, "text": "Hello"},
        {"speaker": "B", "start": 10.0, "end": 22.0, "text": "Hi"},
        {"speaker": "A", "start": 22.0, "end": 45.0, "text": "How are you"},
        {"speaker": "B", "start": 43.0, "end": 50.0, "text": "Good thanks"},
    ]

    result = await mic_matcher.identify_user_speaker(
        vad_timestamps_shared,
        speaker_segments_shared,
        str(mock_mic_audio_file),
    )

    # Should identify Speaker A (louder in mic audio despite shared mic)
    assert result["user_speaker"] == "A"

    # Should detect shared microphone (>20% overlap for both speakers)
    assert result["shared_mic_detected"] is True

    # Should have alternative speakers
    assert len(result["alternative_speakers"]) > 0


@pytest.mark.asyncio
async def test_identify_user_speaker_volume_analysis_refinement(
    mic_matcher, mock_mic_audio_file
):
    """Test that volume analysis refines identification when shared mic detected."""
    # Timestamps that overlap significantly with both speakers (>30% each for new threshold)
    # With 150ms timing tolerance, segments are expanded slightly
    vad_timestamps = [
        {"start": 0.0, "end": 22.0},  # Overlaps with both A (0-12) and B (12-22) fully
        {"start": 27.0, "end": 40.0},  # Overlaps with A (27-40)
        {"start": 45.0, "end": 50.0},  # Overlaps with B (45-50)
    ]
    # Total VAD: 22 + 13 + 5 = 40 seconds
    # Speaker A overlap: ~12 + 13 = 25 seconds = ~62%
    # Speaker B overlap: ~10 + 5 = 15 seconds = ~37% > 30% threshold

    # Speaker segments aligned with mock audio (A loud at 0-12, 22-45; B quiet at 12-22, 45-50)
    speaker_segments = [
        {"speaker": "A", "start": 0.0, "end": 12.0, "text": "Hello"},
        {"speaker": "B", "start": 12.0, "end": 22.0, "text": "Hi there"},
        {"speaker": "A", "start": 22.0, "end": 45.0, "text": "How are you"},
        {"speaker": "B", "start": 45.0, "end": 50.0, "text": "Good thanks"},
    ]

    result = await mic_matcher.identify_user_speaker(
        vad_timestamps,
        speaker_segments,
        str(mock_mic_audio_file),
    )

    # Should identify Speaker A (louder in mic audio)
    assert result["user_speaker"] == "A"

    # Shared mic should be detected
    assert result["shared_mic_detected"] is True


@pytest.mark.asyncio
async def test_identify_user_speaker_sentry_breadcrumbs(
    mic_matcher,
    vad_timestamps_simple,
    speaker_segments_two_speakers,
    mock_mic_audio_file,
):
    """Test that Sentry breadcrumbs are added during identification."""
    with patch(
        "app.services.speaker_identification.mic_matcher.sentry_sdk"
    ) as mock_sentry:
        result = await mic_matcher.identify_user_speaker(
            vad_timestamps_simple,
            speaker_segments_two_speakers,
            str(mock_mic_audio_file),
        )

        # Should return valid result
        assert result is not None

        # Should add multiple breadcrumbs
        assert mock_sentry.add_breadcrumb.call_count >= 3

        # Check breadcrumb categories
        calls = mock_sentry.add_breadcrumb.call_args_list
        categories = [call.kwargs.get("category") for call in calls]
        assert "speaker_matching" in categories


@pytest.mark.asyncio
async def test_identify_user_speaker_sentry_breadcrumb_low_confidence(
    mic_matcher, speaker_segments_two_speakers, mock_mic_audio_file
):
    """Test that Sentry breadcrumb is added when confidence is too low."""
    vad_timestamps_low = [{"start": 11.5, "end": 12.5}]

    with patch(
        "app.services.speaker_identification.mic_matcher.sentry_sdk"
    ) as mock_sentry:
        result = await mic_matcher.identify_user_speaker(
            vad_timestamps_low,
            speaker_segments_two_speakers,
            str(mock_mic_audio_file),
        )

        # Should return result with meets_threshold=False
        assert result["meets_threshold"] is False

        # Should add breadcrumb about low confidence (warning level)
        breadcrumb_calls = mock_sentry.add_breadcrumb.call_args_list
        low_confidence_breadcrumbs = [
            call
            for call in breadcrumb_calls
            if "below threshold" in call.kwargs.get("message", "")
        ]
        assert len(low_confidence_breadcrumbs) > 0


def test_calculate_overlap_full_overlap(mic_matcher):
    """Test overlap calculation when VAD segment fully overlaps speaker segment."""
    vad_timestamps = [{"start": 2.0, "end": 8.0}]  # 6 seconds
    speaker_segment = {"start": 0.0, "end": 10.0}

    overlap = mic_matcher._calculate_overlap(vad_timestamps, speaker_segment)

    # Should have 6 seconds of overlap
    assert overlap == 6.0


def test_calculate_overlap_partial_overlap(mic_matcher):
    """Test overlap calculation with partial overlap."""
    vad_timestamps = [{"start": 5.0, "end": 15.0}]
    speaker_segment = {"start": 0.0, "end": 10.0}

    overlap = mic_matcher._calculate_overlap(vad_timestamps, speaker_segment)

    # Should have ~5.15 seconds of overlap (5-10.15)
    # With 150ms timing tolerance, speaker segment expands to 0-10.15
    # Overlap is 5.0 to 10.15 = 5.15 seconds
    assert overlap == pytest.approx(5.15, rel=0.01)


def test_calculate_overlap_no_overlap(mic_matcher):
    """Test overlap calculation when segments don't overlap."""
    vad_timestamps = [{"start": 15.0, "end": 20.0}]
    speaker_segment = {"start": 0.0, "end": 10.0}

    overlap = mic_matcher._calculate_overlap(vad_timestamps, speaker_segment)

    # Should have no overlap
    assert overlap == 0.0


def test_calculate_overlap_multiple_vad_segments(mic_matcher):
    """Test overlap calculation with multiple VAD segments."""
    vad_timestamps = [
        {"start": 2.0, "end": 5.0},  # 3 seconds overlap
        {"start": 7.0, "end": 9.0},  # 2 seconds overlap
    ]
    speaker_segment = {"start": 0.0, "end": 10.0}

    overlap = mic_matcher._calculate_overlap(vad_timestamps, speaker_segment)

    # Should have 5 seconds total overlap
    assert overlap == 5.0


def test_calculate_overlap_vad_extends_beyond_speaker(mic_matcher):
    """Test overlap when VAD segment extends beyond speaker segment."""
    vad_timestamps = [{"start": 5.0, "end": 15.0}]
    speaker_segment = {"start": 8.0, "end": 12.0}

    overlap = mic_matcher._calculate_overlap(vad_timestamps, speaker_segment)

    # Should only count overlap within expanded speaker segment
    # With 150ms tolerance, speaker segment expands to 7.85-12.15
    # Overlap is 7.85 to 12.15 = 4.3 seconds
    assert overlap == pytest.approx(4.3, rel=0.01)


def test_calculate_overlap_empty_vad(mic_matcher):
    """Test overlap calculation with no VAD timestamps."""
    vad_timestamps = []
    speaker_segment = {"start": 0.0, "end": 10.0}

    overlap = mic_matcher._calculate_overlap(vad_timestamps, speaker_segment)

    # Should have no overlap
    assert overlap == 0.0


@pytest.mark.asyncio
async def test_calculate_speaker_volumes(mic_matcher, mock_mic_audio_file):
    """Test speaker volume calculation from mic audio."""
    speaker_segments = [
        {"speaker": "A", "start": 0.0, "end": 12.0},  # Loud speaker
        {"speaker": "B", "start": 12.0, "end": 22.0},  # Quiet speaker
    ]

    speakers = ["A", "B"]

    volumes = await mic_matcher._calculate_speaker_volumes(
        speaker_segments, speakers, str(mock_mic_audio_file)
    )

    # Speaker A should be louder (normalized to 1.0 as reference)
    assert "A" in volumes
    assert "B" in volumes

    # Volumes should be positive
    assert volumes["A"] > 0
    assert volumes["B"] > 0

    # Speaker A should have higher volume than B (louder in mock file)
    assert volumes["A"] > volumes["B"]


@pytest.mark.asyncio
async def test_calculate_speaker_volumes_file_not_found(mic_matcher):
    """Test volume calculation with non-existent audio file."""
    speaker_segments = [{"speaker": "A", "start": 0.0, "end": 10.0}]
    speakers = ["A"]

    volumes = await mic_matcher._calculate_speaker_volumes(
        speaker_segments, speakers, "/tmp/nonexistent.wav"
    )

    # Should return default volumes (1.0) on error
    assert volumes["A"] == 1.0


@pytest.mark.asyncio
async def test_refine_with_volume_analysis(mic_matcher, mock_mic_audio_file):
    """Test volume analysis refinement of speaker identification."""
    speaker_segments = [
        {"speaker": "A", "start": 0.0, "end": 12.0},
        {"speaker": "B", "start": 12.0, "end": 22.0},
        {"speaker": "A", "start": 22.0, "end": 45.0},
        {"speaker": "B", "start": 45.0, "end": 50.0},
    ]

    speaker_overlaps = {
        "A": 25.0,  # 25 seconds overlap
        "B": 12.0,  # 12 seconds overlap
    }

    significant_speakers = ["A", "B"]
    total_vad_duration = 37.0

    user_speaker, confidence = await mic_matcher._refine_with_volume_analysis(
        speaker_segments,
        speaker_overlaps,
        significant_speakers,
        str(mock_mic_audio_file),
        total_vad_duration,
    )

    # Should identify Speaker A (louder and more overlap)
    assert user_speaker == "A"

    # Confidence should be reasonable
    assert confidence > 0.5
    assert confidence <= 1.0


@pytest.mark.asyncio
async def test_refine_with_volume_analysis_no_volume_dominance(
    mic_matcher, mock_mic_audio_file
):
    """Test volume analysis when user is not significantly louder."""
    # Create segments where speaker volumes are similar
    speaker_segments = [
        {"speaker": "A", "start": 0.0, "end": 25.0},
        {"speaker": "B", "start": 25.0, "end": 50.0},
    ]

    speaker_overlaps = {
        "A": 20.0,
        "B": 20.0,
    }

    significant_speakers = ["A", "B"]
    total_vad_duration = 40.0

    user_speaker, confidence = await mic_matcher._refine_with_volume_analysis(
        speaker_segments,
        speaker_overlaps,
        significant_speakers,
        str(mock_mic_audio_file),
        total_vad_duration,
    )

    # Should still identify a speaker
    assert user_speaker in ["A", "B"]

    # Confidence should be moderate or low (not significantly louder)
    assert confidence >= 0.0
    assert confidence <= 1.0
