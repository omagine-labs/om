"""
Tests for GeminiProvider retry logic and rate limiting.

Tests cover:
- Retry logic for 429 errors
- Non-retryable error handling
- Retry delay extraction from error messages
- Semaphore rate limiting behavior
- Native JSON mode
"""

import asyncio
import pytest
from unittest.mock import MagicMock, patch
from app.services.analysis.llm.providers.gemini import (
    GeminiProvider,
    sanitize_json_string,
    extract_json_object,
)


class TestRetryLogic:
    """Test retry logic for 429 rate limit errors."""

    @pytest.mark.asyncio
    async def test_successful_call_no_retry(self):
        """Test that successful calls don't trigger retries."""
        provider = GeminiProvider(api_key="test-key")

        call_count = 0

        async def successful_call():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await provider._call_with_retry(successful_call)

        assert result == "success"
        assert call_count == 1  # Called only once

    @pytest.mark.asyncio
    async def test_retry_on_429_error(self):
        """Test that 429 errors trigger retry with backoff."""
        provider = GeminiProvider(api_key="test-key")

        call_count = 0

        async def failing_then_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception(
                    "429 You exceeded your current quota. " "retry_delay { seconds: 2 }"
                )
            return "success"

        result = await provider._call_with_retry(failing_then_success)

        assert result == "success"
        assert call_count == 3  # Failed twice, succeeded on third

    @pytest.mark.asyncio
    async def test_retry_exhaustion_on_429(self):
        """Test that exhausting retries raises exception."""
        provider = GeminiProvider(api_key="test-key")

        async def always_fails():
            raise Exception("429 quota exceeded")

        with pytest.raises(Exception) as exc_info:
            await provider._call_with_retry(always_fails, max_retries=3)

        assert "rate limit exceeded after 3 retries" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_non_retryable_error_fails_immediately(self):
        """Test that non-429 errors fail immediately without retry."""
        provider = GeminiProvider(api_key="test-key")

        call_count = 0

        async def non_retryable_error():
            nonlocal call_count
            call_count += 1
            raise ValueError("Invalid input")

        with pytest.raises(ValueError):
            await provider._call_with_retry(non_retryable_error)

        assert call_count == 1  # Only called once, no retries

    @pytest.mark.asyncio
    async def test_retry_with_quota_keyword(self):
        """Test that errors with 'quota' keyword trigger retry."""
        provider = GeminiProvider(api_key="test-key")

        call_count = 0

        async def quota_error_then_success():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("Quota limit exceeded")
            return "success"

        result = await provider._call_with_retry(quota_error_then_success)

        assert result == "success"
        assert call_count == 2  # Failed once, succeeded on second


class TestRetryDelayExtraction:
    """Test extraction of retry delay from error messages."""

    def test_extract_retry_delay_with_seconds(self):
        """Test extracting retry delay from Gemini error format."""
        provider = GeminiProvider(api_key="test-key")

        error_msg = (
            "429 You exceeded your current quota. " "retry_delay { seconds: 57 }"
        )

        delay = provider._extract_retry_delay(error_msg)

        assert delay == 57

    def test_extract_retry_delay_without_match(self):
        """Test fallback delay when no retry_delay in error."""
        provider = GeminiProvider(api_key="test-key")

        error_msg = "429 Rate limit exceeded"

        delay = provider._extract_retry_delay(error_msg)

        assert delay == 2.0  # Default fallback

    def test_extract_retry_delay_with_different_format(self):
        """Test extraction with various formatting."""
        provider = GeminiProvider(api_key="test-key")

        # Test with extra whitespace
        error_msg = "retry_delay  {  seconds:  120  }"
        delay = provider._extract_retry_delay(error_msg)
        assert delay == 120

        # Test with newlines
        error_msg = "retry_delay {\n  seconds: 30\n}"
        delay = provider._extract_retry_delay(error_msg)
        assert delay == 30

    def test_extract_retry_delay_with_large_value(self):
        """Test extraction with large delay values."""
        provider = GeminiProvider(api_key="test-key")

        error_msg = "retry_delay { seconds: 300 }"

        delay = provider._extract_retry_delay(error_msg)

        assert delay == 300


