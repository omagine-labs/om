"""
Resend email client for sending anonymous upload notifications.
"""

import logging
import resend
import webbrowser
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)


class ResendClient:
    """Client for sending emails via Resend API."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Resend client.

        Args:
            api_key: Resend API key. If None, uses RESEND_API_KEY from environment.
        """
        self.api_key = api_key or settings.resend_api_key
        if self.api_key:
            resend.api_key = self.api_key

    def _save_email_to_file(
        self, to_email: str, subject: str, html_body: str
    ) -> Dict[str, Any]:
        """
        Save email HTML to file and open in browser (development mode).

        Args:
            to_email: Recipient email (for logging)
            subject: Email subject (for logging)
            html_body: HTML to save

        Returns:
            Response dict indicating file was saved
        """
        try:
            # Create temp directory if it doesn't exist
            temp_dir = settings.temp_dir
            temp_dir.mkdir(parents=True, exist_ok=True)

            # Generate filename from subject
            safe_subject = "".join(c if c.isalnum() else "_" for c in subject)
            filename = f"email_{safe_subject}.html"
            filepath = temp_dir / filename

            # Write HTML to file
            filepath.write_text(html_body, encoding="utf-8")

            # Try to open in browser (may not work in Docker)
            file_url = filepath.absolute().as_uri()
            try:
                webbrowser.open(file_url)
                opened_message = "and opened in browser"
            except Exception:
                # Browser opening may fail in Docker/headless environments
                opened_message = "(open manually in browser)"

            logger.info(
                f"📧 Development mode: Email saved to {filepath} {opened_message}"
            )
            logger.info(f"   To: {to_email}")
            logger.info(f"   Subject: {subject}")
            logger.info(f"   File URL: {file_url}")

            return {
                "status": "development",
                "file_path": str(filepath),
                "to": to_email,
                "message": "Email HTML saved and opened in browser",
            }

        except Exception as e:
            logger.error(f"Failed to save email to file: {str(e)}", exc_info=True)
            return {"status": "error", "error": str(e)}

    async def send_html_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send HTML email via Resend.

        In development (no API key), saves HTML to temp file and opens in browser.

        Args:
            to_email: Recipient email address
            subject: Email subject line
            html_body: Full HTML email body
            from_email: Sender email (default: settings.email_from_address)
            from_name: Sender name (default: settings.email_from_name)

        Returns:
            Response dict with status and email_id

        Example:
            >>> client = ResendClient()
            >>> result = await client.send_html_email(
            ...     to_email="user@example.com",
            ...     subject="Test Email",
            ...     html_body="<h1>Hello</h1>"
            ... )
            >>> print(result)
            {"status": "success", "email_id": "abc123", "to": "user@example.com"}
        """
        if not self.api_key:
            # Development mode: save to file and open in browser
            return self._save_email_to_file(to_email, subject, html_body)

        try:
            from_email = from_email or settings.email_from_address
            from_name = from_name or settings.email_from_name
            from_field = f"{from_name} <{from_email}>"

            response = resend.Emails.send(
                {
                    "from": from_field,
                    "to": to_email,
                    "subject": subject,
                    "html": html_body,
                }
            )

            logger.info(f"Email sent successfully to {to_email} (ID: {response['id']})")

            return {
                "status": "success",
                "email_id": response["id"],
                "to": to_email,
            }

        except Exception as e:
            logger.error(f"Failed to send email via Resend: {str(e)}", exc_info=True)
            return {"status": "error", "error": str(e)}

    async def send_anonymous_upload_complete(
        self,
        email: str,
        html_body: str,
    ) -> Dict[str, Any]:
        """
        Send anonymous upload completion notification.

        This is a convenience method that uses a pre-defined subject line
        for anonymous upload notifications.

        Args:
            email: Recipient email
            html_body: Pre-generated HTML from email_preview.py

        Returns:
            Response dict with status and email_id

        Example:
            >>> from app.services.email_preview import generate_email_preview
            >>> html = generate_email_preview(...)
            >>> result = await client.send_anonymous_upload_complete(
            ...     email="user@example.com",
            ...     html_body=html
            ... )
        """
        return await self.send_html_email(
            to_email=email,
            subject="🎉 Your Meeting Analysis is Ready!",
            html_body=html_body,
        )
