"""
Tests for pipeline orchestrator.

Tests the complete processing pipeline coordination including error handling,
analytics tracking, and cleanup operations.
"""

import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, patch
from app.services.orchestrator import PipelineOrchestrator


class TestPipelineOrchestrator:
    """Test suite for pipeline orchestrator."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator instance with mocked dependencies."""
        with patch("app.services.orchestrator.SupabaseClient"), patch(
            "app.services.orchestrator.IngestionOrchestrator"
        ), patch("app.services.orchestrator.AnalysisOrchestrator"), patch(
            "app.services.orchestrator.ResendClient"
        ):
            orch = PipelineOrchestrator()
            # Add default mock for get_off_record_periods to all tests
            orch.supabase.get_off_record_periods = AsyncMock(return_value=[])
            # Add default mock for save_transcript (dual-write to transcripts table)
            orch.supabase.save_transcript = AsyncMock()
            # Add default mock for single-speaker auto-assign
            orch.supabase.update_meeting_user_speaker = AsyncMock()
            # Add default mock for get_meeting (used in user speaker identification)
            orch.supabase.get_meeting = AsyncMock(return_value=None)
            return orch

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_successful_end_to_end_execution(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test successful pipeline execution from download to completion."""
        # Setup
        temp_file = tmp_path / "test.mp4"
        # Create a file large enough to pass size validation (> 100 KB)
        mock_file_content = (
            b"\x00\x00\x00\x18\x66\x74\x79\x70\x6d\x70\x34\x32"
            + b"video content" * 10000
        )
        mock_transcript = {
            "text": "Test transcript",
            "segments": [{"speaker": "A", "start": 0, "end": 5, "text": "Hello"}],
            "duration": 60.0,
        }
        mock_speaker_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 50,
                "words_per_minute": 50,
                "segments": 1,
                "response_latency": 0,
                "response_count": 0,
                "quick_responses_percentage": 0,
                "times_interrupted": 0,
                "times_interrupting": 0,
                "interruption_rate": 0,
                "filler_words_total": 0,
                "filler_words_breakdown": {},
                "communication_tips": [],
            }
        }

        # Mock all services
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_speaker_stats)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            user_id="user-789",
            storage_path="path/to/file.mp4",
            temp_file=temp_file,
        )

        # Verify all steps executed
        orchestrator.supabase.download_from_storage.assert_called_once()
        orchestrator.ingestion.ingest.assert_called_once()
        orchestrator.analysis.analyze.assert_called_once()
        orchestrator.supabase.update_meeting_metadata.assert_called_once()
        orchestrator.supabase.save_analysis_results.assert_called_once()
        orchestrator.supabase.update_job_status.assert_called_with(
            "job-123", "completed"
        )
        orchestrator.supabase.update_meeting_recording_expiry.assert_called_once()

        # Verify file was written
        assert temp_file.exists()
        assert temp_file.read_bytes() == mock_file_content

    @pytest.mark.asyncio
    async def test_download_failure_updates_status(self, orchestrator, tmp_path):
        """Test that download failure updates job status to failed."""
        temp_file = tmp_path / "test.mp4"

        orchestrator.supabase.download_from_storage = AsyncMock(
            side_effect=Exception("Storage error")
        )
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()

        with pytest.raises(Exception, match="Storage error"):
            await orchestrator.execute(
                job_id="job-fail",
                meeting_id="meeting-1",
                user_id="user-1",
                storage_path="path/file.mp4",
                temp_file=temp_file,
            )

        # Verify error status was set
        orchestrator.supabase.update_job_status.assert_called_with(
            "job-fail", "failed", "Storage error"
        )
        # Cleanup should NOT be called - we preserve files for retries
        orchestrator.supabase.cleanup_failed_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_transcription_failure_propagates(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that transcription failure updates status and triggers cleanup."""
        temp_file = tmp_path / "test.mp4"

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"content")
        orchestrator.ingestion.ingest = AsyncMock(
            side_effect=Exception("Transcription failed")
        )
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()

        with pytest.raises(Exception, match="Transcription failed"):
            await orchestrator.execute(
                job_id="job-trans-fail",
                meeting_id="meeting-2",
                user_id="user-2",
                storage_path="path/file.mp4",
                temp_file=temp_file,
            )

        orchestrator.supabase.update_job_status.assert_called_with(
            "job-trans-fail", "failed", "Transcription failed"
        )
        # Cleanup should NOT be called - we preserve files for retries
        orchestrator.supabase.cleanup_failed_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_analysis_failure_propagates(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that analysis failure updates status."""
        temp_file = tmp_path / "test.mp4"
        mock_transcript = {
            "segments": [{"text": "test", "start": 0, "end": 1}],  # Has speech
            "duration": 60,
        }

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"data")
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(
            side_effect=Exception("Analysis error")
        )
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()

        with pytest.raises(Exception, match="Analysis error"):
            await orchestrator.execute(
                job_id="job-analysis-fail",
                meeting_id="meeting-3",
                user_id="user-3",
                storage_path="path/file.mp4",
                temp_file=temp_file,
            )

        orchestrator.supabase.update_job_status.assert_called_with(
            "job-analysis-fail", "failed", "Analysis error"
        )
        # Cleanup should NOT be called - we preserve files for retries
        orchestrator.supabase.cleanup_failed_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_database_save_failure_propagates(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that database save failure updates status."""
        temp_file = tmp_path / "test.mp4"
        mock_transcript = {
            "segments": [{"text": "test", "start": 0, "end": 1}],
            "duration": 60,
        }
        mock_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 50,
                "segments": 1,
                "communication_tips": [],
            }
        }

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"data")
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_stats)
        orchestrator.supabase.save_analysis_results = AsyncMock(
            side_effect=Exception("Database error")
        )
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()

        with pytest.raises(Exception, match="Database error"):
            await orchestrator.execute(
                job_id="job-db-fail",
                meeting_id="meeting-4",
                user_id="user-4",
                storage_path="path/file.mp4",
                temp_file=temp_file,
            )

        orchestrator.supabase.update_job_status.assert_called_with(
            "job-db-fail", "failed", "Database error"
        )
        # Cleanup should NOT be called - we preserve files for retries
        orchestrator.supabase.cleanup_failed_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_meeting_analyzed_event_logged(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that meeting_analyzed event is logged on success."""
        temp_file = tmp_path / "test.mp4"
        mock_transcript = {
            "segments": [{"text": "test", "start": 0, "end": 1}],
            "duration": 60,
        }
        mock_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 50,
                "segments": 1,
                "communication_tips": [],
            }
        }

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"data")
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_stats)
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()

        await orchestrator.execute(
            job_id="job-analytics",
            meeting_id="meeting-5",
            user_id="user-5",
            storage_path="path/file.mp4",
            temp_file=temp_file,
        )

        # Verify meeting_analyzed event was logged
        orchestrator.supabase.log_analytics_event.assert_called()
        # Check that it was called with the event name
        found_meeting_analyzed = any(
            call.kwargs.get("event_name") == "meeting_analyzed"
            or (len(call.args) > 1 and call.args[1] == "meeting_analyzed")
            for call in orchestrator.supabase.log_analytics_event.call_args_list
        )
        assert found_meeting_analyzed

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_first_meeting_recorded_event(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that first_meeting_recorded event is logged for first job."""
        temp_file = tmp_path / "test.mp4"
        mock_transcript = {
            "segments": [{"text": "test", "start": 0, "end": 1}],
            "duration": 60,
        }
        mock_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 50,
                "segments": 1,
                "communication_tips": [],
            }
        }

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"data")
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_stats)
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(
            return_value=True
        )  # First job!
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()

        await orchestrator.execute(
            job_id="job-first",
            meeting_id="meeting-first",
            user_id="user-new",
            storage_path="path/file.mp4",
            temp_file=temp_file,
        )

        # Verify both events were logged
        assert orchestrator.supabase.log_analytics_event.call_count >= 2
        found_meeting_analyzed = any(
            call.kwargs.get("event_name") == "meeting_analyzed"
            or (len(call.args) > 1 and call.args[1] == "meeting_analyzed")
            for call in orchestrator.supabase.log_analytics_event.call_args_list
        )
        found_first_meeting = any(
            call.kwargs.get("event_name") == "first_meeting_recorded"
            or (len(call.args) > 1 and call.args[1] == "first_meeting_recorded")
            for call in orchestrator.supabase.log_analytics_event.call_args_list
        )
        assert found_meeting_analyzed
        assert found_first_meeting

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_analytics_failure_does_not_block_pipeline(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that analytics logging failure doesn't fail the job."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = (
            b"\x00\x00\x00\x18\x66\x74\x79\x70\x6d\x70\x34\x32" + b"data" * 30000
        )
        mock_transcript = {
            "segments": [{"text": "test", "start": 0, "end": 1}],
            "duration": 60,
        }
        mock_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 50,
                "segments": 1,
                "communication_tips": [],
            }
        }

        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_stats)
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock(
            side_effect=Exception("Analytics error")
        )
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()

        # Should not raise despite analytics failure
        await orchestrator.execute(
            job_id="job-analytics-fail",
            meeting_id="meeting-6",
            user_id="user-6",
            storage_path="path/file.mp4",
            temp_file=temp_file,
        )

        # Job should still complete successfully
        orchestrator.supabase.update_job_status.assert_called_with(
            "job-analytics-fail", "completed"
        )

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_recording_expiry_set_to_7_days(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that recording expiry is set to 7 days from completion."""
        temp_file = tmp_path / "test.mp4"
        mock_transcript = {
            "segments": [{"text": "test", "start": 0, "end": 1}],
            "duration": 60,
        }
        mock_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 50,
                "segments": 1,
                "communication_tips": [],
            }
        }

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"data")
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_stats)
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()

        await orchestrator.execute(
            job_id="job-expiry",
            meeting_id="meeting-7",
            user_id="user-7",
            storage_path="path/file.mp4",
            temp_file=temp_file,
        )

        # Verify expiry was set with ISO timestamp
        orchestrator.supabase.update_meeting_recording_expiry.assert_called_once()
        call_args = orchestrator.supabase.update_meeting_recording_expiry.call_args
        meeting_id = call_args[0][0]
        available_until = call_args[0][1]

        assert meeting_id == "meeting-7"
        # Verify it's a valid ISO timestamp (will raise if invalid)
        parsed_date = datetime.fromisoformat(available_until.replace("Z", "+00:00"))
        # Should be approximately 7 days from now
        expected_date = datetime.now(UTC) + timedelta(days=7)
        time_diff = abs((parsed_date - expected_date).total_seconds())
        assert time_diff < 10  # Within 10 seconds

    @pytest.mark.asyncio
    async def test_cleanup_not_called_on_failure(self, orchestrator, tmp_path):
        """Test that cleanup is NOT triggered for failed jobs - files preserved for retries."""
        temp_file = tmp_path / "test.mp4"

        orchestrator.supabase.download_from_storage = AsyncMock(
            side_effect=Exception("Download failed")
        )
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()

        with pytest.raises(Exception):
            await orchestrator.execute(
                job_id="job-cleanup",
                meeting_id="meeting-8",
                user_id="user-8",
                storage_path="path/file.mp4",
                temp_file=temp_file,
            )

        # Cleanup should NOT be called - we preserve files for retries
        orchestrator.supabase.cleanup_failed_job.assert_not_called()

    @pytest.mark.asyncio
    async def test_failed_job_preserves_status_update(self, orchestrator, tmp_path):
        """Test that failed jobs still update status even without cleanup."""
        temp_file = tmp_path / "test.mp4"

        orchestrator.supabase.download_from_storage = AsyncMock(
            side_effect=Exception("Download failed")
        )
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()

        with pytest.raises(Exception, match="Download failed"):
            await orchestrator.execute(
                job_id="job-cleanup-fail",
                meeting_id="meeting-9",
                user_id="user-9",
                storage_path="path/file.mp4",
                temp_file=temp_file,
            )

        # Job status should still be updated
        orchestrator.supabase.update_job_status.assert_called_with(
            "job-cleanup-fail", "failed", "Download failed"
        )
        # Cleanup should NOT be called
        orchestrator.supabase.cleanup_failed_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_speaker_records_created_correctly(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test that speaker records are created with correct structure."""
        temp_file = tmp_path / "test.mp4"
        mock_transcript = {
            "segments": [
                {"speaker": "A", "start": 0, "end": 5, "text": "Hello"},
                {"speaker": "B", "start": 5, "end": 10, "text": "Hi"},
            ],
            "duration": 60,
        }
        mock_stats = {
            "A": {
                "total_time": 30,
                "percentage": 50,
                "word_count": 25,
                "words_per_minute": 50,
                "segments": 1,
                "response_latency": 0,
                "response_count": 0,
                "quick_responses_percentage": 0,
                "times_interrupted": 0,
                "times_interrupting": 1,
                "interruption_rate": 2.0,
                "filler_words_total": 5,
                "filler_words_breakdown": {"um": 3, "uh": 2},
                "communication_tips": ["Tip 1"],
            },
            "B": {
                "total_time": 30,
                "percentage": 50,
                "word_count": 25,
                "words_per_minute": 50,
                "segments": 1,
                "response_latency": 1.5,
                "response_count": 1,
                "quick_responses_percentage": 0,
                "times_interrupted": 1,
                "times_interrupting": 0,
                "interruption_rate": 2.0,
                "filler_words_total": 0,
                "filler_words_breakdown": {},
                "communication_tips": [],
            },
        }

        orchestrator.supabase.download_from_storage = AsyncMock(return_value=b"data")
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.analysis.analyze = AsyncMock(return_value=mock_stats)
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()

        await orchestrator.execute(
            job_id="job-records",
            meeting_id="meeting-10",
            user_id="user-10",
            storage_path="path/file.mp4",
            temp_file=temp_file,
        )

        # Verify speaker records structure
        call_args = orchestrator.supabase.save_analysis_results.call_args
        speaker_records = call_args[0][1]

        assert len(speaker_records) == 2
        record_a = next(r for r in speaker_records if r["speaker_label"] == "A")
        record_b = next(r for r in speaker_records if r["speaker_label"] == "B")

        # Verify A's record
        assert record_a["job_id"] == "job-records"
        assert record_a["meeting_id"] == "meeting-10"
        assert record_a["created_by"] == "user-10"
        assert record_a["filler_words_total"] == 5
        assert record_a["filler_words_breakdown"] == {"um": 3, "uh": 2}

        # Verify B's record
        assert record_b["avg_response_latency_seconds"] == 1.5
        assert record_b["times_interrupted"] == 1


class TestAnonymousNotification:
    """Test suite for anonymous upload notification."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator instance with mocked dependencies."""
        with patch("app.services.orchestrator.SupabaseClient"), patch(
            "app.services.orchestrator.IngestionOrchestrator"
        ), patch("app.services.orchestrator.AnalysisOrchestrator"), patch(
            "app.services.orchestrator.ResendClient"
        ):
            orch = PipelineOrchestrator()
            # Add default mock for get_off_record_periods to all tests
            orch.supabase.get_off_record_periods = AsyncMock(return_value=[])
            return orch

    @pytest.mark.asyncio
    async def test_sends_notification_with_email(self, orchestrator):
        """Test that notification is sent when email is found."""
        speaker_stats = {
            "A": {
                "total_time": 60,
                "percentage": 100,
                "word_count": 100,
                "words_per_minute": 100,
                "filler_words_per_minute": 2.5,
                "times_interrupted": 0,
                "times_interrupting": 0,
            }
        }

        # Mock dependencies
        orchestrator.supabase.get_anonymous_upload_details = AsyncMock(
            return_value={"email": "user@example.com", "access_token": "test-token-123"}
        )
        orchestrator.resend.send_anonymous_upload_complete = AsyncMock(
            return_value={"status": "success", "email_id": "email_123"}
        )

        # Execute
        await orchestrator._send_anonymous_notification(
            job_id="job-123",
            meeting_id="meeting-456",
            speaker_stats=speaker_stats,
            duration_seconds=60,
        )

        # Verify email lookup was called
        orchestrator.supabase.get_anonymous_upload_details.assert_called_once_with(
            "meeting-456"
        )

        # Verify Resend was called with correct data
        orchestrator.resend.send_anonymous_upload_complete.assert_called_once()
        call_args = orchestrator.resend.send_anonymous_upload_complete.call_args
        assert call_args.kwargs["email"] == "user@example.com"
        assert "html_body" in call_args.kwargs
        # Verify HTML body contains meeting ID in analysis preview URL
        html_body = call_args.kwargs["html_body"]
        assert "meeting-456" in html_body  # Meeting ID in analysis preview URL

    @pytest.mark.asyncio
    async def test_handles_missing_email_gracefully(self, orchestrator):
        """Test that missing email is handled without raising exception."""
        speaker_stats = {"A": {"total_time": 60, "percentage": 100}}

        # Mock dependencies - no email found
        orchestrator.supabase.get_anonymous_upload_details = AsyncMock(
            return_value=None
        )
        orchestrator.resend.send_anonymous_upload_complete = AsyncMock()

        # Execute - should not raise
        await orchestrator._send_anonymous_notification(
            job_id="job-123",
            meeting_id="meeting-456",
            speaker_stats=speaker_stats,
            duration_seconds=60,
        )

        # Verify Resend was NOT called
        orchestrator.resend.send_anonymous_upload_complete.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_email_failure_gracefully(self, orchestrator):
        """Test that email sending failures don't raise exceptions."""
        speaker_stats = {"A": {"total_time": 60, "percentage": 100}}

        # Mock dependencies - Resend fails
        orchestrator.supabase.get_anonymous_upload_details = AsyncMock(
            return_value={"email": "user@example.com", "access_token": "test-token-123"}
        )
        orchestrator.resend.send_anonymous_upload_complete = AsyncMock(
            return_value={"status": "error", "error": "API error"}
        )

        # Execute - should not raise
        await orchestrator._send_anonymous_notification(
            job_id="job-123",
            meeting_id="meeting-456",
            speaker_stats=speaker_stats,
            duration_seconds=60,
        )

        # Verify Resend was called (error logged but not raised)
        orchestrator.resend.send_anonymous_upload_complete.assert_called_once()

    @pytest.mark.asyncio
    async def test_handles_database_error_gracefully(self, orchestrator):
        """Test that database errors are caught and logged."""
        speaker_stats = {"A": {"total_time": 60, "percentage": 100}}

        # Mock dependencies - database error
        orchestrator.supabase.get_anonymous_upload_details = AsyncMock(
            side_effect=Exception("Database error")
        )
        orchestrator.resend.send_anonymous_upload_complete = AsyncMock()

        # Execute - should not raise
        await orchestrator._send_anonymous_notification(
            job_id="job-123",
            meeting_id="meeting-456",
            speaker_stats=speaker_stats,
            duration_seconds=60,
        )

        # Verify Resend was NOT called
        orchestrator.resend.send_anonymous_upload_complete.assert_not_called()


class TestOffRecordFiltering:
    """Test suite for off-record period filtering logic."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator instance with mocked dependencies."""
        with patch("app.services.orchestrator.SupabaseClient"), patch(
            "app.services.orchestrator.IngestionOrchestrator"
        ), patch("app.services.orchestrator.AnalysisOrchestrator"), patch(
            "app.services.orchestrator.ResendClient"
        ):
            orch = PipelineOrchestrator()
            # Add default mock for save_transcript (dual-write to transcripts table)
            orch.supabase.save_transcript = AsyncMock()
            # Add default mock for single-speaker auto-assign
            orch.supabase.update_meeting_user_speaker = AsyncMock()
            # Add default mock for get_meeting (used in user speaker identification)
            orch.supabase.get_meeting = AsyncMock(return_value=None)
            return orch

    def create_segment(self, start: float, end: float, text: str = "test"):
        """Helper to create a transcript segment."""
        return {
            "start": start,
            "end": end,
            "text": text,
            "speaker": "A",
            "confidence": 0.95,
        }

    def create_off_record_period(
        self, placeholder_start: float, placeholder_end: float, actual_duration: float
    ):
        """Helper to create an off-record period."""
        return {
            "placeholderStart": placeholder_start,
            "placeholderEnd": placeholder_end,
            "actualDuration": actual_duration,
        }

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_case1_segment_before_off_record_period(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test Case 1: Segment entirely before off-record period (kept)."""
        # Setup
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment before off-record period
        mock_transcript = {
            "segments": [
                self.create_segment(0, 50, "Before off-record"),
            ]
        }

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was kept (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 1
        assert saved_transcript["segments"][0]["text"] == "Before off-record"
        assert saved_transcript["segments"][0]["start"] == 0
        assert saved_transcript["segments"][0]["end"] == 50

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_case2_segment_after_off_record_period(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test Case 2: Segment entirely after off-record period (kept)."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment after off-record period
        mock_transcript = {
            "segments": [
                self.create_segment(150, 200, "After off-record"),
            ]
        }

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was kept (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 1
        assert saved_transcript["segments"][0]["text"] == "After off-record"
        assert saved_transcript["segments"][0]["start"] == 150
        assert saved_transcript["segments"][0]["end"] == 200

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_case3_segment_entirely_within_off_record(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test Case 3: Segment entirely within off-record period (removed)."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment within off-record period
        mock_transcript = {
            "segments": [
                self.create_segment(101, 104, "Should be removed"),
            ]
        }

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was removed (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 0

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_case4_segment_spans_off_record_period(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test Case 4: Segment spans off-record period (split into 2)."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment spanning off-record period
        mock_transcript = {
            "segments": [
                self.create_segment(50, 150, "Should be split"),
            ]
        }

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was split into 2 parts (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 2

        # First part: before off-record
        assert saved_transcript["segments"][0]["start"] == 50
        assert saved_transcript["segments"][0]["end"] == 100
        assert saved_transcript["segments"][0]["text"] == "Should be split"

        # Second part: after off-record
        assert saved_transcript["segments"][1]["start"] == 105
        assert saved_transcript["segments"][1]["end"] == 150
        assert saved_transcript["segments"][1]["text"] == "Should be split"

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_case5_segment_starts_before_ends_during(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test Case 5: Segment starts before, ends during (trimmed)."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment starts before, ends during
        mock_transcript = {
            "segments": [
                self.create_segment(50, 103, "Should be trimmed"),
            ]
        }

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was trimmed (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 1
        assert saved_transcript["segments"][0]["start"] == 50
        assert saved_transcript["segments"][0]["end"] == 100
        assert saved_transcript["segments"][0]["text"] == "Should be trimmed"

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_case6_segment_starts_during_ends_after(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test Case 6: Segment starts during, ends after (trimmed)."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment starts during, ends after
        mock_transcript = {
            "segments": [
                self.create_segment(102, 150, "Should be trimmed"),
            ]
        }

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was trimmed (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 1
        assert saved_transcript["segments"][0]["start"] == 105
        assert saved_transcript["segments"][0]["end"] == 150
        assert saved_transcript["segments"][0]["text"] == "Should be trimmed"

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_empty_segments_list(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test edge case: Empty segments list."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Empty segments
        mock_transcript = {"segments": []}

        off_record_periods = [self.create_off_record_period(100, 105, 300)]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify still empty (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 0

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_no_off_record_periods(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test edge case: No off-record periods."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        mock_transcript = {
            "segments": [
                self.create_segment(0, 50, "Segment 1"),
                self.create_segment(50, 100, "Segment 2"),
            ]
        }

        # No off-record periods (empty list)
        off_record_periods = []

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify all segments kept unchanged (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 2
        assert saved_transcript["segments"][0]["text"] == "Segment 1"
        assert saved_transcript["segments"][1]["text"] == "Segment 2"

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.validate_speech_content")
    @patch("app.services.orchestrator.validate_duration")
    @patch("app.services.orchestrator.validate_file", return_value=(True, None))
    async def test_multiple_off_record_periods(
        self,
        mock_validate_file,
        mock_validate_duration,
        mock_validate_speech,
        orchestrator,
        tmp_path,
    ):
        """Test edge case: Multiple off-record periods."""
        temp_file = tmp_path / "test.mp4"
        mock_file_content = b"\x00\x00\x00\x18" + b"video" * 30000
        temp_file.write_bytes(mock_file_content)

        # Segment spanning multiple off-record periods
        mock_transcript = {
            "segments": [
                self.create_segment(0, 300, "Long segment"),
            ]
        }

        # Multiple off-record periods
        off_record_periods = [
            self.create_off_record_period(50, 55, 120),
            self.create_off_record_period(150, 155, 200),
        ]

        # Mock dependencies
        orchestrator.supabase.download_from_storage = AsyncMock(
            return_value=mock_file_content
        )
        orchestrator.supabase.get_off_record_periods = AsyncMock(
            return_value=off_record_periods
        )
        orchestrator.ingestion.ingest = AsyncMock(return_value=mock_transcript)
        orchestrator.analysis.analyze = AsyncMock(
            return_value={
                "A": {
                    "total_time": 60,
                    "percentage": 100,
                    "word_count": 50,
                    "words_per_minute": 50,
                    "segments": 1,
                    "response_latency": 0,
                    "response_count": 0,
                    "quick_responses_percentage": 0,
                    "times_interrupted": 0,
                    "times_interrupting": 0,
                    "interruption_rate": 0,
                    "filler_words_total": 0,
                    "filler_words_breakdown": {},
                    "communication_tips": [],
                }
            }
        )
        orchestrator.supabase.update_meeting_metadata = AsyncMock()
        orchestrator.supabase.update_job_status = AsyncMock()
        orchestrator.supabase.cleanup_failed_job = AsyncMock()
        orchestrator.supabase.save_analysis_results = AsyncMock()
        orchestrator.supabase.update_meeting_recording_expiry = AsyncMock()
        orchestrator.supabase.log_analytics_event = AsyncMock()
        orchestrator.supabase.is_first_completed_job = AsyncMock(return_value=False)

        # Execute
        await orchestrator.execute(
            job_id="job-123",
            meeting_id="meeting-456",
            storage_path="path/file.mp4",
            user_id="user-789",
            temp_file=temp_file,
        )

        # Verify segment was split into 3 parts (check via save_transcript which receives filtered transcript)
        call_args = orchestrator.supabase.save_transcript.call_args
        saved_transcript = call_args.kwargs["transcription_result"]
        assert len(saved_transcript["segments"]) == 3

        # Part 1: 0-50
        assert saved_transcript["segments"][0]["start"] == 0
        assert saved_transcript["segments"][0]["end"] == 50

        # Part 2: 55-150
        assert saved_transcript["segments"][1]["start"] == 55
        assert saved_transcript["segments"][1]["end"] == 150

        # Part 3: 155-300
        assert saved_transcript["segments"][2]["start"] == 155
        assert saved_transcript["segments"][2]["end"] == 300


# Mark all test classes as unit tests
pytest.mark.unit(TestPipelineOrchestrator)
pytest.mark.unit(TestAnonymousNotification)
pytest.mark.unit(TestOffRecordFiltering)
