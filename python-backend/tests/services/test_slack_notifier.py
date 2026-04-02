"""
Tests for Slack notification service.
"""

import pytest
from unittest.mock import patch, AsyncMock
import httpx

from app.services.slack_notifier import send_llm_failure_alert, _truncate


class TestTruncate:
    """Test suite for _truncate helper function."""

    def test_truncate_short_text_unchanged(self):
        """Test that short text is returned unchanged."""
        text = "Short text"
        result = _truncate(text, max_length=500)
        assert result == "Short text"

    def test_truncate_exact_length_unchanged(self):
        """Test that text at exact max length is unchanged."""
        text = "x" * 500
        result = _truncate(text, max_length=500)
        assert result == text
        assert len(result) == 500

    def test_truncate_long_text_adds_ellipsis(self):
        """Test that long text is truncated with ellipsis."""
        text = "x" * 600
        result = _truncate(text, max_length=500)
        assert len(result) == 500
        assert result.endswith("...")

    def test_truncate_empty_string(self):
        """Test that empty string returns empty string."""
        result = _truncate("", max_length=500)
        assert result == ""

    def test_truncate_none_returns_empty(self):
        """Test that None-like falsy value returns empty string."""
        result = _truncate(None, max_length=500)
        assert result == ""


class TestSendLlmFailureAlert:
    """Test suite for send_llm_failure_alert function."""

    @pytest.mark.asyncio
    async def test_skips_notification_when_no_webhook_url(self):
        """Test that notification is skipped when webhook URL is not configured."""
        with patch("app.services.slack_notifier.settings") as mock_settings:
            mock_settings.slack_webhook_url = ""

            result = await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            assert result is False

    @pytest.mark.asyncio
    async def test_sends_notification_successfully(self):
        """Test successful notification send."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            # Create a mock client and response
            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            assert result is True
            mock_client.post.assert_called_once()

            # Verify the webhook URL was used
            call_args = mock_client.post.call_args
            assert call_args[0][0] == "https://hooks.slack.com/test"

    @pytest.mark.asyncio
    async def test_includes_all_required_fields_in_payload(self):
        """Test that payload includes all required fields."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await send_llm_failure_alert(
                job_id="job_456",
                speaker="Speaker B",
                stage="general_analysis",
                error_message="JSON parse error",
                meeting_id="meeting_789",
            )

            # Get the JSON payload
            call_args = mock_client.post.call_args
            payload = call_args[1]["json"]

            # Verify payload structure
            assert "blocks" in payload
            assert "text" in payload

            # Verify fallback text contains key info
            assert "general_analysis" in payload["text"]
            assert "Speaker B" in payload["text"]
            assert "job_456" in payload["text"]

    @pytest.mark.asyncio
    async def test_includes_optional_input_prompt(self):
        """Test that input prompt is included when provided."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
                input_prompt="Analyze this transcript for clarity...",
            )

            # Get the JSON payload and convert to string for checking
            call_args = mock_client.post.call_args
            payload = call_args[1]["json"]
            payload_str = str(payload)

            assert "Input Prompt" in payload_str

    @pytest.mark.asyncio
    async def test_includes_extra_context(self):
        """Test that extra context is included when provided."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
                extra_context={
                    "talk_time_percentage": 45.5,
                    "word_count": 1234,
                },
            )

            # Get the JSON payload and convert to string for checking
            call_args = mock_client.post.call_args
            payload = call_args[1]["json"]
            payload_str = str(payload)

            assert "Additional Context" in payload_str
            assert "talk_time_percentage" in payload_str

    @pytest.mark.asyncio
    async def test_handles_http_error_gracefully(self):
        """Test that HTTP errors are handled gracefully."""
        from unittest.mock import MagicMock

        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 500

            # raise_for_status is a regular method, not async
            mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Server Error", request=MagicMock(), response=mock_response
            )
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            # Should return False but not raise exception
            assert result is False

    @pytest.mark.asyncio
    async def test_handles_request_error_gracefully(self):
        """Test that network/request errors are handled gracefully."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_client.post = AsyncMock(
                side_effect=httpx.RequestError("Connection refused")
            )
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            # Should return False but not raise exception
            assert result is False

    @pytest.mark.asyncio
    async def test_handles_unexpected_error_gracefully(self):
        """Test that unexpected errors are handled gracefully."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_client.post = AsyncMock(side_effect=Exception("Unexpected error"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            # Should return False but not raise exception
            assert result is False

    @pytest.mark.asyncio
    async def test_truncates_long_error_messages(self):
        """Test that long error messages are truncated."""
        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            # Create a very long error message
            long_error = "x" * 1000

            result = await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message=long_error,
            )

            assert result is True

            # Verify the error was truncated in the payload
            call_args = mock_client.post.call_args
            payload = call_args[1]["json"]
            payload_str = str(payload)

            # Should contain truncated error (ends with ...)
            assert "..." in payload_str


class TestLoggingBehavior:
    """Test suite for logging behavior."""

    @pytest.mark.asyncio
    async def test_logs_debug_when_no_webhook_configured(self, caplog):
        """Test that missing webhook URL logs debug message."""
        import logging

        caplog.set_level(logging.DEBUG)

        with patch("app.services.slack_notifier.settings") as mock_settings:
            mock_settings.slack_webhook_url = ""

            await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            assert "Slack notification skipped" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_info_on_successful_send(self, caplog):
        """Test that successful send logs info message."""
        import logging

        caplog.set_level(logging.INFO)

        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            assert "Slack notification sent" in caplog.text
            assert "agentic_analysis" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_warning_on_http_error(self, caplog):
        """Test that HTTP errors log warning message."""
        import logging
        from unittest.mock import MagicMock

        caplog.set_level(logging.WARNING)

        with patch("app.services.slack_notifier.settings") as mock_settings, patch(
            "app.services.slack_notifier.httpx.AsyncClient"
        ) as mock_client_class:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"

            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 500

            # raise_for_status is a regular method, not async
            mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Server Error", request=MagicMock(), response=mock_response
            )
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await send_llm_failure_alert(
                job_id="job_123",
                speaker="Speaker A",
                stage="agentic_analysis",
                error_message="Test error",
            )

            assert "Failed to send Slack notification" in caplog.text
            assert "HTTP" in caplog.text
