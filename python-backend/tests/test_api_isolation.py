"""
Test to verify that tests are completely isolated from real API keys.

This test explicitly checks that .env files are NOT loaded during tests.
"""


def test_no_real_api_keys_accessible():
    """
    Verify tests cannot access real API keys from .env files.

    This is a critical security/cost control measure to prevent:
    - Accidentally hitting real APIs during tests
    - Exhausting API rate limits (e.g., Resend's 3,000 emails/month)
    - Incurring costs from API usage
    """
    from app.config import settings

    # All API keys should be empty strings (as set in conftest.py)
    assert settings.resend_api_key == "", (
        f"CRITICAL: Test has access to real Resend API key! "
        f"This could exhaust the 3,000 email/month limit. "
        f"Key starts with: {settings.resend_api_key[:10] if settings.resend_api_key else 'N/A'}"
    )

    assert settings.gemini_api_key == "", (
        f"CRITICAL: Test has access to real Gemini API key! "
        f"Key starts with: {settings.gemini_api_key[:10] if settings.gemini_api_key else 'N/A'}"
    )

    assert settings.openai_api_key == "", (
        f"CRITICAL: Test has access to real OpenAI API key! "
        f"Key starts with: {settings.openai_api_key[:10] if settings.openai_api_key else 'N/A'}"
    )

    assert settings.anthropic_api_key == "", (
        f"CRITICAL: Test has access to real Anthropic API key! "
        f"Key starts with: {settings.anthropic_api_key[:10] if settings.anthropic_api_key else 'N/A'}"
    )

    assert settings.assemblyai_api_key == "", (
        f"CRITICAL: Test has access to real AssemblyAI API key! "
        f"Key starts with: {settings.assemblyai_api_key[:10] if settings.assemblyai_api_key else 'N/A'}"
    )

    assert settings.supabase_secret_key == "", (
        f"CRITICAL: Test has access to real Supabase secret key! "
        f"Key starts with: {settings.supabase_secret_key[:10] if settings.supabase_secret_key else 'N/A'}"
    )

    # Supabase URL should also be empty (not the real production/local URL)
    assert settings.supabase_url == "", (
        f"CRITICAL: Test has access to real Supabase URL! "
        f"URL: {settings.supabase_url}"
    )


def test_conftest_prevents_env_loading():
    """
    Verify that conftest.py successfully prevents .env file loading.

    This test checks that the isolation mechanism is working correctly.
    """
    import os
    from pathlib import Path

    # Check that .env.local exists (so we know it COULD have been loaded)
    env_local = Path(__file__).parent.parent / ".env.local"
    assert (
        env_local.exists()
    ), "This test assumes .env.local exists to verify it's being blocked"

    # But the environment variables should be the test values, not real ones
    assert (
        os.environ.get("RESEND_API_KEY") == ""
    ), "Environment variable RESEND_API_KEY should be empty in tests"

    assert (
        os.environ.get("API_KEY") == "test-api-key-12345"
    ), "Environment variable API_KEY should be the test value"
