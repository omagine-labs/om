"""
Speaker identification via microphone audio matching with volume analysis.

Matches Voice Activity Detection (VAD) timestamps to AssemblyAI speaker segments
to identify which speaker is the authenticated user. Handles shared microphone scenarios.
"""

import logging
from typing import List, Dict
from pathlib import Path
import numpy as np
import soundfile as sf
import sentry_sdk

logger = logging.getLogger(__name__)

# Configuration constants
SHARED_MIC_THRESHOLD = 0.30  # 30% overlap threshold for shared mic detection
MIN_CONFIDENCE_THRESHOLD = 0.60  # Minimum confidence to auto-identify
VOLUME_WEIGHT_POWER = 0.5  # Power factor for volume-based reweighting
TIMING_TOLERANCE_SECONDS = 0.15  # 150ms tolerance for timestamp misalignment


class MicMatcher:
    """
    Matches microphone VAD timestamps to speaker segments to identify the user.
    """

    async def identify_user_speaker(
        self,
        vad_timestamps: List[Dict[str, float]],
        speaker_segments: List[Dict],
        mic_audio_path: str,
    ) -> Dict:
        """
        Identify which speaker is the user based on microphone activity.

        Args:
            vad_timestamps: Speech timestamps from VAD
                           [{" start": 0.5, "end": 3.2}, ...]
            speaker_segments: Speaker segments from AssemblyAI
                             [{" speaker": "A", "start": 0.0, "end": 5.0, "text": "..."}, ...]
            mic_audio_path: Path to microphone-only audio for volume analysis

        Returns:
            {
                "user_speaker": "Speaker A",
                "confidence": 0.85,
                "shared_mic_detected": False,
                "alternative_speakers": [],
                "meets_threshold": True,  # True if confidence >= MIN_CONFIDENCE_THRESHOLD
                "speaker_confidences": {"Speaker A": 0.85, "Speaker B": 0.15}  # Per-speaker
            }

        Raises:
            ValueError: If no mic audio detected (empty vad_timestamps)
        """
        if not vad_timestamps:
            sentry_sdk.add_breadcrumb(
                category="speaker_matching",
                message="No VAD timestamps provided - cannot identify user",
                level="error",
            )
            raise ValueError(
                "No microphone audio detected - cannot automatically identify user. "
                "Please identify yourself manually."
            )

        num_speakers = len(set(seg["speaker"] for seg in speaker_segments))
        logger.info(
            f"Matching {len(vad_timestamps)} VAD segments to {num_speakers} speakers"
        )

        sentry_sdk.add_breadcrumb(
            category="speaker_matching",
            message="Starting speaker identification",
            level="info",
            data={
                "vad_segments": len(vad_timestamps),
                "speaker_count": num_speakers,
                "total_vad_duration": sum(
                    ts["end"] - ts["start"] for ts in vad_timestamps
                ),
            },
        )

        # Calculate overlap between VAD and each speaker
        speaker_overlaps = {}
        for segment in speaker_segments:
            speaker = segment["speaker"]
            overlap = self._calculate_overlap(vad_timestamps, segment)
            speaker_overlaps[speaker] = speaker_overlaps.get(speaker, 0.0) + overlap

        if not speaker_overlaps:
            raise ValueError(
                "No speaker overlap with microphone audio - cannot identify user"
            )

        # Calculate total VAD duration
        total_vad_duration = sum(ts["end"] - ts["start"] for ts in vad_timestamps)

        # Calculate per-speaker confidence (overlap percentage)
        speaker_confidences = {
            spk: overlap / total_vad_duration if total_vad_duration > 0 else 0.0
            for spk, overlap in speaker_overlaps.items()
        }

        # Add diagnostic logging to Sentry for monitoring
        sentry_sdk.set_context(
            "speaker_identification_details",
            {
                "speaker_overlaps_seconds": speaker_overlaps,
                "speaker_confidences": speaker_confidences,
                "total_vad_duration": total_vad_duration,
                "num_vad_segments": len(vad_timestamps),
            },
        )

        # Find dominant speaker (most overlap)
        user_speaker = max(speaker_overlaps, key=speaker_overlaps.get)

        # Calculate raw confidence
        raw_confidence = (
            speaker_overlaps[user_speaker] / total_vad_duration
            if total_vad_duration > 0
            else 0.0
        )

        # Detect shared microphone scenario
        significant_speakers = [
            spk
            for spk, overlap in speaker_overlaps.items()
            if overlap > SHARED_MIC_THRESHOLD * total_vad_duration
        ]

        shared_mic_detected = len(significant_speakers) > 1

        logger.info(
            f"Initial identification: {user_speaker} "
            f"(confidence: {raw_confidence:.2f}, "
            f"shared_mic: {shared_mic_detected})"
        )

        sentry_sdk.add_breadcrumb(
            category="speaker_matching",
            message=f"Initial identification: {user_speaker}",
            level="info",
            data={
                "user_speaker": user_speaker,
                "raw_confidence": raw_confidence,
                "shared_mic_detected": shared_mic_detected,
                "significant_speakers_count": len(significant_speakers),
            },
        )

        # If shared mic detected, use volume analysis to refine
        confidence = raw_confidence
        if shared_mic_detected:
            logger.info("Shared mic detected - applying volume analysis")
            sentry_sdk.add_breadcrumb(
                category="speaker_matching",
                message="Shared mic detected - applying volume analysis",
                level="warning",
                data={"significant_speakers": significant_speakers},
            )
            user_speaker, confidence = await self._refine_with_volume_analysis(
                speaker_segments,
                speaker_overlaps,
                significant_speakers,
                mic_audio_path,
                total_vad_duration,
            )

        # Check if confidence meets threshold
        meets_threshold = confidence >= MIN_CONFIDENCE_THRESHOLD

        if not meets_threshold:
            sentry_sdk.add_breadcrumb(
                category="speaker_matching",
                message=f"Confidence below threshold: {confidence:.2f} < {MIN_CONFIDENCE_THRESHOLD:.2f}",
                level="warning",
            )
            logger.warning(
                f"User identification confidence too low: {confidence:.2f} < {MIN_CONFIDENCE_THRESHOLD:.2f} "
                "- will save result but not auto-assign"
            )
        else:
            logger.info(
                f"Final identification: {user_speaker} (confidence: {confidence:.2f})"
            )

        # Log identification result to Sentry
        sentry_sdk.add_breadcrumb(
            category="speaker_matching",
            message=f"Identified user: {user_speaker} (meets_threshold: {meets_threshold})",
            level="info",
            data={
                "user_speaker": user_speaker,
                "final_confidence": confidence,
                "shared_mic_detected": shared_mic_detected,
                "meets_threshold": meets_threshold,
                "alternative_speakers_count": (
                    len([s for s in significant_speakers if s != user_speaker])
                    if shared_mic_detected
                    else 0
                ),
            },
        )

        return {
            "user_speaker": user_speaker,
            "confidence": confidence,
            "shared_mic_detected": shared_mic_detected,
            "alternative_speakers": (
                [s for s in significant_speakers if s != user_speaker]
                if shared_mic_detected
                else []
            ),
            "meets_threshold": meets_threshold,
            "speaker_confidences": speaker_confidences,
        }

    def _calculate_overlap(
        self, vad_timestamps: List[Dict[str, float]], speaker_segment: Dict
    ) -> float:
        """
        Calculate time overlap between VAD timestamps and a speaker segment.

        Uses TIMING_TOLERANCE_SECONDS to expand speaker segment boundaries,
        accounting for timing misalignment between VAD and diarization.

        Args:
            vad_timestamps: List of VAD segments with start/end times
            speaker_segment: Speaker segment with start/end times

        Returns:
            Total overlap duration in seconds
        """
        # Expand speaker segment boundaries by tolerance to account for
        # timing misalignment between VAD (30ms frames) and diarization
        speaker_start = max(0, speaker_segment["start"] - TIMING_TOLERANCE_SECONDS)
        speaker_end = speaker_segment["end"] + TIMING_TOLERANCE_SECONDS
        overlap = 0.0

        for vad in vad_timestamps:
            vad_start = vad["start"]
            vad_end = vad["end"]

            # Calculate intersection
            intersection_start = max(speaker_start, vad_start)
            intersection_end = min(speaker_end, vad_end)

            if intersection_start < intersection_end:
                overlap += intersection_end - intersection_start

        return overlap

    async def _refine_with_volume_analysis(
        self,
        speaker_segments: List[Dict],
        speaker_overlaps: Dict[str, float],
        significant_speakers: List[str],
        mic_audio_path: str,
        total_vad_duration: float,
    ) -> tuple[str, float]:
        """
        Refine speaker identification using volume analysis.

        User is typically louder on their own microphone (closer to mic).

        Args:
            speaker_segments: All speaker segments from AssemblyAI
            speaker_overlaps: Time overlap for each speaker
            significant_speakers: Speakers with significant mic overlap
            mic_audio_path: Path to microphone audio file
            total_vad_duration: Total VAD speech duration

        Returns:
            Tuple of (user_speaker, confidence)
        """
        # Calculate average volume for each significant speaker
        speaker_volumes = await self._calculate_speaker_volumes(
            speaker_segments, significant_speakers, mic_audio_path
        )

        # Re-weight scores by volume (higher volume = more likely user)
        weighted_scores = {}
        for speaker in significant_speakers:
            overlap_score = speaker_overlaps[speaker]
            volume_factor = speaker_volumes.get(speaker, 1.0)

            # Apply volume weighting: score * (volume^power)
            # Power < 1 to avoid over-weighting by volume
            weighted_scores[speaker] = overlap_score * (
                volume_factor**VOLUME_WEIGHT_POWER
            )

        # Find speaker with highest weighted score
        user_speaker = max(weighted_scores, key=weighted_scores.get)

        # Calculate adjusted confidence
        # If user is significantly louder, increase confidence
        max_volume = max(speaker_volumes.values()) if speaker_volumes else 1.0
        user_volume = speaker_volumes.get(user_speaker, 1.0)
        volume_ratio = user_volume / max_volume if max_volume > 0 else 1.0

        # Base confidence from weighted overlap
        base_confidence = (
            weighted_scores[user_speaker] / sum(weighted_scores.values())
            if sum(weighted_scores.values()) > 0
            else 0.0
        )

        # Adjust confidence based on volume dominance
        # If volume_ratio < 1.1, user not significantly louder - reduce confidence
        if volume_ratio < 1.1:
            confidence = base_confidence * 0.8
            logger.warning(
                f"User not significantly louder (ratio: {volume_ratio:.2f}) - "
                f"reducing confidence to {confidence:.2f}"
            )
        else:
            confidence = base_confidence

        logger.info(
            f"Volume analysis: {user_speaker} selected "
            f"(volume_ratio: {volume_ratio:.2f}, confidence: {confidence:.2f})"
        )

        return user_speaker, confidence

    async def _calculate_speaker_volumes(
        self,
        speaker_segments: List[Dict],
        speakers: List[str],
        mic_audio_path: str,
    ) -> Dict[str, float]:
        """
        Calculate average volume (RMS amplitude) for each speaker on mic track.

        Uses streaming RMS calculation to avoid loading entire audio into memory.
        For each speaker, calculates RMS by accumulating sum of squares incrementally.

        Args:
            speaker_segments: All speaker segments
            speakers: List of speakers to analyze
            mic_audio_path: Path to microphone audio file

        Returns:
            Dictionary mapping speaker to average RMS volume
        """
        mic_path = Path(mic_audio_path)

        if not mic_path.exists():
            logger.warning(f"Mic audio file not found: {mic_audio_path}")
            return {speaker: 1.0 for speaker in speakers}

        try:
            # Get audio file info without loading it
            info = sf.info(str(mic_path))
            sample_rate = info.samplerate
            total_frames = info.frames
            channels = info.channels

            logger.info(
                f"Volume analysis: {total_frames} frames, {sample_rate}Hz, "
                f"{channels} channels, {total_frames / sample_rate:.1f}s duration"
            )

            # Pre-calculate sample ranges for each speaker (avoid repeated iteration)
            speaker_ranges = {}
            for speaker in speakers:
                ranges = []
                for seg in speaker_segments:
                    if seg["speaker"] == speaker:
                        start_sample = max(0, int(seg["start"] * sample_rate))
                        end_sample = min(total_frames, int(seg["end"] * sample_rate))
                        if start_sample < end_sample:
                            ranges.append((start_sample, end_sample))
                speaker_ranges[speaker] = ranges

            # Calculate RMS for each speaker using streaming approach
            # Read audio in chunks and accumulate sum of squares
            speaker_volumes = {}
            CHUNK_SIZE = 1024 * 1024  # 1M samples per chunk (~23 seconds at 44.1kHz)

            for speaker in speakers:
                ranges = speaker_ranges[speaker]
                if not ranges:
                    speaker_volumes[speaker] = 1.0
                    continue

                # Streaming RMS: accumulate sum of squares and count
                sum_squares = 0.0
                total_samples = 0

                # Sort ranges by start time for sequential reading
                ranges.sort(key=lambda r: r[0])

                with sf.SoundFile(str(mic_path)) as audio_file:
                    for start_sample, end_sample in ranges:
                        # Seek to start of this segment
                        audio_file.seek(start_sample)
                        samples_to_read = end_sample - start_sample

                        # Read in chunks to limit memory usage
                        while samples_to_read > 0:
                            chunk_size = min(CHUNK_SIZE, samples_to_read)
                            chunk = audio_file.read(chunk_size, dtype="float32")

                            if len(chunk) == 0:
                                break

                            # Convert to mono if stereo
                            if len(chunk.shape) > 1:
                                chunk = np.mean(chunk, axis=1)

                            # Accumulate sum of squares
                            sum_squares += np.sum(np.square(chunk))
                            total_samples += len(chunk)
                            samples_to_read -= len(chunk)

                # Calculate RMS from accumulated values
                if total_samples > 0:
                    rms = np.sqrt(sum_squares / total_samples)
                    speaker_volumes[speaker] = float(rms)
                else:
                    speaker_volumes[speaker] = 1.0

            # Normalize volumes (relative to quietest speaker)
            if speaker_volumes:
                min_volume = min(speaker_volumes.values())
                if min_volume > 0:
                    speaker_volumes = {
                        speaker: vol / min_volume
                        for speaker, vol in speaker_volumes.items()
                    }

            logger.info(f"Speaker volumes: {speaker_volumes}")

            return speaker_volumes

        except Exception as e:
            logger.error(f"Volume analysis failed: {str(e)}")
            sentry_sdk.capture_exception(e)
            # Return uniform volumes if analysis fails
            return {speaker: 1.0 for speaker in speakers}
