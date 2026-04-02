"""
Google Gemini AI Provider

Uses Gemini Flash for fast, cost-effective LLM generation.
"""

import asyncio
import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


def sanitize_json_string(text: str) -> str:
    """
    Sanitize a JSON string to fix common escape sequence issues.

    Gemini sometimes returns JSON with invalid escape sequences like \\x, \\c, etc.
    This function fixes those by properly escaping backslashes that precede
    invalid escape characters.

    Valid JSON escape sequences: \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, \\uXXXX

    Args:
        text: Raw JSON string from Gemini

    Returns:
        Sanitized JSON string with valid escape sequences
    """
    # Valid escape characters in JSON (after the backslash)
    valid_escapes = set('"\\bfnrtu/')

    result = []
    i = 0
    while i < len(text):
        char = text[i]

        if char == "\\" and i + 1 < len(text):
            next_char = text[i + 1]

            if next_char in valid_escapes:
                # Valid escape sequence - keep as is
                result.append(char)
                result.append(next_char)
                i += 2

                # Handle unicode escape \\uXXXX
                if next_char == "u" and i + 4 <= len(text):
                    # Append the 4 hex digits
                    result.append(text[i : i + 4])
                    i += 4
            else:
                # Invalid escape - double the backslash to escape it
                result.append("\\\\")
                i += 1
        else:
            result.append(char)
            i += 1

    return "".join(result)


def extract_json_object(text: str) -> str:
    """
    Extract the first complete JSON object from text that may contain extra data.

    Gemini occasionally returns JSON with extra data after the valid object,
    like an extra closing brace or trailing text. This function extracts just
    the first complete JSON object by tracking brace nesting.

    Example:
        Input:  '{"score": 4, "explanation": "test"}\n}'
        Output: '{"score": 4, "explanation": "test"}'

    Args:
        text: Raw text that may contain a JSON object with extra data

    Returns:
        Extracted JSON object string, or original text if no valid structure found
    """
    # Find the first opening brace
    start_idx = text.find("{")
    if start_idx == -1:
        return text  # No JSON object found, return as-is

    brace_count = 0
    in_string = False
    escape_next = False

    for i in range(start_idx, len(text)):
        char = text[i]

        # Handle escape sequences inside strings
        if escape_next:
            escape_next = False
            continue

        if char == "\\" and in_string:
            escape_next = True
            continue

        # Handle string boundaries
        if char == '"' and not escape_next:
            in_string = not in_string
            continue

        # Track braces only outside of strings
        if not in_string:
            if char == "{":
                brace_count += 1
            elif char == "}":
                brace_count -= 1
                if brace_count == 0:
                    # Found the matching closing brace
                    return text[start_idx : i + 1]

    # No complete object found, return original text
    return text


