"""
Unit tests for VAD (Voice Activity Detection) service.

Tests speech detection in microphone audio using webrtcvad.
"""

import pytest
import numpy as np
import soundfile as sf
from pathlib import Path
import tempfile
from unittest.mock import patch, MagicMock

from app.services.audio.vad_service import VADService


@pytest.fixture
def vad_service():
    """Create VADService instance with default settings."""
    return VADService(aggressiveness=2)


@pytest.fixture
def speech_audio_file():
    """
    Create a temporary audio file simulating speech.

    Generates 16kHz mono WAV with alternating loud (speech) and quiet (silence) segments.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

        sample_rate = 16000
        duration = 10  # 10 seconds total

        # Create audio with alternating speech and silence
        t = np.linspace(0, duration, int(sample_rate * duration))

        # Speech: 440Hz sine wave with amplitude 0.5
        # Silence: low amplitude noise
        audio_data = np.zeros_like(t, dtype=np.float32)

        # Speech segments: 0-2s, 4-6s, 8-10s (6 seconds total speech)
        for start, end in [(0, 2), (4, 6), (8, 10)]:
            start_idx = int(start * sample_rate)
            end_idx = int(end * sample_rate)
            audio_data[start_idx:end_idx] = 0.5 * np.sin(
                2 * np.pi * 440 * t[start_idx:end_idx]
            )

        # Silence segments: 2-4s, 6-8s (low amplitude noise)
        for start, end in [(2, 4), (6, 8)]:
            start_idx = int(start * sample_rate)
            end_idx = int(end * sample_rate)
            audio_data[start_idx:end_idx] = 0.01 * np.random.randn(end_idx - start_idx)

        # Write to file
        sf.write(str(tmp_path), audio_data, sample_rate)

        yield tmp_path

        # Cleanup
        if tmp_path.exists():
            tmp_path.unlink()


@pytest.fixture
def silence_audio_file():
    """Create a temporary audio file with only silence (no speech)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

        sample_rate = 16000
        duration = 5  # 5 seconds of silence

        # Very low amplitude noise
        audio_data = 0.01 * np.random.randn(int(sample_rate * duration)).astype(
            np.float32
        )

        sf.write(str(tmp_path), audio_data, sample_rate)

        yield tmp_path

        if tmp_path.exists():
            tmp_path.unlink()


@pytest.fixture
def mp3_audio_file():
    """Create a temporary MP3 file (tests format conversion)."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

        sample_rate = 16000
        duration = 3  # 3 seconds

        # Speech: 440Hz sine wave
        t = np.linspace(0, duration, int(sample_rate * duration))
        audio_data = 0.5 * np.sin(2 * np.pi * 440 * t).astype(np.float32)

        sf.write(str(tmp_path), audio_data, sample_rate, format="MP3")

        yield tmp_path

        if tmp_path.exists():
            tmp_path.unlink()


@pytest.mark.asyncio
async def test_detect_speech_success(vad_service, speech_audio_file):
    """Test successful speech detection with simulated speech audio."""
    segments = await vad_service.detect_speech(str(speech_audio_file))

    # Should detect speech segments
    assert len(segments) > 0

    # Each segment should have start and end times
    for segment in segments:
        assert "start" in segment
        assert "end" in segment
        assert segment["end"] > segment["start"]

    # Total detected speech should be reasonable (not more than file duration)
    total_speech = sum(seg["end"] - seg["start"] for seg in segments)
    assert total_speech > 0
    assert total_speech <= 10  # File is 10 seconds


@pytest.mark.asyncio
async def test_detect_speech_filters_short_segments(vad_service, speech_audio_file):
    """Test that segments shorter than MIN_SPEECH_DURATION_SECONDS are filtered out."""
    segments = await vad_service.detect_speech(str(speech_audio_file))

    # All segments should be >= 0.5 seconds (MIN_SPEECH_DURATION_SECONDS)
    for segment in segments:
        duration = segment["end"] - segment["start"]
        assert duration >= 0.5


@pytest.mark.asyncio
async def test_detect_speech_no_speech_detected(vad_service, silence_audio_file):
    """Test with audio containing no speech (only silence)."""
    segments = await vad_service.detect_speech(str(silence_audio_file))

    # May return empty list or very short segments filtered out
    # Either way, total speech should be minimal
    total_speech = sum(seg["end"] - seg["start"] for seg in segments)
    assert total_speech < 1.0  # Less than 1 second


@pytest.mark.asyncio
async def test_detect_speech_file_not_found(vad_service):
    """Test that non-existent file raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        await vad_service.detect_speech("/tmp/nonexistent_audio.wav")


@pytest.mark.asyncio
async def test_detect_speech_mp3_format(vad_service, mp3_audio_file):
    """Test with MP3 file (should stream and process automatically)."""
    segments = await vad_service.detect_speech(str(mp3_audio_file))

    # Should successfully detect speech after conversion
    assert len(segments) > 0


@pytest.mark.asyncio
async def test_detect_speech_sentry_breadcrumbs(vad_service, speech_audio_file):
    """Test that Sentry breadcrumbs are added during processing."""
    with patch("app.services.audio.vad_service.sentry_sdk") as mock_sentry:
        segments = await vad_service.detect_speech(str(speech_audio_file))

        # Should return valid segments
        assert segments is not None

        # Should have called add_breadcrumb at least twice (start and end)
        assert mock_sentry.add_breadcrumb.call_count >= 2

        # Verify breadcrumb categories
        calls = mock_sentry.add_breadcrumb.call_args_list
        categories = [call.kwargs.get("category") for call in calls]
        assert "vad" in categories


@pytest.mark.asyncio
async def test_detect_speech_sentry_error_context(vad_service):
    """Test that Sentry error context is added on failure."""
    with patch("app.services.audio.vad_service.sentry_sdk") as mock_sentry:
        with pytest.raises(FileNotFoundError):
            await vad_service.detect_speech("/tmp/nonexistent.wav")

        # Should have added error breadcrumb
        mock_sentry.add_breadcrumb.assert_called()

        # Check for error context
        calls = mock_sentry.add_breadcrumb.call_args_list
        error_breadcrumbs = [
            call for call in calls if call.kwargs.get("level") == "error"
        ]
        assert len(error_breadcrumbs) > 0


@pytest.mark.asyncio
async def test_detect_speech_performance_span(vad_service, speech_audio_file):
    """Test that Sentry performance span is created."""
    with patch("app.services.audio.vad_service.sentry_sdk") as mock_sentry:
        mock_span = MagicMock()
        mock_sentry.start_span.return_value.__enter__.return_value = mock_span

        segments = await vad_service.detect_speech(str(speech_audio_file))

        # Should return valid segments
        assert segments is not None

        # Should create performance span
        mock_sentry.start_span.assert_called()

        # Span should have data set
        assert mock_span.set_data.call_count >= 3


def test_vad_service_initialization():
    """Test VADService initialization with different aggressiveness levels."""
    # Default aggressiveness (2)
    vad1 = VADService()
    assert vad1.vad is not None

    # Least aggressive (0)
    vad2 = VADService(aggressiveness=0)
    assert vad2.vad is not None

    # Most aggressive (3)
    vad3 = VADService(aggressiveness=3)
    assert vad3.vad is not None

    # Invalid aggressiveness should raise error from webrtcvad
    with pytest.raises(Exception):
        VADService(aggressiveness=5)
