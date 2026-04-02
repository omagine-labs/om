"""
Tests for Resend email client.
"""

import pytest
from unittest.mock import patch
from app.services.resend_client import ResendClient


class TestResendClientInit:
    """Test suite for ResendClient initialization."""

    def test_init_with_api_key(self):
        """Test initialization with explicit API key."""
        with patch("resend.api_key", None):
            client = ResendClient(api_key="test_key_123")
            assert client.api_key == "test_key_123"

    def test_init_without_api_key_uses_settings(self):
        """Test initialization falls back to settings when no key provided."""
        with patch("app.services.resend_client.settings") as mock_settings:
            mock_settings.resend_api_key = "settings_key_456"
            client = ResendClient()
            assert client.api_key == "settings_key_456"

    def test_init_sets_resend_api_key_when_provided(self):
        """Test that resend.api_key is set when API key is provided."""
        with patch("app.services.resend_client.resend") as mock_resend:
            ResendClient(api_key="test_key")
            assert mock_resend.api_key == "test_key"


class TestSendHtmlEmail:
    """Test suite for send_html_email method."""

    @pytest.mark.asyncio
    async def test_send_email_success(self):
        """Test successful email send returns success status."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_abc123"}

            client = ResendClient(api_key="test_key")
            result = await client.send_html_email(
                to_email="test@example.com",
                subject="Test Subject",
                html_body="<h1>Test Email</h1>",
            )

            assert result["status"] == "success"
            assert result["email_id"] == "email_abc123"
            assert result["to"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_send_email_no_api_key_saves_to_file(self):
        """Test that missing API key results in development mode (save to file)."""
        from pathlib import Path

        with patch("app.services.resend_client.settings") as mock_settings:
            mock_settings.resend_api_key = ""  # Mock settings to also have no key
            # Create a real Path object for temp_dir
            mock_settings.temp_dir = Path("/tmp")

            client = ResendClient(api_key="")

            # Mock the file write operation and browser opening
            with patch.object(Path, "mkdir"), patch.object(
                Path, "write_text"
            ) as mock_write, patch("app.services.resend_client.webbrowser.open"):
                result = await client.send_html_email(
                    to_email="test@example.com",
                    subject="Test Subject",
                    html_body="<h1>Test Email</h1>",
                )

                assert result["status"] == "development"
                assert "file_path" in result
                assert result["to"] == "test@example.com"
                # Verify write_text was called with the HTML content
                mock_write.assert_called_once_with(
                    "<h1>Test Email</h1>", encoding="utf-8"
                )

    @pytest.mark.asyncio
    async def test_send_email_api_error_returns_error_status(self):
        """Test that API errors return error status with message."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("API connection failed")

            client = ResendClient(api_key="test_key")
            result = await client.send_html_email(
                to_email="test@example.com",
                subject="Test Subject",
                html_body="<h1>Test Email</h1>",
            )

            assert result["status"] == "error"
            assert "API connection failed" in result["error"]

    @pytest.mark.asyncio
    async def test_send_email_uses_default_from_settings(self):
        """Test that from email and name use settings defaults."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send, patch(
            "app.services.resend_client.settings"
        ) as mock_settings:

            mock_settings.email_from_address = "notifications@omaginelabs.com"
            mock_settings.email_from_name = "Om by Omagine Labs"
            mock_send.return_value = {"id": "email_123"}

            client = ResendClient(api_key="test_key")
            await client.send_html_email(
                to_email="test@example.com",
                subject="Test Subject",
                html_body="<h1>Test</h1>",
            )

            # Verify the from field format
            call_args = mock_send.call_args[0][0]
            assert (
                call_args["from"]
                == "Om by Omagine Labs <notifications@omaginelabs.com>"
            )

    @pytest.mark.asyncio
    async def test_send_email_uses_custom_from_fields(self):
        """Test that custom from email and name override defaults."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_123"}

            client = ResendClient(api_key="test_key")
            await client.send_html_email(
                to_email="test@example.com",
                subject="Test Subject",
                html_body="<h1>Test</h1>",
                from_email="custom@example.com",
                from_name="Custom Name",
            )

            # Verify custom from field is used
            call_args = mock_send.call_args[0][0]
            assert call_args["from"] == "Custom Name <custom@example.com>"

    @pytest.mark.asyncio
    async def test_send_email_passes_all_parameters(self):
        """Test that all email parameters are passed to Resend API."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_123"}

            client = ResendClient(api_key="test_key")
            await client.send_html_email(
                to_email="recipient@example.com",
                subject="Important Subject",
                html_body="<h1>HTML Content</h1>",
                from_email="sender@example.com",
                from_name="Sender Name",
            )

            # Verify all parameters passed correctly
            call_args = mock_send.call_args[0][0]
            assert call_args["to"] == "recipient@example.com"
            assert call_args["subject"] == "Important Subject"
            assert call_args["html"] == "<h1>HTML Content</h1>"
            assert call_args["from"] == "Sender Name <sender@example.com>"


class TestSendAnonymousUploadComplete:
    """Test suite for send_anonymous_upload_complete convenience method."""

    @pytest.mark.asyncio
    async def test_uses_predefined_subject(self):
        """Test that convenience method uses correct subject line."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_123"}

            client = ResendClient(api_key="test_key")
            await client.send_anonymous_upload_complete(
                email="test@example.com", html_body="<h1>Your analysis is ready!</h1>"
            )

            # Verify subject is the predefined one
            call_args = mock_send.call_args[0][0]
            assert call_args["subject"] == "🎉 Your Meeting Analysis is Ready!"

    @pytest.mark.asyncio
    async def test_passes_html_body_correctly(self):
        """Test that HTML body is passed through correctly."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_123"}

            html_content = "<div>Custom HTML content with metrics</div>"

            client = ResendClient(api_key="test_key")
            await client.send_anonymous_upload_complete(
                email="user@example.com", html_body=html_content
            )

            # Verify HTML body is passed correctly
            call_args = mock_send.call_args[0][0]
            assert call_args["html"] == html_content
            assert call_args["to"] == "user@example.com"

    @pytest.mark.asyncio
    async def test_returns_result_from_send_html_email(self):
        """Test that convenience method returns result from underlying method."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_xyz789"}

            client = ResendClient(api_key="test_key")
            result = await client.send_anonymous_upload_complete(
                email="test@example.com", html_body="<h1>Content</h1>"
            )

            assert result["status"] == "success"
            assert result["email_id"] == "email_xyz789"
            assert result["to"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_handles_errors_gracefully(self):
        """Test that errors are handled gracefully by convenience method."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Network timeout")

            client = ResendClient(api_key="test_key")
            result = await client.send_anonymous_upload_complete(
                email="test@example.com", html_body="<h1>Content</h1>"
            )

            assert result["status"] == "error"
            assert "Network timeout" in result["error"]


class TestLoggingBehavior:
    """Test suite for logging behavior."""

    @pytest.mark.asyncio
    async def test_logs_info_when_saving_to_file(self, caplog):
        """Test that development mode logs info about saving email to file."""
        import logging
        from pathlib import Path

        caplog.set_level(logging.INFO)

        with patch("app.services.resend_client.settings") as mock_settings:
            mock_settings.resend_api_key = ""  # Mock settings to have no key
            # Create a real Path object for temp_dir
            mock_settings.temp_dir = Path("/tmp")

            client = ResendClient(api_key="")

            # Mock the file write operation and browser opening
            with patch.object(Path, "mkdir"), patch.object(Path, "write_text"), patch(
                "app.services.resend_client.webbrowser.open"
            ):
                await client.send_html_email(
                    to_email="test@example.com",
                    subject="Test",
                    html_body="<h1>Test</h1>",
                )

                assert "Development mode: Email saved to" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_success_with_email_id(self, caplog):
        """Test that successful send logs email ID."""
        import logging

        caplog.set_level(logging.INFO)

        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_success_123"}

            client = ResendClient(api_key="test_key")
            await client.send_html_email(
                to_email="test@example.com", subject="Test", html_body="<h1>Test</h1>"
            )

            assert "Email sent successfully" in caplog.text
            assert "test@example.com" in caplog.text
            assert "email_success_123" in caplog.text

    @pytest.mark.asyncio
    async def test_logs_error_with_exception_info(self, caplog):
        """Test that errors are logged with exception details."""
        with patch("app.services.resend_client.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Test error message")

            client = ResendClient(api_key="test_key")
            await client.send_html_email(
                to_email="test@example.com", subject="Test", html_body="<h1>Test</h1>"
            )

            assert "Failed to send email via Resend" in caplog.text
            assert "Test error message" in caplog.text