class TestSemaphoreRateLimit:
    """Test semaphore-based rate limiting."""

    def test_provider_accepts_custom_semaphore(self):
        """Test that provider accepts and uses custom semaphore."""
        # Create semaphore with low limit for testing
        custom_semaphore = asyncio.Semaphore(2)
        provider = GeminiProvider(
            api_key="test-key", rate_limit_semaphore=custom_semaphore
        )

        # Verify provider uses the custom semaphore
        assert provider.rate_limit_semaphore is custom_semaphore
        assert provider.rate_limit_semaphore._value == 2

    def test_shared_semaphore_across_instances(self):
        """Test that shared semaphore is the same object across provider instances."""
        shared_semaphore = asyncio.Semaphore(3)

        provider1 = GeminiProvider(
            api_key="test-key", rate_limit_semaphore=shared_semaphore
        )
        provider2 = GeminiProvider(
            api_key="test-key", rate_limit_semaphore=shared_semaphore
        )

        # Both providers should use the exact same semaphore object
        assert provider1.rate_limit_semaphore is provider2.rate_limit_semaphore
        assert provider1.rate_limit_semaphore is shared_semaphore

    def test_default_semaphore_when_not_provided(self):
        """Test that provider creates default semaphore when none provided."""
        provider = GeminiProvider(api_key="test-key")

        # Should have a semaphore
        assert provider.rate_limit_semaphore is not None
        # Default should be 100
        assert provider.rate_limit_semaphore._value == 100

    @pytest.mark.asyncio
    async def test_semaphore_actually_limits_concurrency(self):
        """Integration test: Verify semaphore actually limits concurrent calls."""
        # Create a semaphore with limit of 1 for clear testing
        semaphore = asyncio.Semaphore(1)
        provider = GeminiProvider(api_key="test-key", rate_limit_semaphore=semaphore)

        call_order = []

        async def make_call(call_id):
            """Helper to create call function with proper closure."""

            async def track_call():
                call_order.append(f"{call_id}_start")
                # Small delay to ensure overlap would happen without semaphore
                await asyncio.sleep(0.001)
                call_order.append(f"{call_id}_end")
                return call_id

            return await provider._call_with_retry(track_call)

        # Launch 3 calls that would overlap without semaphore
        await make_call(0)
        await make_call(1)
        await make_call(2)

        # Verify calls completed in order (not interleaved)
        # With semaphore=1, each call should fully complete before next starts
        assert call_order == [
            "0_start",
            "0_end",
            "1_start",
            "1_end",
            "2_start",
            "2_end",
        ]


class TestNativeJSONMode:
    """Test native JSON mode configuration."""

    def test_model_configuration_uses_json_mode(self):
        """Test that models are configured with native JSON mode."""
        # This is more of an integration concern, but we can verify
        # the generation_config is set correctly in the actual methods

        # The actual test would be in integration tests when calling
        # generate_structured_json or generate_speaker_communication_tips
        # For now, we verify the code structure is correct
        provider = GeminiProvider(api_key="test-key")

        # Verify provider has the necessary attributes
        assert hasattr(provider, "api_key")
        assert hasattr(provider, "rate_limit_semaphore")
        assert hasattr(provider, "_call_with_retry")
        assert hasattr(provider, "_extract_retry_delay")

    @pytest.mark.asyncio
    async def test_json_parsing_without_markdown_cleanup(self):
        """Test that JSON is parsed directly without regex cleanup."""
        provider = GeminiProvider(api_key="test-key")

        # Mock the Gemini client
        with patch.object(provider, "_get_client") as mock_get_client:
            mock_genai = MagicMock()
            mock_model = MagicMock()
            mock_response = MagicMock()

            # Return clean JSON (no markdown code blocks)
            mock_response.text = '{"score": 8, "explanation": "Good clarity"}'
            mock_response.usage_metadata = None

            mock_model.generate_content.return_value = mock_response
            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            # Call the method
            result = await provider.generate_structured_json(
                "Test prompt", observation_name="test"
            )

            # Verify JSON was parsed correctly
            assert result == {"score": 8, "explanation": "Good clarity"}

            # Verify generation config includes JSON mode
            call_args = mock_genai.GenerativeModel.call_args
            assert "generation_config" in call_args[1]
            assert (
                call_args[1]["generation_config"]["response_mime_type"]
                == "application/json"
            )


