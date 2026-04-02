"""
Game Analyzer for PowerPoint Karaoke

Uses Gemini 2.5 Flash with video+audio analysis in a single LLM call
to generate clarity score, confidence score, tips, and speech metrics.
"""

import asyncio
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class TokenUsage:
    """Token usage from Gemini API."""

    input_tokens: int
    output_tokens: int
    total_tokens: int


@dataclass
class GameAnalysisResult:
    """Result from game analysis with new structured format."""

    # Timestamped transcript chunks
    transcript: List[Dict[str, Any]]  # [{t_start_sec, t_end_sec, text}, ...]

    # Holistic signals across the talk
    signals: Dict[
        str, Any
    ]  # {ending_strength, unifying_frame_present, bridging_overall, landed_points_overall}
    signal_feedback: List[Dict[str, str]]  # [{signal, quotes, tip}, ...]

    # Scores with checklist breakdown
    clarity: Dict[
        str, Any
    ]  # {base, bonuses, penalties, hard_cap_applied, score, explanation}
    confidence: Dict[
        str, Any
    ]  # {base, bonuses, penalties, hard_cap_applied, score, explanation}

    # Actionable improvements
    biggest_fixes: Dict[str, str]  # {clarity, confidence}

    # Shareable quote for social sharing (most entertaining/absurd moment)
    shareable_quote: str = ""

    # Token usage from API
    usage: Optional[TokenUsage] = None

    # Computed fields for backward compatibility
    clarity_score: int = field(default=0, init=False)
    confidence_score: int = field(default=0, init=False)
    word_count: int = field(default=0, init=False)
    words_per_minute: float = field(default=0.0, init=False)
    duration_seconds: int = field(default=0, init=False)
    transcript_text: str = field(default="", init=False)

    def __post_init__(self):
        """Compute backward-compatible fields from new structure."""
        self.clarity_score = self.clarity.get("score", 0)
        self.confidence_score = self.confidence.get("score", 0)

        # Join transcript chunks into full text
        self.transcript_text = " ".join(
            chunk.get("text", "") for chunk in self.transcript
        )

        # Calculate word count and duration from transcript
        self.word_count = (
            len(self.transcript_text.split()) if self.transcript_text else 0
        )

        # Get duration from last transcript chunk
        if self.transcript:
            self.duration_seconds = int(self.transcript[-1].get("t_end_sec", 0))

        # Calculate WPM
        if self.duration_seconds > 0:
            self.words_per_minute = round(
                self.word_count / (self.duration_seconds / 60), 1
            )


def sanitize_json_string(text: str) -> str:
    """
    Sanitize a JSON string to fix common escape sequence issues.

    Gemini sometimes returns JSON with invalid escape sequences.
    """
    valid_escapes = set('"\\bfnrtu/')

    result = []
    i = 0
    while i < len(text):
        char = text[i]

        if char == "\\" and i + 1 < len(text):
            next_char = text[i + 1]

            if next_char in valid_escapes:
                result.append(char)
                result.append(next_char)
                i += 2

                if next_char == "u" and i + 4 <= len(text):
                    result.append(text[i : i + 4])
                    i += 4
            else:
                result.append("\\\\")
                i += 1
        else:
            result.append(char)
            i += 1

    return "".join(result)


