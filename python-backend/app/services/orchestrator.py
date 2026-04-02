"""
Pipeline orchestrator for coordinating the processing workflow.
"""

import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta, UTC

import sentry_sdk

from app.config import settings
from app.services.supabase_client import (
    SupabaseClient,
    MIN_RECORDING_DURATION_SECONDS,
)
from app.services.ingestion.ingestion_orchestrator import IngestionOrchestrator
from app.services.analysis.analysis_orchestrator import AnalysisOrchestrator
from app.services.resend_client import ResendClient
from app.services.email_preview import generate_email_preview
from app.services.file_validator import (
    validate_file,
    validate_duration,
    validate_speech_content,
    FileValidationError,
)
from app.services.audio.vad_service import VADService
from app.services.speaker_identification.mic_matcher import MicMatcher

logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    """Orchestrates the complete processing pipeline."""

    def __init__(self):
        """Initialize the orchestrator with all required services."""
        self.supabase = SupabaseClient()
        self.ingestion = IngestionOrchestrator()
        self.analysis = AnalysisOrchestrator()
        self.resend = ResendClient()
        self.vad = VADService(aggressiveness=2)  # Balanced VAD mode
        self.mic_matcher = MicMatcher()

    async def _send_anonymous_notification(
        self,
        job_id: str,
        meeting_id: str,
        speaker_stats: dict,
        duration_seconds: int,
    ) -> None:
        """
        Send email notification for anonymous upload completion via Resend.

        Args:
            job_id: Job identifier for logging
            meeting_id: Meeting identifier
            speaker_stats: Speaker analysis results
            duration_seconds: Meeting duration in seconds

        Note:
            Failures are logged but do not raise exceptions (graceful degradation)
        """
        try:
            logger.info(f"[Job {job_id}] Sending email notification via Resend")

            # Get the email and access_token for this anonymous upload
            upload_details = await self.supabase.get_anonymous_upload_details(
                meeting_id
            )

            if upload_details and upload_details.get("email"):
                email = upload_details["email"]
                access_token = upload_details.get("access_token")

                # Build signup URL with email and meeting_id
                signup_url = (
                    f"{settings.frontend_url}/signup?"
                    f"email={email}&meeting_id={meeting_id}"
                )

                # Generate full HTML email using existing email_preview.py
                html_body = generate_email_preview(
                    meeting_id=meeting_id,
                    duration_seconds=duration_seconds,
                    speaker_stats=speaker_stats,
                    signup_url=signup_url,
                    access_token=access_token,
                )

                # Send via Resend
                result = await self.resend.send_anonymous_upload_complete(
                    email=email,
                    html_body=html_body,
                )

                status = result.get("status")
                if status == "success":
                    logger.info(
                        f"[Job {job_id}] Email sent successfully to {email} "
                        f"(ID: {result.get('email_id')})"
                    )
                    # Mark email as sent in database
                    await self.supabase.update_anonymous_upload_email_status(
                        meeting_id, "sent"
                    )
                elif status == "development":
                    logger.info(
                        f"[Job {job_id}] Email saved to file (development mode): "
                        f"{result.get('file_path')}"
                    )
                    # Mark email as sent even in development mode
                    await self.supabase.update_anonymous_upload_email_status(
                        meeting_id, "sent"
                    )
                else:
                    logger.warning(
                        f"[Job {job_id}] Email sending failed: {result.get('error')}"
                    )
                    # Mark email as failed
                    await self.supabase.update_anonymous_upload_email_status(
                        meeting_id, "failed"
                    )
            else:
                logger.warning(
                    f"[Job {job_id}] No email found for anonymous upload "
                    f"(meeting: {meeting_id})"
                )
        except Exception as e:
            # Don't fail the job if email notification fails
            logger.error(
                f"[Job {job_id}] Failed to send email notification: {str(e)}",
                exc_info=True,
            )
            sys.stdout.flush()

    async def _send_anonymous_error_email(
        self,
        job_id: str,
        meeting_id: str,
        error_message: str,
        email: str,
    ) -> None:
        """
        Send error notification email for failed anonymous upload processing.

        Args:
            job_id: Job identifier for logging
            meeting_id: Meeting identifier
            error_message: User-friendly error message
            email: Email address to send notification to

        Note:
            Failures are logged but do not raise exceptions (graceful degradation)
        """
        try:
            logger.info(
                f"[Job {job_id}] Sending error email notification to {email} via Resend"
            )

            if email:
                # Load error email template
                template_path = (
                    Path(__file__).parent.parent / "templates" / "error_email.html"
                )
                with open(template_path, "r") as f:
                    html_template = f.read()

                # Replace placeholders
                html_body = html_template.format(
                    error_message=error_message,
                    email=email,
                    frontend_url=settings.frontend_url,
                )

                # Send via Resend
                result = await self.resend.send_html_email(
                    to_email=email,
                    subject="⚠️ We Couldn't Process Your Recording",
                    html_body=html_body,
                )

                status = result.get("status")
                if status == "success":
                    logger.info(
                        f"[Job {job_id}] Error email sent successfully to {email} "
                        f"(ID: {result.get('email_id')})"
                    )
                    # Mark email as sent in database
                    await self.supabase.update_anonymous_upload_email_status(
                        meeting_id, "error_sent"
                    )
                elif status == "development":
                    logger.info(
                        f"[Job {job_id}] Error email saved to file (development mode): "
                        f"{result.get('file_path')}"
                    )
                    await self.supabase.update_anonymous_upload_email_status(
                        meeting_id, "error_sent"
                    )
                else:
                    logger.warning(
                        f"[Job {job_id}] Error email sending failed: {result.get('error')}"
                    )
            else:
                logger.warning(
                    f"[Job {job_id}] No email found for anonymous upload "
                    f"(meeting: {meeting_id})"
                )
        except Exception as e:
            # Don't fail the job if error email notification fails
            logger.error(
                f"[Job {job_id}] Failed to send error email notification: {str(e)}",
                exc_info=True,
            )
            sys.stdout.flush()

    async def _identify_user_speaker(
        self,
        job_id: str,
        meeting_id: str,
        transcription_result: dict,
        user_id: str,
    ) -> dict | None:
        """
        Identify the user speaker using VAD and microphone audio matching.

        Args:
            job_id: The job identifier
            meeting_id: The meeting identifier
            transcription_result: Transcription result from AssemblyAI
            user_id: The user identifier

        Returns:
            User identification result or None if mic audio not available:
            {
                "user_speaker": "Speaker A",
                "confidence": 0.85,
                "shared_mic_detected": False,
                "alternative_speakers": [],
                "meets_threshold": True  # True if confidence >= 60%
            }
        """
        try:
            # Get meeting record to check for mic audio path
            meeting = await self.supabase.get_meeting(meeting_id)
            mic_audio_path = meeting.get("mic_audio_path")

            if not mic_audio_path:
                logger.info(
                    f"[Job {job_id}] No mic audio path - skipping automatic user identification"
                )
                return None

            logger.info(
                f"[Job {job_id}] Starting automatic user identification via VAD"
            )

            # Download mic audio from storage directly to temp file (streaming)
            import tempfile

            # Create temp file first
            with tempfile.NamedTemporaryFile(
                suffix=".mp3", delete=False
            ) as temp_mic_file:
                temp_mic_path = Path(temp_mic_file.name)

            # Stream download directly to disk (memory-efficient)
            await self.supabase.download_file(
                bucket="recordings",
                path=mic_audio_path,
                destination=temp_mic_path,
            )

            try:
                # Run VAD on mic audio
                logger.info(f"[Job {job_id}] Running VAD on microphone audio")
                vad_timestamps = await self.vad.detect_speech(str(temp_mic_path))
                logger.info(
                    f"[Job {job_id}] VAD detected {len(vad_timestamps)} speech segments"
                )

                # Get speaker segments from transcription
                speaker_segments = transcription_result.get("segments", [])

                # Identify user speaker by matching VAD to speakers
                logger.info(f"[Job {job_id}] Matching VAD timestamps to speakers")
                user_identification = await self.mic_matcher.identify_user_speaker(
                    vad_timestamps, speaker_segments, str(temp_mic_path)
                )

                meets_threshold = user_identification.get("meets_threshold", True)
                logger.info(
                    f"[Job {job_id}] User identified as {user_identification['user_speaker']} "
                    f"(confidence: {user_identification['confidence']:.2f}, "
                    f"meets_threshold: {meets_threshold})"
                )

                # Save user identification to database
                await self.supabase.update_meeting_user_speaker(
                    meeting_id,
                    user_identification["user_speaker"],
                    user_identification["confidence"],
                    user_identification["shared_mic_detected"],
                    user_identification.get("alternative_speakers", []),
                )

                return user_identification

            finally:
                # Clean up temp mic file
                if temp_mic_path.exists():
                    temp_mic_path.unlink()

        except ValueError as e:
            # Expected errors (no mic audio, low confidence, etc.)
            logger.warning(
                f"[Job {job_id}] User identification failed: {str(e)} - "
                "will analyze all speakers"
            )
            return None
        except Exception as e:
            # Unexpected errors - log but don't fail the job
            logger.error(
                f"[Job {job_id}] Unexpected error during user identification: {str(e)}",
                exc_info=True,
            )
            sentry_sdk.capture_exception(e)
            return None

    def _get_auto_assigned_user_id(
        self,
        user_id: str,
        speaker_label: str,
        user_identification: dict | None,
        is_anonymous: bool,
        is_single_speaker: bool = False,
    ) -> str | None:
        """
        Determine if a speaker should be auto-assigned to the user.

        Returns user_id if:
        - Not an anonymous upload AND one of:
          - Backend identified this speaker as the user with sufficient confidence
          - It's a single-speaker recording (user is the only speaker)

        Args:
            user_id: The user identifier
            speaker_label: The speaker label (e.g., "Speaker A")
            user_identification: Result from _identify_user_speaker(), or None
            is_anonymous: Whether this is an anonymous upload
            is_single_speaker: Whether this is a single-speaker recording

        Returns:
            user_id if auto-assignment should occur, None otherwise
        """
        # No auto-assignment for anonymous uploads
        if is_anonymous:
            return None

        # For single-speaker recordings, auto-assign to the user
        # (they're the only one talking, so it must be them)
        if is_single_speaker:
            return user_id

        # No auto-assignment if user identification didn't run or failed
        if user_identification is None:
            return None

        # Only auto-assign to the identified user speaker
        if speaker_label != user_identification["user_speaker"]:
            return None

        # Check confidence threshold (60% for single mic, 85% for shared mic)
        confidence = user_identification["confidence"]
        shared_mic = user_identification.get("shared_mic_detected", False)
        threshold = 0.85 if shared_mic else 0.6

        if confidence >= threshold:
            return user_id

        return None

    async def execute(
        self,
        job_id: str,
        meeting_id: str,
        user_id: str,
        storage_path: str,
        temp_file: Path,
        is_priority: bool = False,
        is_anonymous: bool = False,
    ) -> None:
        """
        Execute the complete processing pipeline.

        Args:
            job_id: The job identifier
            meeting_id: The meeting identifier (links to meetings table)
            user_id: The user identifier
            storage_path: Path in Supabase Storage (e.g., "user_id/2025/10/job_id.mp4")
            temp_file: Path where the file should be saved
            is_priority: Whether this is a high-priority job (faster processing)
            is_anonymous: Whether this is an anonymous upload (skip video processing)

        Raises:
            Exception: If any step in the pipeline fails
        """
        try:
            # Set Sentry context for this job (helps with error grouping and debugging)
            try:
                sentry_sdk.set_tag("job_id", job_id)
                sentry_sdk.set_tag("meeting_id", meeting_id)
                sentry_sdk.set_tag("user_id", user_id)
                sentry_sdk.set_tag("is_anonymous", str(is_anonymous))
                sentry_sdk.set_tag("is_priority", str(is_priority))
                sentry_sdk.set_context(
                    "processing_job",
                    {
                        "job_id": job_id,
                        "meeting_id": meeting_id,
                        "user_id": user_id,
                        "storage_path": storage_path,
                        "is_anonymous": is_anonymous,
                        "is_priority": is_priority,
                    },
                )
            except Exception as sentry_error:
                # Sentry not initialized or error setting context - log but continue
                logger.warning(
                    f"[Job {job_id}] Failed to set Sentry context: {sentry_error}"
                )

            logger.info(f"[Job {job_id}] Processing recording for meeting {meeting_id}")

            # Structured log: Processing started
            sentry_sdk.set_context(
                "processing_job",
                {
                    "job_id": job_id,
                    "meeting_id": meeting_id,
                    "user_id": user_id,
                    "storage_path": storage_path,
                    "component": "python-backend",
                    "stage": "start",
                    "is_anonymous": is_anonymous,
                    "is_priority": is_priority,
                },
            )
            sentry_sdk.set_tag("job_id", job_id)
            sentry_sdk.set_tag("meeting_id", meeting_id)
            sentry_sdk.set_tag("component", "python-backend")
            sentry_sdk.set_tag("stage", "start")
            logger.info("Processing job started")

            # Step 1: Download file from Supabase Storage
            sentry_sdk.add_breadcrumb(
                category="processing",
                message="Downloading file from storage",
                level="info",
                data={"storage_path": storage_path},
            )
            logger.info(f"[Job {job_id}] Downloading file from storage: {storage_path}")
            # Use anonymous-recordings bucket for anonymous uploads
            bucket = "anonymous-recordings" if is_anonymous else "recordings"
            file_content = await self.supabase.download_from_storage(
                storage_path, bucket=bucket
            )

            # Write to temp file
            temp_file.write_bytes(file_content)

            file_size_mb = temp_file.stat().st_size / (1024 * 1024)
            logger.info(f"[Job {job_id}] Downloaded {file_size_mb:.2f} MB")
            sentry_sdk.set_context("file_info", {"file_size_mb": file_size_mb})

            # Step 1.5: Validate file (magic numbers, size, format)
            try:
                validate_file(temp_file)
                logger.info(f"[Job {job_id}] ✓ File validation passed")
            except FileValidationError as e:
                logger.error(
                    f"[Job {job_id}] File validation failed: {str(e)}",
                    exc_info=True,
                )
                sys.stdout.flush()

                # For anonymous uploads, send error email and cleanup
                if is_anonymous:
                    # Get email before attempting to send
                    email_to_notify = await self.supabase.get_anonymous_upload_email(
                        meeting_id
                    )
                    if email_to_notify:
                        await self._send_anonymous_error_email(
                            job_id, meeting_id, e.user_friendly_message, email_to_notify
                        )
                    # Delete meeting and storage file
                    await self.supabase.delete_meeting(meeting_id, storage_path)

                # Re-raise with user-friendly message
                raise ValueError(e.user_friendly_message)

            # Step 2: Process file (extract audio if needed, then transcribe)
            sentry_sdk.add_breadcrumb(
                category="processing",
                message="Starting transcription/ingestion",
                level="info",
            )
            # Skip video processing for anonymous uploads to speed up processing
            # Use faster polling for priority jobs
            transcription_result = await self.ingestion.ingest(
                job_id,
                temp_file,
                skip_video_processing=is_anonymous,
                is_priority=is_priority,
            )
            sentry_sdk.add_breadcrumb(
                category="processing",
                message="Transcription completed",
                level="info",
                data={"segments_count": len(transcription_result.get("segments", []))},
            )

            # Step 2.5: Validate speech content
            try:
                validate_speech_content(transcription_result.get("segments", []))
                logger.info(f"[Job {job_id}] ✓ Speech validation passed")
            except FileValidationError as e:
                logger.error(
                    f"[Job {job_id}] Speech validation failed: {str(e)}",
                    exc_info=True,
                )
                sys.stdout.flush()

                # Delete the meeting when no speech is detected
                logger.info(f"[Job {job_id}] No speech detected. Deleting meeting.")

                # Get email BEFORE deleting (cascade delete removes anonymous_uploads)
                email_to_notify = None
                if is_anonymous:
                    email_to_notify = await self.supabase.get_anonymous_upload_email(
                        meeting_id
                    )

                # Delete the meeting
                await self.supabase.delete_meeting(meeting_id, storage_path)

                # Send error email after deletion
                if is_anonymous and email_to_notify:
                    await self._send_anonymous_error_email(
                        job_id, meeting_id, e.user_friendly_message, email_to_notify
                    )

                raise ValueError(e.user_friendly_message)

            # Step 2.6: Validate duration
            duration_seconds = transcription_result.get("duration", 0)
            try:
                validate_duration(
                    int(duration_seconds),
                    min_duration=MIN_RECORDING_DURATION_SECONDS,
                    max_duration=7200,  # 2 hours
                )
                logger.info(f"[Job {job_id}] ✓ Duration validation passed")
            except FileValidationError as e:
                logger.error(
                    f"[Job {job_id}] Duration validation failed: {str(e)}",
                    exc_info=True,
                )
                sys.stdout.flush()

                # Delete the meeting when duration is invalid
                logger.warning(
                    f"[Job {job_id}] Recording duration ({duration_seconds}s) invalid. Deleting meeting."
                )

                # Get email BEFORE deleting (cascade delete removes anonymous_uploads)
                email_to_notify = None
                if is_anonymous:
                    email_to_notify = await self.supabase.get_anonymous_upload_email(
                        meeting_id
                    )

                await self.supabase.delete_meeting(meeting_id, storage_path)

                # Send error email after deletion
                if is_anonymous and email_to_notify:
                    await self._send_anonymous_error_email(
                        job_id, meeting_id, e.user_friendly_message, email_to_notify
                    )
                raise ValueError(e.user_friendly_message)

            # Step 2.7: Filter out off-record placeholder segments BEFORE saving to database
            off_record_periods = await self.supabase.get_off_record_periods(meeting_id)
            if off_record_periods:
                logger.info(
                    f"[Job {job_id}] Found {len(off_record_periods)} off-record period(s), filtering transcript"
                )

                # Filter/split segments to exclude off-record placeholder content
                original_segments = transcription_result.get("segments", [])
                filtered_segments = []

                for segment in original_segments:
                    segment_start = segment.get("start", 0)
                    segment_end = segment.get("end", 0)

                    # Check each off-record period
                    segment_parts = [(segment_start, segment_end, segment)]

                    for period in off_record_periods:
                        placeholder_start = period.get("placeholderStart", 0)
                        placeholder_end = period.get("placeholderEnd", 0)

                        new_parts = []
                        for part_start, part_end, part_segment in segment_parts:
                            # Case 1: Segment entirely before off-record period
                            if part_end <= placeholder_start:
                                new_parts.append((part_start, part_end, part_segment))

                            # Case 2: Segment entirely after off-record period
                            elif part_start >= placeholder_end:
                                new_parts.append((part_start, part_end, part_segment))

                            # Case 3: Segment entirely within off-record period - skip it
                            elif (
                                part_start >= placeholder_start
                                and part_end <= placeholder_end
                            ):
                                continue  # Skip this segment

                            # Case 4: Segment spans across off-record period - split it
                            elif (
                                part_start < placeholder_start
                                and part_end > placeholder_end
                            ):
                                # Keep before part
                                before_segment = part_segment.copy()
                                before_segment["end"] = placeholder_start
                                new_parts.append(
                                    (part_start, placeholder_start, before_segment)
                                )

                                # Keep after part
                                after_segment = part_segment.copy()
                                after_segment["start"] = placeholder_end
                                new_parts.append(
                                    (placeholder_end, part_end, after_segment)
                                )

                            # Case 5: Segment starts before and ends during off-record
                            elif (
                                part_start < placeholder_start
                                and part_end > placeholder_start
                            ):
                                trimmed_segment = part_segment.copy()
                                trimmed_segment["end"] = placeholder_start
                                new_parts.append(
                                    (part_start, placeholder_start, trimmed_segment)
                                )

                            # Case 6: Segment starts during off-record and ends after
                            elif (
                                part_start < placeholder_end
                                and part_end > placeholder_end
                            ):
                                trimmed_segment = part_segment.copy()
                                trimmed_segment["start"] = placeholder_end
                                new_parts.append(
                                    (placeholder_end, part_end, trimmed_segment)
                                )

                        segment_parts = new_parts

                    # Add all valid parts to filtered segments
                    for _, _, part_segment in segment_parts:
                        filtered_segments.append(part_segment)

                # Update transcription result with filtered segments
                segments_kept = len(filtered_segments)
                segments_original = len(original_segments)
                logger.info(
                    f"[Job {job_id}] Processed off-record filtering: "
                    f"{segments_original} original → {segments_kept} kept/split"
                )
                transcription_result["segments"] = filtered_segments
                sys.stdout.flush()

            # Step 2.8: Update meeting metadata
            await self.supabase.update_meeting_metadata(
                meeting_id=meeting_id,
                file_size_mb=file_size_mb,
                duration_seconds=int(duration_seconds),
            )
            logger.info(f"[Job {job_id}] Meeting metadata updated")
            sys.stdout.flush()

            # Step 2.9: Save transcript to dedicated transcripts table
            await self.supabase.save_transcript(
                meeting_id=meeting_id,
                transcription_result=transcription_result,
            )
            logger.info(f"[Job {job_id}] Transcript saved to transcripts table")
            sys.stdout.flush()

            # Step 2.8: Identify user speaker via VAD (Voice Activity Detection)
            user_identification = None
            if not is_anonymous:
                # Only identify user for authenticated uploads
                user_identification = await self._identify_user_speaker(
                    job_id, meeting_id, transcription_result, user_id
                )

            # Step 3: Calculate speaker statistics, metrics, and generate communication tips
            # NOTE: We analyze ALL speakers (not just the user) to avoid re-processing
            # if user corrects their speaker or for manual uploads without mic audio
            sentry_sdk.add_breadcrumb(
                category="processing",
                message="Starting analysis (metrics + LLM)",
                level="info",
            )
            speaker_stats = await self.analysis.analyze(job_id, transcription_result)
            sentry_sdk.add_breadcrumb(
                category="processing",
                message="Analysis completed",
                level="info",
                data={"speaker_count": len(speaker_stats)},
            )

            # Step 4: Save results to database (one record per speaker)
            sentry_sdk.add_breadcrumb(
                category="processing",
                message="Saving analysis to database",
                level="info",
            )
            logger.info(f"[Job {job_id}] Saving analysis to database...")
            sys.stdout.flush()

            # Create one record per speaker
            speaker_records = []
            is_single_speaker = len(speaker_stats) == 1

            # For single-speaker recordings without mic-based identification,
            # set user_speaker_label since they must be the user
            if is_single_speaker and user_identification is None and not is_anonymous:
                single_speaker_label = list(speaker_stats.keys())[0]
                logger.info(
                    f"[Job {job_id}] Single-speaker recording, "
                    f"auto-assigning {single_speaker_label} to user"
                )
                await self.supabase.update_meeting_user_speaker(
                    meeting_id,
                    single_speaker_label,
                    confidence=1.0,  # 100% confidence for single speaker
                    shared_mic_detected=False,
                    alternative_speakers=[],
                )
                # Update user_identification for downstream logic
                user_identification = {
                    "user_speaker": single_speaker_label,
                    "confidence": 1.0,
                    "shared_mic_detected": False,
                    "alternative_speakers": [],
                }

            for speaker_label, stats in speaker_stats.items():
                record = {
                    "job_id": job_id,
                    "created_by": user_id,
                    "meeting_id": meeting_id,
                    "speaker_label": speaker_label,
                    "assigned_user_id": self._get_auto_assigned_user_id(
                        user_id,
                        speaker_label,
                        user_identification,
                        is_anonymous,
                        is_single_speaker,
                    ),
                    "custom_speaker_name": None,  # Optional custom name
                    # Speaker identification confidence from mic matching
                    "identification_confidence": (
                        user_identification.get("speaker_confidences", {}).get(
                            speaker_label
                        )
                        if user_identification
                        else None
                    ),
                    "summary": None,  # No per-speaker summary for now
                    # Flat metric columns (no JSONB parsing needed)
                    "talk_time_seconds": stats["total_time"],
                    "talk_time_percentage": stats["percentage"],
                    "word_count": stats["word_count"],
                    "words_per_minute": stats.get("words_per_minute"),
                    "verbosity": stats.get("verbosity"),
                    "turn_taking_balance": stats.get("turn_taking_balance"),
                    "segments_count": stats["segments"],
                    # Response metrics
                    "avg_response_latency_seconds": stats.get("response_latency"),
                    "response_count": stats.get("response_count"),
                    "quick_responses_percentage": stats.get(
                        "quick_responses_percentage"
                    ),
                    # Interruption metrics
                    "times_interrupted": stats.get("times_interrupted", 0),
                    "times_interrupting": stats.get("times_interrupting", 0),
                    "interruption_rate": stats.get("interruption_rate"),
                    # Filler words metrics
                    "filler_words_total": stats.get("filler_words_total", 0),
                    "filler_words_breakdown": stats.get("filler_words_breakdown", {}),
                    "filler_words_per_minute": stats.get(
                        "filler_words_per_minute", 0.0
                    ),
                    # Longest segment (monologuing detection)
                    "longest_segment_seconds": stats.get(
                        "longest_segment_seconds", 0.0
                    ),
                    # Hedge phrases metrics
                    "hedge_phrases_total": stats.get("hedge_phrases_total", 0),
                    "hedge_phrases_breakdown": stats.get("hedge_phrases_breakdown", {}),
                    "hedge_phrases_per_minute": stats.get(
                        "hedge_phrases_per_minute", 0.0
                    ),
                    # Apologies metrics
                    "apologies_total": stats.get("apologies_total", 0),
                    "apologies_breakdown": stats.get("apologies_breakdown", {}),
                    # Signposting metrics
                    "signposting_total": stats.get("signposting_total", 0),
                    "signposting_breakdown": stats.get("signposting_breakdown", {}),
                    "signposting_per_segment": stats.get(
                        "signposting_per_segment", 0.0
                    ),
                    # Softeners metrics
                    "softeners_total": stats.get("softeners_total", 0),
                    "softeners_breakdown": stats.get("softeners_breakdown", {}),
                    "softeners_per_minute": stats.get("softeners_per_minute", 0.0),
                    # Incomplete thoughts metrics
                    "incomplete_thoughts_count": stats.get(
                        "incomplete_thoughts_count", 0
                    ),
                    "incomplete_thoughts_percentage": stats.get(
                        "incomplete_thoughts_percentage", 0.0
                    ),
                    # Specificity metrics
                    "specificity_score": stats.get("specificity_score"),
                    "specificity_details": stats.get("specificity_details", {}),
                    # Topics per segment metrics
                    "avg_topics_per_segment": stats.get("avg_topics_per_segment"),
                    "max_topics_in_segment": stats.get("max_topics_in_segment", 0),
                    # Key point position metrics
                    "key_point_position": stats.get("key_point_position"),
                    "key_point_summary": stats.get("key_point_summary"),
                    # Communication tips (JSONB array)
                    "communication_tips": stats.get("communication_tips", []),
                    # General overview (1-sentence meeting description)
                    "general_overview": stats.get("general_overview"),
                    # Behavioral insights (optional, for future video analysis)
                    "behavioral_insights": None,
                    # Agentic analysis scores
                    "clarity_score": stats.get("clarity_score"),
                    "clarity_explanation": stats.get("clarity_explanation"),
                    "confidence_score": stats.get("confidence_score"),
                    "confidence_explanation": stats.get("confidence_explanation"),
                    "attunement_score": stats.get("attunement_score"),
                    "attunement_explanation": stats.get("attunement_explanation"),
                }
                speaker_records.append(record)

            # Save analysis results to database
            await self.supabase.save_analysis_results(job_id, speaker_records)
            logger.info(f"[Job {job_id}] Analysis saved to database")
            sys.stdout.flush()

            # Trigger weekly rollup if user was identified as a speaker
            # user_identification is set when user_speaker_label is saved to the meeting
            if user_identification is not None:
                meeting = await self.supabase.get_meeting(meeting_id)
                if meeting and meeting.get("start_time"):
                    logger.info(
                        f"[Job {job_id}] User identified as speaker, "
                        "triggering weekly rollup calculation"
                    )
                    await self.supabase.calculate_weekly_rollup(
                        user_id, meeting["start_time"]
                    )

            # Step 5: Update job status to completed
            await self.supabase.update_job_status(job_id, "completed")
            logger.info(f"[Job {job_id}] Job status updated to 'completed'")
            sys.stdout.flush()

            # Structured log: Processing completed
            sentry_sdk.set_context(
                "processing_job",
                {
                    "job_id": job_id,
                    "meeting_id": meeting_id,
                    "user_id": user_id,
                    "component": "python-backend",
                    "stage": "completed",
                    "speakers_count": len(speaker_records),
                    "is_anonymous": is_anonymous,
                },
            )
            sentry_sdk.set_tag("stage", "completed")
            logger.info("Processing job completed")

            # Step 6: Track meeting_analyzed event for every completed meeting
            try:
                # Determine source based on meeting_id presence
                source = "calendar_sync" if meeting_id else "upload"

                await self.supabase.log_analytics_event(
                    user_id=user_id,
                    event_name="meeting_analyzed",
                    properties={
                        "source": source,
                        "meeting_id": meeting_id,
                    },
                )
                logger.info(
                    f"[Job {job_id}] Meeting analyzed event tracked for meeting {meeting_id}"
                )
                sys.stdout.flush()
            except Exception as e:
                # Don't fail the job if analytics tracking fails
                logger.error(
                    f"[Job {job_id}] Failed to track meeting analyzed event: {str(e)}"
                )
                sys.stdout.flush()

            # Step 7: Track first_meeting_recorded event if this is the user's first completed job
            try:
                is_first = await self.supabase.is_first_completed_job(user_id)
                if is_first:
                    # Determine source based on meeting_id presence
                    source = "calendar_sync" if meeting_id else "upload"

                    await self.supabase.log_analytics_event(
                        user_id=user_id,
                        event_name="first_meeting_recorded",
                        properties={"source": source},
                    )
                    logger.info(
                        f"[Job {job_id}] 🎉 First meeting recorded event tracked for user {user_id}"
                    )
                    sys.stdout.flush()
            except Exception as e:
                # Don't fail the job if analytics tracking fails
                logger.error(
                    f"[Job {job_id}] Failed to track first meeting event: {str(e)}"
                )
                sys.stdout.flush()

            # Step 8: Set recording expiry to 7 days from completion
            available_until = (datetime.now(UTC) + timedelta(days=7)).isoformat()
            await self.supabase.update_meeting_recording_expiry(
                meeting_id, available_until
            )
            logger.info(
                f"[Job {job_id}] Recording expiry set to {available_until} (7 days from now)"
            )
            sys.stdout.flush()

            # Step 9: Send email notification for anonymous uploads (idempotent)
            if is_anonymous:
                # Check if email was already sent (prevent duplicates)
                email_status = await self.supabase.get_anonymous_upload_email_status(
                    meeting_id
                )

                if email_status == "sent":
                    logger.info(
                        f"[Job {job_id}] Email already sent for this meeting, skipping"
                    )
                    sys.stdout.flush()
                else:
                    duration_seconds = transcription_result.get("duration", 0)
                    await self._send_anonymous_notification(
                        job_id, meeting_id, speaker_stats, int(duration_seconds)
                    )

            logger.info(f"[Job {job_id}] ✅ PROCESSING COMPLETE!")
            sys.stdout.flush()

        except Exception as e:
            logger.error(
                f"[Job {job_id}] ❌ ERROR during processing: {str(e)}", exc_info=True
            )
            sys.stdout.flush()

            # Capture exception in Sentry with full context
            sentry_sdk.capture_exception(e)

            # Update job status to failed
            try:
                await self.supabase.update_job_status(job_id, "failed", str(e))
                logger.info(f"[Job {job_id}] Job status updated to 'failed'")
                sys.stdout.flush()
            except Exception as update_error:
                error_msg = str(update_error)
                logger.error(
                    f"[Job {job_id}] Failed to update error status: {error_msg}",
                    exc_info=True,
                )
                sys.stdout.flush()

            # For PowerPoint Karaoke games, delete the meeting on failure
            # (no point keeping incomplete game attempts in history)
            try:
                meeting = await self.supabase.get_meeting(meeting_id)
                if meeting and "PowerPoint Karaoke" in (meeting.get("title") or ""):
                    storage_path = meeting.get("audio_storage_path") or ""
                    await self.supabase.delete_meeting(meeting_id, storage_path)
                    logger.info(
                        f"[Job {job_id}] Deleted failed PowerPoint Karaoke game meeting"
                    )
                    sys.stdout.flush()
            except Exception as delete_error:
                logger.error(
                    f"[Job {job_id}] Failed to delete game meeting: {str(delete_error)}",
                    exc_info=True,
                )
                sys.stdout.flush()

            # NOTE: We intentionally do NOT cleanup storage files on failure.
            # This allows for retries without re-uploading the audio.
            # Storage files are only cleaned up when:
            # 1. User explicitly deletes the meeting
            # 2. Recording retention period expires after successful processing

            # Re-raise the exception so it can be handled by the caller
            raise