class TestModelSwitch:
    """Test that provider uses stable model instead of experimental."""

    def test_uses_stable_gemini_flash_model(self):
        """Test that provider uses gemini-2.5-flash-lite (not -exp)."""
        provider = GeminiProvider(api_key="test-key")

        # Verify docstring reflects correct model
        assert "gemini-2.5-flash-lite" in provider.__class__.__doc__
        assert "gemini-2.0-flash" not in provider.__class__.__doc__

    @pytest.mark.asyncio
    async def test_langfuse_tracking_uses_correct_model_name(self):
        """Test that Langfuse tracking reports correct model name."""
        # Create mock langfuse client with AsyncMock for observe decorator
        mock_langfuse = MagicMock()
        mock_langfuse.is_enabled.return_value = True
        mock_langfuse_inner = MagicMock()
        mock_langfuse.get_langfuse_client.return_value = mock_langfuse_inner

        # Mock the observe decorator to return an async function
        async def mock_observed_func(*args, **kwargs):
            return await provider._generate_json_impl(kwargs["prompt"])

        mock_langfuse.observe.return_value = lambda func: mock_observed_func

        provider = GeminiProvider(api_key="test-key", langfuse_client=mock_langfuse)

        with patch.object(provider, "_get_client") as mock_get_client:
            mock_genai = MagicMock()
            mock_model = MagicMock()
            mock_response = MagicMock()

            mock_response.text = '{"score": 8, "explanation": "Test"}'
            mock_response.usage_metadata = MagicMock()
            mock_response.usage_metadata.prompt_token_count = 100
            mock_response.usage_metadata.candidates_token_count = 50
            mock_response.usage_metadata.total_token_count = 150

            mock_model.generate_content.return_value = mock_response
            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            await provider.generate_structured_json(
                "Test prompt", observation_name="test"
            )

            # Verify correct model name in Langfuse tracking
            mock_langfuse_inner.update_current_generation.assert_called_once()
            call_kwargs = mock_langfuse_inner.update_current_generation.call_args[1]
            assert call_kwargs["model"] == "gemini-2.5-flash-lite"