class GeminiProvider:
    """
    Google Gemini AI provider using gemini-2.5-flash-lite.

    Features:
    - Fast processing
    - Cost-effective
    - Good quality analysis
    - Structured JSON responses
    - Native JSON mode support
    - Rate limiting (100 concurrent requests, well under 2K RPM limit)
    - Automatic retry with exponential backoff for 429 errors
    """

    def __init__(
        self,
        api_key: str,
        langfuse_client=None,
        rate_limit_semaphore: Optional[asyncio.Semaphore] = None,
    ):
        """
        Initialize Gemini provider.

        Args:
            api_key: Google AI Studio API key
            langfuse_client: Optional Langfuse client for observability
            rate_limit_semaphore: Optional semaphore for rate limiting across instances
        """
        self.api_key = api_key
        self.langfuse_client = langfuse_client
        self.client = None
        # Use provided semaphore or create new one
        # (100 concurrent max, ~5% of 2K RPM limit - plenty of headroom)
        self.rate_limit_semaphore = rate_limit_semaphore or asyncio.Semaphore(100)

    def _get_client(self):
        """Lazy load Google Generative AI client."""
        if self.client is None:
            try:
                import google.generativeai as genai

                genai.configure(api_key=self.api_key)
                self.client = genai
            except ImportError:
                raise ImportError(
                    "google-generativeai package not installed. "
                    "Install it with: pip install google-generativeai"
                )
        return self.client

    async def _call_with_retry(self, call_func, max_retries: int = 5):
        """
        Call Gemini API with retry logic for rate limit errors.

        Args:
            call_func: Async function to call (should make the API request)
            max_retries: Maximum number of retry attempts (default: 5)

        Returns:
            Response from call_func

        Raises:
            Exception: If all retries exhausted or non-retryable error occurs
        """
        last_error = None

        for attempt in range(max_retries):
            try:
                async with self.rate_limit_semaphore:
                    # Call the API
                    return await call_func()

            except Exception as e:
                error_str = str(e)
                last_error = e

                # Check if this is a 429 rate limit error
                if "429" in error_str or "quota" in error_str.lower():
                    # Extract retry delay from error if available
                    retry_delay = self._extract_retry_delay(error_str)

                    if attempt < max_retries - 1:
                        logger.warning(
                            f"Rate limit hit (attempt {attempt + 1}/{max_retries}). "
                            f"Retrying in {retry_delay}s..."
                        )
                        await asyncio.sleep(retry_delay)
                        continue
                    else:
                        logger.error(
                            f"Rate limit exhausted after {max_retries} attempts"
                        )
                        raise Exception(
                            f"Gemini rate limit exceeded after {max_retries} retries"
                        ) from e
                else:
                    # Non-retryable error, raise immediately
                    raise

        # Should never reach here, but just in case
        raise last_error

    def _extract_retry_delay(self, error_str: str) -> float:
        """
        Extract retry delay from Gemini error message.

        Gemini errors include retry_delay like: retry_delay { seconds: 57 }

        Args:
            error_str: Error message from Gemini

        Returns:
            Delay in seconds (defaults to exponential backoff if not found)
        """
        # Try to extract retry_delay from error message
        match = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", error_str)
        if match:
            delay = int(match.group(1))
            logger.info(f"Using Gemini-specified retry delay: {delay}s")
            return delay

        # Fallback to exponential backoff: 2s, 4s, 8s
        # We'll start with 2s as a safe default
        logger.debug("No retry delay found in error, using default 2s")
        return 2.0

    async def generate_structured_json(
        self, prompt: str, observation_name: str = "generate-json"
    ) -> dict:
        """
        Generate structured JSON response from Gemini with Langfuse observability.

        This method is designed for agentic analysis where we need guaranteed
        JSON responses with specific structure (e.g., {score: int, explanation: str}).

        Args:
            prompt: The prompt to send to Gemini
            observation_name: Name for Langfuse observation

        Returns:
            Parsed JSON dictionary

        Raises:
            Exception: If Gemini fails or returns invalid JSON
        """
        # Wrap with Langfuse observability if enabled
        if self.langfuse_client and self.langfuse_client.is_enabled():
            observed_func = self.langfuse_client.observe(
                name=observation_name,
                as_type="generation",
                capture_input=True,
                capture_output=True,
            )(self._generate_json_impl)

            return await observed_func(prompt=prompt)
        else:
            return await self._generate_json_impl(prompt=prompt)

    async def _generate_json_impl(self, prompt: str) -> dict:
        """Internal implementation of JSON generation."""
        try:
            genai = self._get_client()

            # Use native JSON mode for reliable JSON responses
            generation_config = {
                "response_mime_type": "application/json",
            }

            model = genai.GenerativeModel(
                "gemini-2.5-flash-lite",
                generation_config=generation_config,
            )

            logger.info("Calling Gemini API for structured JSON generation...")

            # Define API call as async function for retry logic
            async def make_api_call():
                # google.generativeai is sync, so we run in executor
                import asyncio

                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(
                    None,
                    lambda: model.generate_content(
                        prompt, request_options={"timeout": 60}
                    ),
                )

            # Call with retry logic
            response = await self._call_with_retry(make_api_call)
            logger.info("Gemini API response received")
            text = response.text.strip()

            # Track token usage and cost for Langfuse
            if self.langfuse_client and self.langfuse_client.is_enabled():
                if hasattr(response, "usage_metadata"):
                    usage = response.usage_metadata
                    client = self.langfuse_client.get_langfuse_client()
                    if client:
                        # Calculate cost based on Gemini 2.5 Flash Lite pricing
                        input_cost = usage.prompt_token_count * 0.0000001
                        output_cost = usage.candidates_token_count * 0.0000004
                        total_cost = input_cost + output_cost

                        # Update current generation with usage, cost, and model info
                        try:
                            client.update_current_generation(
                                model="gemini-2.5-flash-lite",
                                usage_details={
                                    "input": usage.prompt_token_count,
                                    "output": usage.candidates_token_count,
                                    "total": usage.total_token_count,
                                },
                                cost_details={
                                    "input": input_cost,
                                    "output": output_cost,
                                    "total": total_cost,
                                },
                            )
                        except Exception as e:
                            logger.debug(f"Failed to update Langfuse usage: {e}")

            # Try to parse JSON with progressive recovery strategies
            stripped_text = text.strip()

            # Strategy 1: Direct parse (fastest path - most responses are valid)
            try:
                result = json.loads(stripped_text)
                return result
            except json.JSONDecodeError as direct_error:
                logger.debug(f"Direct JSON parse failed: {direct_error}")

            # Strategy 2: Extract JSON object (handles extra data like trailing braces)
            try:
                extracted_text = extract_json_object(stripped_text)
                if extracted_text != stripped_text:
                    result = json.loads(extracted_text)
                    logger.info("JSON parse succeeded after extracting object")
                    return result
            except json.JSONDecodeError as extract_error:
                logger.debug(f"JSON parse after extraction failed: {extract_error}")

            # Strategy 3: Sanitize escape sequences (handles invalid escapes like \x)
            try:
                sanitized_text = sanitize_json_string(stripped_text)
                if sanitized_text != stripped_text:
                    result = json.loads(sanitized_text)
                    logger.info("JSON parse succeeded after sanitization")
                    return result
            except json.JSONDecodeError as sanitize_error:
                logger.debug(f"JSON parse after sanitization failed: {sanitize_error}")

            # Strategy 4: Extract then sanitize (combined recovery)
            try:
                extracted_text = extract_json_object(stripped_text)
                sanitized_extracted = sanitize_json_string(extracted_text)
                result = json.loads(sanitized_extracted)
                logger.info("JSON parse succeeded after extraction + sanitization")
                return result
            except json.JSONDecodeError as combined_error:
                # All strategies failed - log and raise
                logger.error(
                    f"Gemini returned invalid JSON (all recovery strategies failed): "
                    f"{stripped_text[:1000]}"
                )
                raise Exception(
                    f"Failed to parse Gemini JSON response: {str(combined_error)}"
                )
        except Exception as error:
            logger.error(f"Gemini structured JSON error: {error}")
            raise Exception(f"Failed to generate structured JSON: {str(error)}")

    async def generate_general_analysis(
        self,
        speaker_label: str,
        full_transcript: str,
        clarity_explanation: Optional[str],
        confidence_explanation: Optional[str],
        attunement_explanation: Optional[str],
    ) -> dict:
        """
        Generate general meeting overview and actionable tips based on pillar analyses.

        Includes retry logic for validation errors (max 2 attempts).

        Args:
            speaker_label: Speaker identifier
            full_transcript: Complete meeting transcript with all speakers
            clarity_explanation: Explanation from clarity analysis (or None)
            confidence_explanation: Explanation from confidence analysis (or None)
            attunement_explanation: Explanation from attunement analysis (or None)

        Returns:
            Dictionary with:
                - general_overview: 1-sentence meeting description
                - tips: List of 1-3 actionable improvement items

        Raises:
            Exception: If generation fails after retries
        """
        # Build prompt (once, reused for retries)
        prompt = self._build_general_analysis_prompt(
            speaker_label=speaker_label,
            full_transcript=full_transcript,
            clarity_explanation=clarity_explanation,
            confidence_explanation=confidence_explanation,
            attunement_explanation=attunement_explanation,
        )

        max_attempts = 2  # 1 initial + 1 retry
        last_validation_error = None

        for attempt in range(max_attempts):
            try:
                if attempt == 0:
                    logger.info(f"Generating general analysis for {speaker_label}...")
                else:
                    logger.warning(
                        f"Retrying general analysis for {speaker_label} "
                        f"(attempt {attempt + 1}/{max_attempts}) after validation error"
                    )

                # Try Langfuse prompt first
                if self.langfuse_client and self.langfuse_client.is_enabled():
                    langfuse_prompt = self.langfuse_client.get_prompt(
                        "speaker-communication-tips"
                    )
                    if langfuse_prompt:
                        try:
                            # Compile with variables
                            compiled_prompt = langfuse_prompt.compile(
                                speaker_label=speaker_label,
                                full_transcript=full_transcript,
                                clarity_explanation=clarity_explanation
                                or "Not available",
                                confidence_explanation=confidence_explanation
                                or "Not available",
                                attunement_explanation=attunement_explanation
                                or "Not available",
                            )
                            prompt = compiled_prompt
                            logger.info(
                                f"✅ Using Langfuse prompt: speaker-communication-tips "
                                f"(version: {getattr(langfuse_prompt, 'version', 'unknown')})"
                            )
                        except Exception as e:
                            logger.warning(
                                f"Failed to compile Langfuse prompt speaker-communication-tips: {e}"
                            )
                            # Keep using fallback prompt

                # Call LLM
                result = await self.generate_structured_json(
                    prompt=prompt,
                    observation_name="general-analysis",
                )

                # Validate response structure
                self._validate_general_analysis_response(result)

                logger.info(
                    f"✅ General analysis complete for {speaker_label}: "
                    f"{len(result.get('tips', []))} tips generated"
                    + (f" (succeeded on attempt {attempt + 1})" if attempt > 0 else "")
                )

                return result

            except ValueError as e:
                # Validation error
                last_validation_error = e
                if attempt < max_attempts - 1:
                    logger.warning(
                        f"Validation failed for general analysis: {str(e)}. "
                        f"Retrying (attempt {attempt + 1}/{max_attempts})..."
                    )
                    continue  # Retry
                else:
                    logger.error(
                        f"Validation failed for general analysis after "
                        f"{max_attempts} attempts: {str(e)}"
                    )
                    raise Exception(
                        f"Failed to generate valid general analysis after {max_attempts} attempts: {str(e)}"
                    )

            except Exception as e:
                # Non-validation errors - fail immediately
                logger.error(f"Failed to generate general analysis: {e}")
                raise

        # Should never reach here
        if last_validation_error:
            raise Exception(
                f"Failed to generate general analysis: {str(last_validation_error)}"
            )
        raise Exception(
            f"Failed to generate general analysis after {max_attempts} attempts"
        )

    def _build_general_analysis_prompt(
        self,
        speaker_label: str,
        full_transcript: str,
        clarity_explanation: Optional[str],
        confidence_explanation: Optional[str],
        attunement_explanation: Optional[str],
    ) -> str:
        """Build fallback prompt for general analysis."""
        return f"""
Generate a general communication overview and actionable tips for {speaker_label} based on their pillar analyses.

TRANSCRIPT:
{full_transcript}

PILLAR ANALYSES:
- Clarity: {clarity_explanation or "Not available"}
- Confidence: {confidence_explanation or "Not available"}
- Attunement: {attunement_explanation or "Not available"}

INSTRUCTIONS:
1. Write a 1-sentence "general_overview" describing the meeting type/purpose
   (e.g., "A brainstorming session for Q4 planning")
2. Generate 1-3 actionable "tips" based on the biggest improvement areas from
   the pillar analyses
   - Each tip should be specific and actionable
   - Focus on the weakest pillar scores
   - Use second person ("You...")

Return ONLY valid JSON:
{{
  "general_overview": "<1-sentence meeting description>",
  "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]
}}
"""

    def _validate_general_analysis_response(self, result: any) -> None:
        """
        Validate general analysis response structure.

        Args:
            result: Response from LLM

        Raises:
            ValueError: If validation fails
        """
        if not isinstance(result, dict):
            raise ValueError(
                f"Response must be a dictionary, got {type(result).__name__}"
            )

        if "general_overview" not in result:
            raise ValueError("Response missing required 'general_overview' field")

        if not isinstance(result["general_overview"], str):
            raise ValueError(
                f"'general_overview' must be a string, got {type(result['general_overview']).__name__}"
            )

        if not result["general_overview"].strip():
            raise ValueError("'general_overview' cannot be empty")

        if "tips" not in result:
            raise ValueError("Response missing required 'tips' field")

        if not isinstance(result["tips"], list):
            raise ValueError(
                f"'tips' must be a list, got {type(result['tips']).__name__}"
            )

        if len(result["tips"]) < 1 or len(result["tips"]) > 3:
            raise ValueError(
                f"'tips' must contain 1-3 items, got {len(result['tips'])}"
            )

        for i, tip in enumerate(result["tips"]):
            if not isinstance(tip, str):
                raise ValueError(f"tip[{i}] must be a string, got {type(tip).__name__}")
            if not tip.strip():
                raise ValueError(f"tip[{i}] cannot be empty")