class GameAnalyzer:
    """
    Analyzes PowerPoint Karaoke recordings using Gemini video+audio.

    Single LLM call for transcription + scoring + tips.
    Uses Gemini Files API for video upload and low-resolution processing.
    """

    # Checklist-based scoring prompt with anchor examples for consistency
    # Use {topic_name} placeholder for dynamic topic injection
    FALLBACK_PROMPT = """You are evaluating a "PowerPoint Karaoke" improvised presentation.

INPUT: AUDIO of one speaker improvising a talk.
If a VIDEO track is present, IGNORE ALL VISUAL INFORMATION. Use AUDIO ONLY.

CONTEXT:
- Speaker sees random slides every ~20 seconds
- They must improvise connections between unrelated images
- Creative/absurd connections are fine IF they explain WHY
- TODAY'S TOPIC: "{topic_name}"
- The speaker should weave their improvised content around this topic

---

STEP 1 — TRANSCRIPT

Create timestamped chunks every ~10-20 seconds.
Format: [{{"t_start_sec": 0, "t_end_sec": 15, "text": "..."}}]

---

STEP 2 — SCORING (use checklist method)

BE VERY STRICT. An average improvised presentation scores 3-5.
Only genuinely skilled performances earn 6+. Reserve 8+ for exceptional.

### CLARITY (Base: 3, range 1-10)

Start at 3, then adjust:

BONUSES (+1 each, max +5):
□ grammar - Sentences are grammatically correct throughout
□ explained_transitions - Transitions EXPLAIN why images connect (not just mention topic)
□ specific_points - Points are specific and land with meaning
□ topic_integration - Speaker meaningfully incorporates "{topic_name}" into their narrative
□ creative_logic - Creative or humorous explanations that actually make sense

PENALTIES (-1 each, -2 if severe/frequent):
□ word_salad - Sentences that convey no meaning (-2 if frequent)
□ broken_grammar - Grammar errors that obscure meaning (-2 if pervasive)
□ empty_transitions - Empty transitions (just says topic word, no explanation)
□ topic_ignored - Speaker ignores the topic "{topic_name}" entirely
□ nonsense_content - Content is random/incoherent even for improv (-2 if throughout)

HARD CAPS (apply after calculation):
- Mostly unintelligible/nonsense → max 3
- Multiple unintelligible sentences → max 4
- Most transitions unexplained → max 5

### CONFIDENCE (Base: 3, range 1-10)

Start at 3, then adjust:

BONUSES (+1 each, max +5):
□ steady_pace - Steady pace, no long pauses (5+ seconds)
□ clean_sentences - Sentences complete cleanly (no trailing off mid-thought)
□ strong_ending - Strong ending (conclusion, "thank you", or summary)
□ committed_delivery - Speaker commits to their ideas even when absurd
□ engages_audience - Naturally addresses audience ("you know what I mean?", rhetorical questions)

PENALTIES (-1 each, -2 if severe/frequent):
□ breaks_game_illusion - Acknowledges game mechanics ("what slide is this?", "this is random")
  NOTE: Addressing AUDIENCE is fine; acknowledging the GAME is not
□ visible_confusion - Gets visibly lost or confused ("um what is it?", long confused pauses)
□ restarts - Restarts mid-sentence (-2 if frequent)
□ gives_up - Stops trying or says "I don't know" repeatedly

HARD CAPS (apply after calculation):
- Multiple game-illusion breaks → max 5
- Visibly confused/lost throughout → max 3
- Gives up or stops trying → max 3

---

STEP 3 — CALIBRATION EXAMPLES

CLARITY 8-9 (Excellent - clear, creative, AND topic-integrated):
"The first step to training your house plants is washing your hands.
House plants are super sensitive to dirty hands, which is interesting
because they live in dirt."
→ Grammatically perfect, explains WHY, creative logic that ties to topic

CLARITY 5-6 (Decent - coherent but generic):
"Another surprising tip for a great nap is to make sure there are no
UFOs in the sky. Scan the landscape for anything unexpected. That way
you can rest peacefully."
→ Clear sentences but explanation is thin, connection is surface-level

CLARITY 3-4 (Below average - broken grammar, vague):
"And that just be a brilliant thing that the fish is, that the pigeons
have came up with. So, pigeons are a good thing. That's one of out of
the six things."
→ Grammar broken, "things" is meaningless, no real point lands

CLARITY 1-2 (Very poor - word salad, nonsense):
"Um, what is it? You have to train your eggs. First, so that your
plants feel filtered and nice. And stuff. Things."
→ Sentences convey no meaning, random words strung together

CONFIDENCE 8-9 (Excellent - in control throughout):
"So if you want to be like me and be a badass in house plant training,
you just follow those simple steps, and you too will master the rare
art of house plant training. Thank you."
→ Direct, clean ending, no hesitation, committed to the bit

CONFIDENCE 5-6 (Decent - mostly steady with minor issues):
"So, um, that's basically how you would do it. Yeah, houseplants need
care and attention, you know? Thanks for listening."
→ Some filler words but completes thoughts, adequate ending
→ NOTE: "you know?" is fine - it's addressing the audience, not the game

CONFIDENCE 3-4 (Below average - breaks game illusion, confused):
"What happened? Wait, I don't know what this slide is. It's gonna
change every 20 seconds, so... um... I guess this is random."
→ Acknowledges it's a game, confused, loses immersion

CONFIDENCE 1-2 (Very poor - gives up, completely lost):
"I don't know. What is this? I can't do this. Um... [long pause]...
I have no idea what to say about this picture."
→ Gives up, refuses to engage, breaks game illusion repeatedly

---

STEP 4 — SIGNALS (for feedback cards)

Rate these for the feedback UI:
- ending_strength: "low" | "medium" | "high"
- unifying_frame_present: true | false (maintained theme, not just repeated word)
- transitions_overall: "low" | "medium" | "high" (explained connections between slides, not empty mentions)
- landed_points_overall: "low" | "medium" | "high"

For each signal provide:
- quote: ONE transcript excerpt (15-30 words) that clearly demonstrates the signal
- tip: 1 sentence of feedback

Choose quotes that are specific and illustrative. The quote should make it obvious why the signal received that rating.

---

STEP 5 — SHAREABLE QUOTE

Select the MOST entertaining, absurd, or memorable quote (15-40 words) from the transcript.
This is for social sharing - pick something that would make someone laugh or want to try the game.

Look for:
- Unexpected logic or creative leaps
- Confident delivery of something ridiculous
- Funny word combinations or phrasing
- Memorable conclusions or transitions

The quote should stand alone and be amusing out of context.

---

OUTPUT RULES:
- Use ONLY evidence from transcript
- Be strict in scoring - reserve 7+ for genuinely strong performances
- Quote ONE longer fragment per signal (15-30 words) that clearly shows the behavior
- Explanations: 35–80 words, grade 8 level, second person ("You...")
- All tips must be specific and actionable
- Return ONLY valid JSON

---

JSON SCHEMA:

{{
  "transcript": [
    {{"t_start_sec": 0, "t_end_sec": 15, "text": "..."}}
  ],

  "signals": {{
    "ending_strength": "low|medium|high",
    "unifying_frame_present": true|false,
    "transitions_overall": "low|medium|high",
    "landed_points_overall": "low|medium|high"
  }},

  "signal_feedback": [
    {{
      "signal": "<which signal>",
      "quote": "<one excerpt, 15-30 words, that clearly demonstrates this signal>",
      "tip": "<1 sentence: reinforce or improve>"
    }}
  ],

  "clarity": {{
    "base": 3,
    "bonuses": ["grammar", "explained_transitions"],
    "penalties": [],
    "hard_cap_applied": null,
    "score": 5,
    "explanation": "<35-80 words, grade 8, include 1-2 illustrative quotes>"
  }},

  "confidence": {{
    "base": 3,
    "bonuses": ["steady_pace", "clean_sentences"],
    "penalties": [],
    "hard_cap_applied": null,
    "score": 5,
    "explanation": "<35-80 words, grade 8, include 1-2 illustrative quotes>"
  }},

  "biggest_fixes": {{
    "clarity": "<one actionable sentence>",
    "confidence": "<one actionable sentence>"
  }},

  "shareable_quote": "<15-40 words - the most entertaining/absurd/memorable quote for social sharing>"
}}"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize GameAnalyzer.

        Args:
            api_key: Google AI Studio API key. If not provided, reads from GEMINI_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")

        self._client = None
        self._rate_limit_semaphore = asyncio.Semaphore(
            10
        )  # Limit concurrent video uploads

    def _get_client(self):
        """Lazy load Google Generative AI client."""
        if self._client is None:
            try:
                import google.generativeai as genai

                genai.configure(api_key=self.api_key)
                self._client = genai
            except ImportError:
                raise ImportError(
                    "google-generativeai package not installed. "
                    "Install it with: pip install google-generativeai"
                )
        return self._client

    async def analyze(
        self, video_path: Path, topic_name: Optional[str] = None
    ) -> GameAnalysisResult:
        """
        Analyze a PowerPoint Karaoke video recording.

        Args:
            video_path: Path to the video file (.webm)
            topic_name: Optional topic name for context (e.g., "How to Train Your Houseplant")

        Returns:
            GameAnalysisResult with scores, tips, and metrics

        Raises:
            Exception: If analysis fails
        """
        genai = self._get_client()
        uploaded_file = None

        try:
            logger.info(f"[GameAnalyzer] Uploading video: {video_path}")
            if topic_name:
                logger.info(f"[GameAnalyzer] Topic: {topic_name}")

            # Upload video to Gemini Files API
            async with self._rate_limit_semaphore:
                uploaded_file = await self._upload_file(video_path)

            logger.info(
                f"[GameAnalyzer] File uploaded: {uploaded_file.name}, "
                f"waiting for processing..."
            )

            # Wait for file to be ready
            await self._wait_for_file_active(uploaded_file)

            logger.info("[GameAnalyzer] File ready, running analysis...")

            # Run analysis with the video
            result = await self._run_analysis(uploaded_file, topic_name=topic_name)

            logger.info(
                f"[GameAnalyzer] Analysis complete: "
                f"clarity={result.clarity['score']}, confidence={result.confidence['score']}, "
                f"transcript_chunks={len(result.transcript)}"
            )

            return result

        finally:
            # Always clean up uploaded file
            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                    logger.info(
                        f"[GameAnalyzer] Cleaned up uploaded file: {uploaded_file.name}"
                    )
                except Exception as e:
                    logger.warning(f"[GameAnalyzer] Failed to delete file: {e}")

    async def _upload_file(self, file_path: Path):
        """Upload audio/video file to Gemini Files API."""
        genai = self._get_client()

        # Detect MIME type based on file name
        # Audio files use audio/webm, video files use video/webm
        file_name = file_path.name.lower()
        if (
            "audio" in file_name
            or file_path.suffix == ".webm"
            and "video" not in file_name
        ):
            mime_type = "audio/webm"
        else:
            mime_type = "video/webm"

        logger.debug(f"[GameAnalyzer] Using MIME type: {mime_type} for {file_path}")

        # Run upload in executor since it's blocking
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: genai.upload_file(
                path=str(file_path),
                mime_type=mime_type,
            ),
        )

    async def _wait_for_file_active(self, file, timeout_seconds: int = 300):
        """
        Wait for uploaded file to be in ACTIVE state.

        Args:
            file: Uploaded file object
            timeout_seconds: Maximum time to wait

        Raises:
            TimeoutError: If file doesn't become active in time
            Exception: If file processing fails
        """
        genai = self._get_client()
        start_time = time.time()

        while True:
            # Check file status
            loop = asyncio.get_event_loop()
            file_info = await loop.run_in_executor(
                None, lambda: genai.get_file(file.name)
            )

            state = file_info.state.name

            if state == "ACTIVE":
                return

            if state == "FAILED":
                raise Exception(f"File processing failed: {file_info.name}")

            # Check timeout
            elapsed = time.time() - start_time
            if elapsed > timeout_seconds:
                raise TimeoutError(
                    f"File processing timed out after {timeout_seconds}s"
                )

            # Wait before checking again
            logger.debug(f"[GameAnalyzer] File state: {state}, waiting...")
            await asyncio.sleep(5)

    async def _run_analysis(
        self,
        uploaded_file,
        max_parse_retries: int = 3,
        topic_name: Optional[str] = None,
    ) -> GameAnalysisResult:
        """
        Run Gemini analysis on the uploaded video.

        Args:
            uploaded_file: The uploaded file reference
            max_parse_retries: Maximum retries for JSON parsing failures
            topic_name: Optional topic name for context

        Returns:
            GameAnalysisResult
        """
        genai = self._get_client()

        # Use gemini-2.5-flash for video analysis (supports multimodal)
        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            generation_config={
                "response_mime_type": "application/json",
            },
        )

        # Get prompt from Langfuse or use fallback, with topic name
        prompt_text = self._get_prompt(topic_name=topic_name)

        # Build prompt with video reference
        prompt = [
            uploaded_file,  # Video file reference
            prompt_text,
        ]

        # Retry loop for JSON parsing failures
        last_error = None
        for attempt in range(max_parse_retries):
            try:
                # Call API with retry logic (handles rate limits)
                response = await self._call_with_retry(
                    lambda: self._generate_content(model, prompt)
                )

                # Extract token usage from response
                usage = None
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    usage = TokenUsage(
                        input_tokens=getattr(
                            response.usage_metadata, "prompt_token_count", 0
                        ),
                        output_tokens=getattr(
                            response.usage_metadata, "candidates_token_count", 0
                        ),
                        total_tokens=getattr(
                            response.usage_metadata, "total_token_count", 0
                        ),
                    )
                    logger.info(
                        f"[GameAnalyzer] Token usage: input={usage.input_tokens}, "
                        f"output={usage.output_tokens}, total={usage.total_tokens}"
                    )

                # Parse and validate response
                return self._parse_response(response.text, usage)

            except ValueError as e:
                # JSON parsing or validation error - retry
                last_error = e
                if attempt < max_parse_retries - 1:
                    logger.warning(
                        f"[GameAnalyzer] JSON parsing failed "
                        f"(attempt {attempt + 1}/{max_parse_retries}): {e}. Retrying..."
                    )
                    await asyncio.sleep(2)  # Brief delay before retry
                else:
                    logger.error(
                        f"[GameAnalyzer] JSON parsing failed after {max_parse_retries} attempts"
                    )

        raise last_error

    def _get_prompt(self, topic_name: Optional[str] = None) -> str:
        """
        Get the analysis prompt with topic name substituted.

        Args:
            topic_name: Optional topic name to substitute into the prompt

        Returns:
            Prompt string for checklist-based scoring
        """
        # Use a default topic if none provided
        topic = topic_name or "Improvised Presentation"
        return self.FALLBACK_PROMPT.format(topic_name=topic)

    async def _generate_content(self, model, prompt):
        """Generate content (runs in executor since it's blocking)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: model.generate_content(
                prompt,
                # Increased timeout to 180s for longer videos
                request_options={"timeout": 180},
            ),
        )

    async def _call_with_retry(self, call_func, max_retries: int = 3):
        """
        Call API with retry logic for transient errors.

        Retries on:
        - 429 Rate limit errors
        - 503 Service unavailable
        - 504 Deadline exceeded / timeout
        - Other transient network errors

        Args:
            call_func: Function to call
            max_retries: Maximum retry attempts

        Returns:
            Response from call_func
        """
        last_error = None

        # Patterns that indicate retryable errors
        retryable_patterns = [
            "429",
            "503",
            "504",
            "quota",
            "deadline",
            "timeout",
            "unavailable",
            "overloaded",
            "internal error",
        ]

        for attempt in range(max_retries):
            try:
                return await call_func()

            except Exception as e:
                error_str = str(e).lower()
                last_error = e

                # Check if this is a retryable error
                is_retryable = any(
                    pattern in error_str for pattern in retryable_patterns
                )

                if is_retryable and attempt < max_retries - 1:
                    # Use exponential backoff: 5s, 10s, 20s
                    retry_delay = self._extract_retry_delay(str(e))
                    if retry_delay < 5:
                        retry_delay = 5 * (2**attempt)  # Exponential backoff

                    logger.warning(
                        f"[GameAnalyzer] Transient error (attempt {attempt + 1}/{max_retries}): "
                        f"{str(e)[:100]}. Retrying in {retry_delay}s..."
                    )
                    await asyncio.sleep(retry_delay)
                    continue
                elif is_retryable:
                    logger.error(
                        f"[GameAnalyzer] Retryable error exhausted after {max_retries} attempts: "
                        f"{str(e)[:100]}"
                    )

                # Non-retryable error or retries exhausted
                raise

        raise last_error

    def _extract_retry_delay(self, error_str: str) -> float:
        """Extract retry delay from Gemini error message."""
        match = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", error_str)
        if match:
            return int(match.group(1))
        return 5.0  # Default delay

    def _parse_response(
        self, response_text: str, usage: Optional[TokenUsage] = None
    ) -> GameAnalysisResult:
        """
        Parse and validate the JSON response from Gemini (new format).

        Args:
            response_text: Raw JSON string from Gemini
            usage: Optional token usage from Gemini API

        Returns:
            GameAnalysisResult

        Raises:
            ValueError: If response is invalid
        """
        text = response_text.strip()

        # Try parsing directly first
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Try sanitizing
            sanitized = sanitize_json_string(text)
            try:
                data = json.loads(sanitized)
            except json.JSONDecodeError as e:
                logger.error(f"[GameAnalyzer] Invalid JSON response: {text[:500]}")
                raise ValueError(f"Failed to parse Gemini response: {e}")

        # Validate required top-level fields
        required_fields = [
            "transcript",
            "signals",
            "signal_feedback",
            "clarity",
            "confidence",
            "biggest_fixes",
        ]

        for field_name in required_fields:
            if field_name not in data:
                raise ValueError(f"Missing required field: {field_name}")

        # Validate transcript is a non-empty list
        transcript = data["transcript"]
        if not isinstance(transcript, list) or len(transcript) < 1:
            raise ValueError("transcript must be a non-empty list of chunks")

        for i, chunk in enumerate(transcript):
            if not isinstance(chunk, dict):
                raise ValueError(f"transcript[{i}] must be an object")
            if (
                "t_start_sec" not in chunk
                or "t_end_sec" not in chunk
                or "text" not in chunk
            ):
                raise ValueError(
                    f"transcript[{i}] must have t_start_sec, t_end_sec, and text"
                )

        # Validate signals object
        signals = data["signals"]
        required_signal_fields = [
            "ending_strength",
            "unifying_frame_present",
            "transitions_overall",
            "landed_points_overall",
        ]
        for field_name in required_signal_fields:
            if field_name not in signals:
                raise ValueError(f"signals.{field_name} is required")

        # Validate clarity object (new checklist format)
        clarity = data["clarity"]
        required_clarity_fields = [
            "base",
            "bonuses",
            "penalties",
            "score",
            "explanation",
        ]
        for field_name in required_clarity_fields:
            if field_name not in clarity:
                raise ValueError(f"clarity.{field_name} is required")

        # Validate clarity score
        if (
            not isinstance(clarity["score"], int)
            or clarity["score"] < 1
            or clarity["score"] > 10
        ):
            raise ValueError("clarity.score must be an integer between 1 and 10")
        # Validate clarity base
        if not isinstance(clarity["base"], int) or clarity["base"] != 3:
            raise ValueError("clarity.base must be 3")
        # Validate bonuses and penalties are lists
        if not isinstance(clarity["bonuses"], list):
            raise ValueError("clarity.bonuses must be a list")
        if not isinstance(clarity["penalties"], list):
            raise ValueError("clarity.penalties must be a list")

        # Validate confidence object (new checklist format)
        confidence = data["confidence"]
        required_confidence_fields = [
            "base",
            "bonuses",
            "penalties",
            "score",
            "explanation",
        ]
        for field_name in required_confidence_fields:
            if field_name not in confidence:
                raise ValueError(f"confidence.{field_name} is required")

        # Validate confidence score
        if (
            not isinstance(confidence["score"], int)
            or confidence["score"] < 1
            or confidence["score"] > 10
        ):
            raise ValueError("confidence.score must be an integer between 1 and 10")
        # Validate confidence base
        if not isinstance(confidence["base"], int) or confidence["base"] != 3:
            raise ValueError("confidence.base must be 3")
        # Validate bonuses and penalties are lists
        if not isinstance(confidence["bonuses"], list):
            raise ValueError("confidence.bonuses must be a list")
        if not isinstance(confidence["penalties"], list):
            raise ValueError("confidence.penalties must be a list")

        # Validate biggest_fixes object
        biggest_fixes = data["biggest_fixes"]
        if "clarity" not in biggest_fixes or "confidence" not in biggest_fixes:
            raise ValueError("biggest_fixes must have clarity and confidence fields")

        # Extract shareable_quote (optional - fallback to ending_strength quote if missing)
        shareable_quote = data.get("shareable_quote", "")
        if not shareable_quote or not isinstance(shareable_quote, str):
            # Fallback: try to get the ending_strength quote from signal_feedback
            signal_feedback = data.get("signal_feedback", [])
            for feedback in signal_feedback:
                if feedback.get("signal") == "ending_strength" and feedback.get(
                    "quote"
                ):
                    shareable_quote = feedback["quote"]
                    break
            if not shareable_quote:
                shareable_quote = ""

        logger.info(
            f"[GameAnalyzer] Parsed response: clarity={clarity['score']}, "
            f"confidence={confidence['score']}, transcript_chunks={len(transcript)}, "
            f"shareable_quote_len={len(shareable_quote)}"
        )

        return GameAnalysisResult(
            transcript=transcript,
            signals=signals,
            signal_feedback=data.get("signal_feedback", []),
            clarity=clarity,
            confidence=confidence,
            biggest_fixes=biggest_fixes,
            shareable_quote=shareable_quote,
            usage=usage,
        )