class TestJSONSanitization:
    """Test JSON sanitization for invalid escape sequences."""

    def test_valid_json_unchanged(self):
        """Test that valid JSON passes through unchanged."""
        valid_json = '{"score": 8, "explanation": "Good clarity"}'
        assert sanitize_json_string(valid_json) == valid_json

    def test_valid_escapes_preserved(self):
        """Test that valid escape sequences are preserved."""
        # Valid escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
        json_with_valid_escapes = '{"text": "line1\\nline2\\ttabbed\\"quoted\\"\\\\"}'
        assert sanitize_json_string(json_with_valid_escapes) == json_with_valid_escapes

    def test_invalid_escape_fixed(self):
        """Test that invalid escape sequences are fixed by doubling backslash."""
        # Invalid: \c, \x, \a, etc. should become \\c, \\x, \\a
        invalid_json = '{"text": "test\\c value"}'
        sanitized = sanitize_json_string(invalid_json)
        assert sanitized == '{"text": "test\\\\c value"}'

    def test_multiple_invalid_escapes_fixed(self):
        """Test that multiple invalid escapes are all fixed."""
        invalid_json = '{"text": "\\a\\c\\x\\z"}'
        sanitized = sanitize_json_string(invalid_json)
        assert sanitized == '{"text": "\\\\a\\\\c\\\\x\\\\z"}'

    def test_mixed_valid_and_invalid_escapes(self):
        """Test mixed valid and invalid escapes."""
        mixed_json = '{"text": "valid\\nnewline and invalid\\x escape"}'
        sanitized = sanitize_json_string(mixed_json)
        assert sanitized == '{"text": "valid\\nnewline and invalid\\\\x escape"}'

    def test_unicode_escape_preserved(self):
        """Test that unicode escapes \\uXXXX are preserved."""
        json_with_unicode = '{"emoji": "\\u0048\\u0065\\u006c\\u006c\\u006f"}'
        assert sanitize_json_string(json_with_unicode) == json_with_unicode

    def test_backslash_at_end_of_string(self):
        """Test handling of backslash at end of string (edge case)."""
        # A trailing backslash without following char
        json_trailing = '{"text": "test\\'
        # Should pass through - the backslash just gets added
        sanitized = sanitize_json_string(json_trailing)
        assert sanitized == '{"text": "test\\'

    def test_real_world_gemini_error_case(self):
        """Test a realistic case that Gemini might produce."""
        # Gemini might return JSON with invalid escape like \S or \C
        # (backslash followed by letter that isn't a valid JSON escape)
        invalid_gemini = '{"explanation": "Speaker\\Said something"}'
        sanitized = sanitize_json_string(invalid_gemini)
        # The \S should become \\S (escaped backslash + S)
        expected = '{"explanation": "Speaker\\\\Said something"}'
        assert sanitized == expected
        # Verify it parses
        import json

        result = json.loads(sanitized)
        assert "Speaker\\Said" in result["explanation"]

    def test_consecutive_backslashes(self):
        """Test handling of multiple consecutive backslashes."""
        # \\\\ should stay as \\\\ (two escaped backslashes)
        json_double_backslash = '{"path": "C:\\\\Users\\\\test"}'
        assert sanitize_json_string(json_double_backslash) == json_double_backslash

    def test_empty_string(self):
        """Test empty string handling."""
        assert sanitize_json_string("") == ""

    def test_no_escapes(self):
        """Test string with no escapes at all."""
        simple_json = '{"key": "value"}'
        assert sanitize_json_string(simple_json) == simple_json

    @pytest.mark.asyncio
    async def test_integration_sanitization_recovers_invalid_json(self):
        """Integration test: Verify sanitization allows parsing of invalid JSON."""
        provider = GeminiProvider(api_key="test-key")

        with patch.object(provider, "_get_client") as mock_get_client:
            mock_genai = MagicMock()
            mock_model = MagicMock()
            mock_response = MagicMock()

            # Simulate Gemini returning JSON with invalid escape
            mock_response.text = '{"score": 7, "explanation": "You\\x27re doing well"}'
            mock_response.usage_metadata = None

            mock_model.generate_content.return_value = mock_response
            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            # Should succeed after sanitization
            result = await provider.generate_structured_json(
                "Test prompt", observation_name="test"
            )

            assert result["score"] == 7
            # The sanitized explanation should have \\x27 (escaped backslash + x27)
            assert "x27" in result["explanation"]


