"""
Supabase client for Python backend to interact with the database and storage.
"""

import asyncio
import aiofiles
import httpx
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, TypedDict
from supabase import create_client, Client
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

logger = logging.getLogger(__name__)

# Minimum recording duration in seconds
MIN_RECORDING_DURATION_SECONDS = 60


class OffRecordPeriod(TypedDict):
    """
    Structure for off-record periods from desktop app.

    Attributes:
        placeholderStart: Start timestamp of 5-second placeholder in stitched audio
        placeholderEnd: End timestamp of 5-second placeholder in stitched audio
        actualDuration: Real duration (in seconds) the user was off-record
    """

    placeholderStart: float
    placeholderEnd: float
    actualDuration: float


class SupabaseClient:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SECRET_KEY")

        if not self.url or not self.service_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment"
            )

        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }

        # Initialize Supabase SDK for storage operations
        self.client: Client = create_client(self.url, self.service_key)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def download_from_storage(
        self, storage_path: str, bucket: str = "recordings"
    ) -> bytes:
        """
        Download file from Supabase Storage using SDK in a thread pool.

        This prevents blocking the async event loop by running the synchronous
        Supabase SDK call in a separate thread via asyncio.to_thread().

        Args:
            storage_path: Path in storage bucket (e.g., "user_id/2025/10/job_id.mp4")
            bucket: Storage bucket name (default: "recordings", use "anonymous-recordings" for anonymous uploads)

        Returns:
            File contents as bytes

        Raises:
            Exception: If download fails after retries
        """
        try:
            logger.info(f"Downloading from storage bucket '{bucket}': {storage_path}")

            # Use streaming download with signed URL for better performance on large files
            # Get signed URL (valid for 1 hour)
            signed_url_response = await asyncio.to_thread(
                self.client.storage.from_(bucket).create_signed_url,
                storage_path,
                3600,  # 1 hour expiry
            )

            if not signed_url_response or "signedURL" not in signed_url_response:
                raise ValueError(f"Failed to generate signed URL for: {storage_path}")

            signed_url = signed_url_response["signedURL"]

            # Stream download using httpx for better performance
            import httpx

            content = None
            async with httpx.AsyncClient(timeout=300.0) as http_client:
                response = await http_client.get(signed_url)
                response.raise_for_status()
                content = response.content

            if not content:
                raise ValueError(
                    f"Empty response from storage download: {storage_path}"
                )

            file_size_mb = len(content) / (1024 * 1024)
            logger.info(f"Downloaded {file_size_mb:.2f} MB from storage")

            return content
        except Exception:
            logger.error(f"Storage download failed: {storage_path}", exc_info=True)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def update_job_status(
        self, job_id: str, status: str, error: Optional[str] = None
    ):
        """Update processing job status"""
        try:
            data = {"status": status, "updated_at": "now()"}
            if error:
                data["processing_error"] = error

            # Configure all timeout types to prevent infinite hangs
            timeout = httpx.Timeout(
                connect=10.0,  # Time to establish connection
                read=30.0,  # Time to read response
                write=10.0,  # Time to send request
                pool=10.0,  # Time to acquire connection from pool
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/processing_jobs?id=eq.{job_id}",
                    json=data,
                    headers=self.headers,
                )
                response.raise_for_status()
                # Supabase returns 204 No Content for PATCH requests by default
                # Only try to parse JSON if there's content
                if response.status_code == 204 or not response.text:
                    return {"success": True}
                return response.json()
        except Exception:
            logger.error(f"Failed to update job status for {job_id}", exc_info=True)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def save_analysis_results(self, job_id: str, speaker_records: list):
        """
        Save analysis results to Supabase (one record per speaker).

        Args:
            job_id: The job identifier
            speaker_records: List of speaker analysis records
        """
        try:
            # Configure all timeout types to prevent infinite hangs
            timeout = httpx.Timeout(
                connect=10.0,  # Time to establish connection
                read=30.0,  # Time to read response
                write=10.0,  # Time to send request
                pool=10.0,  # Time to acquire connection from pool
            )

            # Delete existing records for this job first (in case of reprocessing)
            async with httpx.AsyncClient(timeout=timeout) as client:
                delete_response = await client.delete(
                    f"{self.url}/rest/v1/meeting_analysis?job_id=eq.{job_id}",
                    headers=self.headers,
                )
                # Don't raise on 404 - it's fine if no records exist yet
                if delete_response.status_code not in [200, 204, 404]:
                    logger.error(
                        f"Delete failed for job {job_id}: "
                        f"Status {delete_response.status_code}, "
                        f"Body: {delete_response.text}"
                    )
                    delete_response.raise_for_status()

            # Insert new speaker records
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.url}/rest/v1/meeting_analysis",
                    json=speaker_records,
                    headers=self.headers,
                )

                # Log response details before raising error
                if response.status_code not in [200, 201]:
                    logger.error(
                        f"Insert failed for job {job_id}: "
                        f"Status {response.status_code}, "
                        f"Body: {response.text}"
                    )

                response.raise_for_status()
                # Supabase returns 201 Created with empty body or Location header
                # Only try to parse JSON if there's content
                if response.status_code == 201 or not response.text:
                    return {"success": True}
                return response.json()
        except httpx.HTTPStatusError as e:
            # Extract full error details from HTTP response
            error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(
                f"Failed to save analysis results for {job_id}: {error_msg}",
                exc_info=True,
            )
            # Re-raise with full error details
            raise Exception(error_msg) from e
        except Exception as e:
            logger.error(
                f"Failed to save analysis results for {job_id}: {str(e)}",
                exc_info=True,
            )
            raise

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get job status and details"""
        try:
            # Configure all timeout types to prevent infinite hangs
            timeout = httpx.Timeout(
                connect=10.0,  # Time to establish connection
                read=30.0,  # Time to read response
                write=10.0,  # Time to send request
                pool=10.0,  # Time to acquire connection from pool
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/processing_jobs?id=eq.{job_id}",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()
                return data[0] if data else None
        except Exception:
            logger.error(f"Failed to get job status for {job_id}", exc_info=True)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def update_meeting_metadata(
        self,
        meeting_id: str,
        file_size_mb: float,
        duration_seconds: int,
    ):
        """
        Update meeting record with recording metadata.
        Also calculates and sets the meeting end_time based on start_time + duration.

        Args:
            meeting_id: The meeting identifier
            file_size_mb: Size of the recording file in MB
            duration_seconds: Duration of the recording in seconds
        """
        try:
            # First, fetch the meeting's start_time to calculate end_time
            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Fetch meeting start_time
                get_response = await client.get(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}&select=start_time",
                    headers=self.headers,
                )
                get_response.raise_for_status()
                meeting_data = get_response.json()

                if not meeting_data or len(meeting_data) == 0:
                    raise ValueError(f"Meeting {meeting_id} not found")

                start_time_str = meeting_data[0].get("start_time")
                if not start_time_str:
                    raise ValueError(f"Meeting {meeting_id} has no start_time")

                # Parse start_time and calculate end_time
                start_time = datetime.fromisoformat(
                    start_time_str.replace("Z", "+00:00")
                )
                end_time = start_time + timedelta(seconds=duration_seconds)

                # Prepare update data with end_time
                data = {
                    "recording_size_mb": file_size_mb,
                    "recording_duration_seconds": duration_seconds,
                    "end_time": end_time.isoformat(),
                    "updated_at": "now()",
                }

                # Update meeting with all metadata including end_time
                response = await client.patch(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}",
                    json=data,
                    headers=self.headers,
                )
                response.raise_for_status()

                logger.info(
                    f"Updated meeting {meeting_id} metadata with end_time: "
                    f"{start_time_str} + {duration_seconds}s = {end_time.isoformat()}"
                )

                if response.status_code == 204 or not response.text:
                    return {"success": True}
                return response.json()
        except Exception:
            logger.error(
                f"Failed to update meeting metadata for {meeting_id}", exc_info=True
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def save_transcript(
        self,
        meeting_id: str,
        transcription_result: dict,
    ):
        """
        Save transcript to dedicated transcripts table.

        This stores the full transcript data separately from the meetings table
        to prevent accidental loading of large transcript data via SELECT *.

        Args:
            meeting_id: The meeting identifier
            transcription_result: Full transcription result from AssemblyAI containing:
                - segments: List of transcript segments
                - text: Full transcript text
                - language: Detected language code
                - duration: Audio duration in seconds
                - num_speakers: Number of detected speakers
        """
        try:
            segments = transcription_result.get("segments", [])

            # Extract unique speakers from segments
            speakers = sorted(
                list(
                    set(
                        seg.get("speaker")
                        for seg in segments
                        if seg.get("speaker") is not None
                    )
                )
            )

            # Calculate word count from full text
            full_text = transcription_result.get("text", "")
            word_count = len(full_text.split()) if full_text else 0

            data = {
                "meeting_id": meeting_id,
                "language": transcription_result.get("language"),
                "duration_seconds": transcription_result.get("duration"),
                "num_speakers": transcription_result.get("num_speakers"),
                "word_count": word_count,
                "full_text": full_text,
                "segments": segments,
                "speakers": speakers,
                "provider": "assemblyai",
            }

            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=30.0,  # May need more time for large transcripts
                pool=10.0,
            )

            # Use upsert to handle re-processing gracefully
            # Supabase upsert requires on_conflict parameter to specify the unique column
            headers = {
                **self.headers,
                "Prefer": "resolution=merge-duplicates",
            }

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.url}/rest/v1/transcripts?on_conflict=meeting_id",
                    json=data,
                    headers=headers,
                )

                if response.status_code not in [200, 201]:
                    logger.error(
                        f"Failed to save transcript for meeting {meeting_id}: "
                        f"Status {response.status_code}, Body: {response.text}"
                    )
                    response.raise_for_status()

            logger.info(
                f"Saved transcript for meeting {meeting_id}: "
                f"{len(segments)} segments, {len(speakers)} speakers, {word_count} words"
            )

            return {"success": True}

        except Exception:
            logger.error(
                f"Failed to save transcript for meeting {meeting_id}", exc_info=True
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def get_transcript(self, meeting_id: str) -> dict | None:
        """
        Fetch transcript for a meeting from the transcripts table.

        Args:
            meeting_id: The meeting identifier

        Returns:
            Transcript dict with segments, speakers, duration_seconds, etc.
            Returns None if no transcript found.
        """
        try:
            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/transcripts",
                    params={
                        "meeting_id": f"eq.{meeting_id}",
                        "select": "segments,speakers,duration_seconds,word_count,full_text",
                    },
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if not data:
                    logger.warning(f"No transcript found for meeting {meeting_id}")
                    return None

                return data[0]

        except Exception:
            logger.error(
                f"Failed to fetch transcript for meeting {meeting_id}", exc_info=True
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def get_off_record_periods(self, meeting_id: str) -> list[OffRecordPeriod]:
        """
        Fetch off-record periods for a meeting.

        Args:
            meeting_id: The meeting identifier

        Returns:
            List of OffRecordPeriod dicts with placeholderStart, placeholderEnd, and actualDuration.
            Returns empty list if no off-record periods found.
        """
        try:
            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}&select=off_record_periods",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if not data or len(data) == 0:
                    logger.warning(f"No meeting found with id {meeting_id}")
                    return []

                off_record_periods = data[0].get("off_record_periods")

                # Return empty list if null or not present
                if off_record_periods is None:
                    return []

                return off_record_periods

        except Exception:
            logger.error(
                f"Failed to fetch off_record_periods for meeting {meeting_id}",
                exc_info=True,
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def get_meeting(self, meeting_id: str) -> Dict[str, Any]:
        """
        Fetch a meeting record by ID.

        Args:
            meeting_id: The meeting identifier

        Returns:
            Meeting record dictionary

        Raises:
            Exception: If meeting not found or fetch fails
        """
        try:
            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if not data or len(data) == 0:
                    raise ValueError(f"No meeting found with id {meeting_id}")

                return data[0]

        except Exception:
            logger.error(
                f"Failed to fetch meeting {meeting_id}",
                exc_info=True,
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def update_meeting_user_speaker(
        self,
        meeting_id: str,
        user_speaker_label: str,
        confidence: float,
        shared_mic_detected: bool,
        alternative_speakers: list[str] | None = None,
    ):
        """
        Update meeting with user speaker identification results.

        Args:
            meeting_id: The meeting identifier
            user_speaker_label: Identified user speaker (e.g., "Speaker A")
            confidence: Confidence score (0.0-1.0) - kept for logging but not stored
            shared_mic_detected: Whether shared microphone was detected
            alternative_speakers: Other speakers with significant mic overlap (>20%)
        """
        try:
            data = {
                "user_speaker_label": user_speaker_label,
                "shared_mic_detected": shared_mic_detected,
                "alternative_speakers": alternative_speakers or [],
                "updated_at": "now()",
            }

            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}",
                    headers=self.headers,
                    json=data,
                )
                response.raise_for_status()

            logger.info(
                f"Updated meeting {meeting_id} with user speaker: {user_speaker_label} "
                f"(confidence: {confidence:.2f})"
            )

        except Exception:
            logger.error(
                f"Failed to update user speaker for meeting {meeting_id}",
                exc_info=True,
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def update_meeting_recording_expiry(
        self, meeting_id: str, available_until: str
    ):
        """
        Update the recording_available_until timestamp for a meeting.

        Args:
            meeting_id: The meeting identifier
            available_until: ISO timestamp when recording will be deleted
        """
        try:
            data = {
                "recording_available_until": available_until,
                "updated_at": "now()",
            }

            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}",
                    json=data,
                    headers=self.headers,
                )
                response.raise_for_status()
                if response.status_code == 204 or not response.text:
                    return {"success": True}
                return response.json()
        except Exception:
            logger.error(
                f"Failed to update recording expiry for {meeting_id}", exc_info=True
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def cleanup_failed_job(self, job_id: str):
        """
        Trigger cleanup Edge Function for failed job.

        Args:
            job_id: The processing job identifier
        """
        try:
            edge_function_url = f"{self.url}/functions/v1/cleanup-failed-job"
            headers = {
                "Authorization": f"Bearer {self.service_key}",
                "Content-Type": "application/json",
            }
            payload = {"job_id": job_id}

            timeout = httpx.Timeout(
                connect=10.0,
                read=60.0,  # Cleanup might take a bit longer
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    edge_function_url,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                return response.json() if response.text else {"success": True}
        except Exception:
            logger.error(f"Failed to cleanup failed job {job_id}", exc_info=True)
            raise

    async def is_first_completed_job(self, user_id: str) -> bool:
        """
        Check if the user has any previously completed jobs.

        Args:
            user_id: The user identifier

        Returns:
            True if this is the user's first completed job, False otherwise
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Count completed jobs for this user by querying through meetings table
                # processing_jobs.meeting_id -> meetings.id (where meetings.user_id = user_id)
                query_params = (
                    f"user_id=eq.{user_id}"
                    f"&select=processing_jobs!inner(status)"
                    f"&processing_jobs.status=eq.completed"
                )
                url = f"{self.url}/rest/v1/meetings?{query_params}"
                response = await client.get(
                    url,
                    headers={**self.headers, "Prefer": "count=exact"},
                )
                response.raise_for_status()

                # Supabase returns count in Content-Range header
                content_range = response.headers.get("Content-Range", "0-0/0")
                count = int(content_range.split("/")[1])

                # This is the first completed job if count is 1
                return count == 1
        except Exception:
            logger.error(
                f"Failed to check first completed job for user {user_id}", exc_info=True
            )
            # Return False on error to avoid blocking the pipeline
            return False

    async def is_anonymous_meeting(self, meeting_id: str) -> bool:
        """
        Check if a meeting is from an anonymous upload.

        Args:
            meeting_id: The meeting identifier

        Returns:
            True if this is an anonymous upload, False otherwise
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Check if meeting exists in anonymous_uploads table
                response = await client.get(
                    f"{self.url}/rest/v1/anonymous_uploads?meeting_id=eq.{meeting_id}&select=id",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                # If we found a record, it's an anonymous upload
                return len(data) > 0
        except Exception:
            logger.error(
                f"Failed to check if meeting {meeting_id} is anonymous", exc_info=True
            )
            # Return False on error to avoid blocking the pipeline
            return False

    async def get_anonymous_upload_email(self, meeting_id: str) -> Optional[str]:
        """
        Get the email address for an anonymous upload.

        Args:
            meeting_id: The meeting identifier

        Returns:
            Email address if found, None otherwise
        """
        details = await self.get_anonymous_upload_details(meeting_id)
        return details.get("email") if details else None

    async def get_anonymous_upload_details(
        self, meeting_id: str
    ) -> Optional[Dict[str, str]]:
        """
        Get the email and access_token for an anonymous upload.

        Args:
            meeting_id: The meeting identifier

        Returns:
            Dict with 'email' and 'access_token' if found, None otherwise
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Get email and access_token from anonymous_uploads table
                response = await client.get(
                    f"{self.url}/rest/v1/anonymous_uploads?meeting_id=eq.{meeting_id}&select=email,access_token",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if data and len(data) > 0:
                    return {
                        "email": data[0].get("email"),
                        "access_token": data[0].get("access_token"),
                    }
                return None
        except Exception:
            logger.error(
                f"Failed to get anonymous upload details for meeting {meeting_id}",
                exc_info=True,
            )
            return None

    async def get_anonymous_upload_email_status(self, meeting_id: str) -> Optional[str]:
        """
        Get the email status for an anonymous upload.

        Args:
            meeting_id: The meeting identifier

        Returns:
            Email status ('pending', 'sent', 'failed') if found, None otherwise
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/anonymous_uploads?meeting_id=eq.{meeting_id}&select=email_status",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if data and len(data) > 0:
                    return data[0].get("email_status")
                return None
        except Exception:
            logger.error(
                f"Failed to get email status for meeting {meeting_id}",
                exc_info=True,
            )
            return None

    async def update_anonymous_upload_email_status(
        self, meeting_id: str, status: str
    ) -> bool:
        """
        Update the email status for an anonymous upload.

        Args:
            meeting_id: The meeting identifier
            status: New status ('sent' or 'failed')

        Returns:
            True if successful, False otherwise
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                payload = {
                    "email_status": status,
                }

                if status == "sent":
                    payload["email_sent_at"] = datetime.utcnow().isoformat()

                response = await client.patch(
                    f"{self.url}/rest/v1/anonymous_uploads?meeting_id=eq.{meeting_id}",
                    headers=self.headers,
                    json=payload,
                )
                response.raise_for_status()
                return True
        except Exception:
            logger.error(
                f"Failed to update email status for meeting {meeting_id}",
                exc_info=True,
            )
            return False

    async def log_analytics_event(
        self, user_id: str, event_name: str, properties: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Log an analytics event to the user_event_log table.

        Args:
            user_id: The user identifier
            event_name: Name of the event (e.g., 'first_meeting_recorded')
            properties: Optional event properties as a dictionary
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            event_data = {
                "user_id": user_id,
                "event_name": event_name,
                "payload": properties,
            }

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.url}/rest/v1/user_event_log",
                    json=event_data,
                    headers=self.headers,
                )
                response.raise_for_status()
                logger.info(
                    f"[Analytics] Logged event '{event_name}' for user {user_id}"
                )
        except Exception:
            logger.error(
                f"Failed to log analytics event '{event_name}' for user {user_id}",
                exc_info=True,
            )
            # Don't raise - analytics failures shouldn't block the pipeline

    async def delete_meeting(self, meeting_id: str, storage_path: str) -> None:
        """
        Delete a meeting and all its associated data.
        Used when a recording doesn't meet minimum duration requirements.

        Args:
            meeting_id: The meeting identifier
            storage_path: Path to the recording file in storage

        Raises:
            Exception: If deletion fails
        """
        try:
            logger.info(
                f"Deleting meeting {meeting_id} (recording below minimum duration)"
            )

            # Delete storage file
            # Determine bucket from storage_path (anonymous uploads start with "anonymous/")
            bucket = (
                "anonymous-recordings"
                if storage_path.startswith("anonymous/")
                else "recordings"
            )
            try:
                self.client.storage.from_(bucket).remove([storage_path])
                logger.info(f"Deleted storage file from {bucket}: {storage_path}")
            except Exception as e:
                logger.error(f"Failed to delete storage file: {e}")
                # Continue with database deletion even if storage fails

            # Delete meeting record (cascade deletes meeting_analysis, processing_jobs)
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.delete(
                    f"{self.url}/rest/v1/meetings?id=eq.{meeting_id}",
                    headers=self.headers,
                )
                response.raise_for_status()
                logger.info(f"Deleted meeting {meeting_id} and all associated records")
        except Exception:
            logger.error(f"Failed to delete meeting {meeting_id}", exc_info=True)
            raise

    async def calculate_weekly_rollup(
        self, user_id: str, meeting_start_time: str
    ) -> None:
        """
        Calculate weekly rollup for a user after speaker auto-assignment.

        This triggers the database function to recalculate aggregated metrics
        for the week containing the specified meeting.

        Args:
            user_id: The user identifier
            meeting_start_time: ISO timestamp of the meeting start (used to determine week)
        """
        try:
            # Parse meeting start time and calculate week start (Monday)
            meeting_dt = datetime.fromisoformat(
                meeting_start_time.replace("Z", "+00:00")
            )
            # Get Monday of the week (ISO week starts on Monday)
            days_since_monday = meeting_dt.weekday()  # Monday = 0
            week_start = meeting_dt - timedelta(days=days_since_monday)
            week_start_date = week_start.strftime("%Y-%m-%d")

            logger.info(
                f"Calculating weekly rollup for user {user_id}, "
                f"week starting {week_start_date}"
            )

            # Call the RPC function to calculate/update the weekly rollup
            timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.url}/rest/v1/rpc/calculate_user_weekly_rollup",
                    headers=self.headers,
                    json={
                        "p_user_id": user_id,
                        "p_week_start": week_start_date,
                    },
                )
                response.raise_for_status()

            logger.info(
                f"Successfully calculated weekly rollup for user {user_id}, "
                f"week starting {week_start_date}"
            )

        except Exception as e:
            # Log but don't fail - rollup calculation is not critical to processing
            logger.error(
                f"Failed to calculate weekly rollup for user {user_id}: {e}",
                exc_info=True,
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def download_file(
        self,
        bucket: str,
        path: str,
        destination: Path,
    ) -> None:
        """
        Download a file from Supabase Storage to a local path using streaming.

        Streams the file directly to disk to minimize memory usage.
        This is especially important for larger files.

        Args:
            bucket: Storage bucket name
            path: Path within the bucket
            destination: Local file path to save to
        """
        try:
            logger.info(f"Downloading file from {bucket}/{path} to {destination}")

            # Get signed URL (valid for 1 hour)
            signed_url_response = await asyncio.to_thread(
                self.client.storage.from_(bucket).create_signed_url,
                path,
                3600,  # 1 hour expiry
            )

            if not signed_url_response or "signedURL" not in signed_url_response:
                raise ValueError(f"Failed to generate signed URL for: {path}")

            signed_url = signed_url_response["signedURL"]

            # Stream download to disk to minimize memory usage
            total_bytes = 0
            async with httpx.AsyncClient(timeout=300.0) as http_client:
                async with http_client.stream("GET", signed_url) as response:
                    response.raise_for_status()
                    async with aiofiles.open(destination, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=65536):
                            await f.write(chunk)
                            total_bytes += len(chunk)

            file_size_mb = total_bytes / (1024 * 1024)
            logger.info(f"Downloaded {file_size_mb:.2f} MB to {destination}")

        except Exception as e:
            logger.error(f"Failed to download file {bucket}/{path}: {e}")
            raise

    # ============================================
    # Games table methods (for PowerPoint Karaoke)
    # ============================================

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def get_game(self, game_id: str) -> Dict[str, Any]:
        """
        Fetch a game record by ID.

        Args:
            game_id: The game identifier

        Returns:
            Game record dictionary

        Raises:
            Exception: If game not found or fetch fails
        """
        try:
            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/games?id=eq.{game_id}",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if not data or len(data) == 0:
                    raise ValueError(f"No game found with id {game_id}")

                return data[0]

        except Exception:
            logger.error(
                f"Failed to fetch game {game_id}",
                exc_info=True,
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def get_topic_name(self, topic_date: str) -> Optional[str]:
        """
        Fetch topic name from daily_topics table by date.

        Args:
            topic_date: The topic date in YYYY-MM-DD format

        Returns:
            Topic name string or None if not found
        """
        try:
            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/daily_topics?topic_date=eq.{topic_date}",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

                if not data or len(data) == 0:
                    logger.warning(f"No topic found for date {topic_date}")
                    return None

                return data[0].get("topic_name")

        except Exception:
            logger.error(
                f"Failed to fetch topic for date {topic_date}",
                exc_info=True,
            )
            return None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def update_game_status(
        self, game_id: str, status: str, error: Optional[str] = None
    ):
        """
        Update game status in the games table.

        Args:
            game_id: The game identifier
            status: New status ('pending', 'processing', 'completed', 'failed')
            error: Optional error message for failed status
        """
        try:
            data = {"status": status, "updated_at": "now()"}
            if error:
                data["processing_error"] = error

            timeout = httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/games?id=eq.{game_id}",
                    json=data,
                    headers=self.headers,
                )
                response.raise_for_status()
                if response.status_code == 204 or not response.text:
                    return {"success": True}
                return response.json()
        except Exception:
            logger.error(f"Failed to update game status for {game_id}", exc_info=True)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def save_game_results(
        self,
        game_id: str,
        analysis_data: dict,
    ) -> None:
        """
        Save game analysis results directly to the games table.

        Stores the full analysis JSON in the tips column and maintains
        backward-compatible scalar fields.

        Args:
            game_id: The game identifier
            analysis_data: Full analysis result dict containing:
                - transcript: List of timestamped chunks
                - delivery: Delivery observations
                - delivery_feedback: List of delivery feedback items
                - signals: Holistic signal assessments
                - signal_feedback: List of signal feedback items
                - clarity: Score object with raw_score, score, applied_rules, explanation
                - confidence: Score object with raw_score, score, applied_rules, explanation
                - biggest_fixes: Actionable improvements
        """
        try:
            # Extract scores from the new nested structure
            clarity_score = analysis_data["clarity"]["score"]
            confidence_score = analysis_data["confidence"]["score"]

            # Join transcript chunks into full text for backward compatibility
            transcript_text = " ".join(
                chunk.get("text", "") for chunk in analysis_data.get("transcript", [])
            )

            # Calculate word count and duration from transcript
            word_count = len(transcript_text.split()) if transcript_text else 0

            # Get duration from last transcript chunk
            transcript_chunks = analysis_data.get("transcript", [])
            duration_seconds = 0
            if transcript_chunks:
                duration_seconds = int(transcript_chunks[-1].get("t_end_sec", 0))

            # Calculate WPM
            words_per_minute = 0.0
            if duration_seconds > 0:
                words_per_minute = round(word_count / (duration_seconds / 60), 1)

            # Extract shareable_quote for top-level storage (also in tips JSON)
            shareable_quote = analysis_data.get("shareable_quote", "")

            data = {
                # Legacy scalar fields for backward compatibility
                "clarity_score": clarity_score,
                "confidence_score": confidence_score,
                "word_count": word_count,
                "words_per_minute": words_per_minute,
                "recording_duration_seconds": duration_seconds,
                "transcript": transcript_text,
                # Shareable quote for social sharing
                "shareable_quote": shareable_quote,
                # Store FULL analysis JSON in tips column (repurposed)
                "tips": analysis_data,
                "status": "completed",
                "updated_at": "now()",
            }

            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/games?id=eq.{game_id}",
                    json=data,
                    headers=self.headers,
                )

                if response.status_code not in [200, 204]:
                    logger.error(
                        f"Failed to save game results: "
                        f"Status {response.status_code}, Body: {response.text}"
                    )

                response.raise_for_status()
                logger.info(f"Saved game results for game {game_id}")

        except Exception as e:
            logger.error(f"Failed to save game results for {game_id}: {e}")
            raise

    async def get_stuck_games(
        self, minutes_threshold: int = 10
    ) -> list[Dict[str, Any]]:
        """
        Find games stuck in 'processing' status for longer than the threshold.

        Args:
            minutes_threshold: Minutes after which a processing game is considered stuck

        Returns:
            List of stuck game records with id and updated_at
        """
        try:
            timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Query for games stuck in processing for more than threshold minutes
                # Using Supabase filter for updated_at < now() - interval
                response = await client.get(
                    f"{self.url}/rest/v1/games?status=eq.processing&select=id,updated_at",
                    headers=self.headers,
                )
                response.raise_for_status()
                games = response.json()

                # Filter in Python since Supabase REST doesn't support interval arithmetic easily
                stuck_games = []
                threshold_time = datetime.utcnow() - timedelta(
                    minutes=minutes_threshold
                )

                for game in games:
                    updated_at_str = game.get("updated_at")
                    if updated_at_str:
                        updated_at = datetime.fromisoformat(
                            updated_at_str.replace("Z", "+00:00")
                        ).replace(tzinfo=None)
                        if updated_at < threshold_time:
                            stuck_games.append(game)

                return stuck_games

        except Exception:
            logger.error("Failed to get stuck games", exc_info=True)
            raise

    async def mark_stuck_games_as_failed(
        self, minutes_threshold: int = 10
    ) -> list[str]:
        """
        Find and mark stuck games as failed.

        Args:
            minutes_threshold: Minutes after which a processing game is considered stuck

        Returns:
            List of game IDs that were marked as failed
        """
        try:
            stuck_games = await self.get_stuck_games(minutes_threshold)
            failed_ids = []

            for game in stuck_games:
                game_id = game["id"]
                try:
                    await self.update_game_status(
                        game_id,
                        "failed",
                        error=f"Processing timeout - stuck for >{minutes_threshold} minutes",
                    )
                    failed_ids.append(game_id)
                    logger.info(f"Marked stuck game {game_id} as failed")
                except Exception as e:
                    logger.error(f"Failed to mark game {game_id} as failed: {e}")

            return failed_ids

        except Exception:
            logger.error("Failed to mark stuck games as failed", exc_info=True)
            raise
