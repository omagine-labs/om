"""
Pytest configuration and global fixtures.

CRITICAL: This file prevents tests from loading .env files and accessing real API keys.
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock


def pytest_configure(config):
    """
    Pytest hook that runs BEFORE test collection and imports.

    This is the EARLIEST point where we can intercept environment loading.
    We set test environment variables here so that when app.config is imported,
    it reads these test values instead of real credentials.
    """
    # Set all API keys to empty strings BEFORE any app code imports
    test_env_vars = {
        "RESEND_API_KEY": "",
        "SUPABASE_URL": "",
        "SUPABASE_SECRET_KEY": "",
        "GEMINI_API_KEY": "",
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "ASSEMBLYAI_API_KEY": "",
        "INTERCOM_API_KEY": "",
        "LANGFUSE_PUBLIC_KEY": "",
        "LANGFUSE_SECRET_KEY": "",
        "API_KEY": "test-api-key-12345",
        "HOST": "0.0.0.0",
        "PORT": "8000",
    }

    # Update os.environ with test values
    os.environ.update(test_env_vars)

    # Now mock load_dotenv to prevent it from overwriting our test values
    # We need to do this at the module level, not in a context manager
    import dotenv

    dotenv.load_dotenv = lambda *args, **kwargs: True

    # If app.config was already imported, reload it to pick up test env vars
    if "app.config" in sys.modules:
        import importlib

        importlib.reload(sys.modules["app.config"])


@pytest.fixture(autouse=True)
def mock_external_services():
    """
    Mock all external service clients globally to prevent accidental API calls.

    This ensures tests NEVER hit real APIs even if API keys leak through.
    """
    # Mock Resend
    with patch("resend.Emails.send") as mock_resend:
        mock_resend.return_value = {"id": "test_email_id"}

        # Mock AssemblyAI
        with patch("assemblyai.Transcriber") as mock_assemblyai:
            mock_assemblyai.return_value.transcribe.return_value = MagicMock(
                text="Test transcript",
                words=[],
            )

            # Mock Supabase client
            with patch("app.services.supabase_client.create_client") as mock_supabase:
                mock_supabase.return_value = MagicMock()

                yield


@pytest.fixture
def mock_settings():
    """
    Provide test-safe settings object.

    Use this fixture in tests that need to test settings behavior.
    """
    from app.config import Settings

    return Settings(
        host="0.0.0.0",
        port=8000,
        supabase_url="http://test.supabase.co",
        supabase_secret_key="test-secret-key",
        gemini_api_key="",
        openai_api_key="",
        anthropic_api_key="",
        assemblyai_api_key="",
        resend_api_key="",
    )