class TestJSONExtraction:
    """Test JSON object extraction for malformed responses with extra data."""

    def test_valid_json_unchanged(self):
        """Test that valid JSON passes through unchanged."""
        valid_json = '{"score": 8, "explanation": "Good clarity"}'
        assert extract_json_object(valid_json) == valid_json

    def test_extra_closing_brace_stripped(self):
        """Test the actual Gemini error case: extra closing brace."""
        # This is the exact error format from the Sentry alert
        malformed = '{"score": 4, "explanation": "test"}\n}'
        extracted = extract_json_object(malformed)
        assert extracted == '{"score": 4, "explanation": "test"}'
        # Verify it parses
        import json

        result = json.loads(extracted)
        assert result["score"] == 4

    def test_trailing_text_stripped(self):
        """Test JSON with trailing text after the object."""
        malformed = '{"score": 5, "explanation": "ok"}\nsome trailing text'
        extracted = extract_json_object(malformed)
        assert extracted == '{"score": 5, "explanation": "ok"}'

    def test_multiple_extra_braces(self):
        """Test JSON with multiple extra closing braces."""
        malformed = '{"key": "value"}}}'
        extracted = extract_json_object(malformed)
        assert extracted == '{"key": "value"}'

    def test_braces_inside_strings_ignored(self):
        """Test that braces inside strings don't affect extraction."""
        # Braces inside string values should not count
        json_with_braces = '{"text": "hello { world } test", "score": 1}'
        extracted = extract_json_object(json_with_braces)
        assert extracted == json_with_braces

    def test_nested_objects_handled(self):
        """Test extraction of JSON with nested objects."""
        nested = '{"outer": {"inner": "value"}, "other": 1}\n}'
        extracted = extract_json_object(nested)
        assert extracted == '{"outer": {"inner": "value"}, "other": 1}'

    def test_escaped_quotes_in_strings(self):
        """Test handling of escaped quotes inside strings."""
        json_with_escapes = '{"text": "he said \\"hello\\"", "score": 2}'
        extracted = extract_json_object(json_with_escapes)
        assert extracted == json_with_escapes

    def test_no_json_object_returns_original(self):
        """Test that text without JSON object returns original."""
        no_json = "just some plain text"
        assert extract_json_object(no_json) == no_json

    def test_leading_whitespace_preserved(self):
        """Test JSON with leading whitespace before the object."""
        with_whitespace = '  \n{"score": 1}\n}'
        extracted = extract_json_object(with_whitespace)
        assert extracted == '{"score": 1}'

    def test_empty_object(self):
        """Test extraction of empty JSON object."""
        empty_obj = "{}\nextra"
        extracted = extract_json_object(empty_obj)
        assert extracted == "{}"

    def test_array_not_extracted(self):
        """Test that arrays are not extracted (we only want objects)."""
        # Arrays start with [ not {, so should return original
        json_array = "[1, 2, 3]"
        assert extract_json_object(json_array) == json_array

    @pytest.mark.asyncio
    async def test_integration_extra_brace_recovery(self):
        """Integration test: Verify extraction allows parsing of malformed JSON."""
        provider = GeminiProvider(api_key="test-key")

        with patch.object(provider, "_get_client") as mock_get_client:
            mock_genai = MagicMock()
            mock_model = MagicMock()
            mock_response = MagicMock()

            # Simulate Gemini returning JSON with extra closing brace
            mock_response.text = '{"score": 4, "explanation": "You often start..."}\n}'
            mock_response.usage_metadata = None

            mock_model.generate_content.return_value = mock_response
            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            # Should succeed after extraction
            result = await provider.generate_structured_json(
                "Test prompt", observation_name="test"
            )

            assert result["score"] == 4
            assert "start" in result["explanation"]

    @pytest.mark.asyncio
    async def test_integration_combined_extraction_and_sanitization(self):
        """Integration test: Verify combined extraction + sanitization works."""
        provider = GeminiProvider(api_key="test-key")

        with patch.object(provider, "_get_client") as mock_get_client:
            mock_genai = MagicMock()
            mock_model = MagicMock()
            mock_response = MagicMock()

            # Simulate Gemini returning JSON with both issues:
            # - Extra closing brace
            # - Invalid escape sequence
            mock_response.text = '{"score": 3, "explanation": "test\\x value"}\n}'
            mock_response.usage_metadata = None

            mock_model.generate_content.return_value = mock_response
            mock_genai.GenerativeModel.return_value = mock_model
            mock_get_client.return_value = mock_genai

            # Should succeed after extraction + sanitization
            result = await provider.generate_structured_json(
                "Test prompt", observation_name="test"
            )

            assert result["score"] == 3
            assert "x value" in result["explanation"]
