"""
LLM-Powered Communication Analyzer

Base classes and orchestration for LLM-powered communication analysis.
Analyzes 4 dimensions: Clarity, Confidence, Collaboration, Attunement.

Architecture:
- BaseLLMAnalyzer: Abstract base class for LLM analyzers
- LLMOrchestrator: Runs multiple analyzers in parallel
- Validation utilities for score validation
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

from .langfuse_client import LangfuseClient

logger = logging.getLogger(__name__)


# =============================================================================
# Validation
# =============================================================================


class LLMScoreValidationError(Exception):
    """Raised when LLM score validation fails."""

    pass


def validate_llm_score(result: Dict[str, Any], dimension: str) -> Dict[str, Any]:
    """
    Validate LLM analysis score and explanation.

    Args:
        result: Dictionary with 'score' and 'explanation' keys
        dimension: Name of the dimension being validated (for error messages)

    Returns:
        Validated result dictionary

    Raises:
        LLMScoreValidationError: If validation fails
    """
    if not isinstance(result, dict):
        raise LLMScoreValidationError(
            f"{dimension}: Result must be a dictionary, got {type(result)}"
        )

    # Validate score exists
    if "score" not in result:
        raise LLMScoreValidationError(f"{dimension}: Missing 'score' field")

    # Validate score is an integer
    score = result["score"]
    if not isinstance(score, int):
        raise LLMScoreValidationError(
            f"{dimension}: Score must be an integer, got {type(score)}"
        )

    # Validate score is between 1 and 10
    if score < 1 or score > 10:
        raise LLMScoreValidationError(
            f"{dimension}: Score must be between 1 and 10, got {score}"
        )

    # Validate explanation exists
    if "explanation" not in result:
        raise LLMScoreValidationError(f"{dimension}: Missing 'explanation' field")

    # Validate explanation is a non-empty string
    explanation = result["explanation"]
    if not isinstance(explanation, str):
        raise LLMScoreValidationError(
            f"{dimension}: Explanation must be a string, got {type(explanation)}"
        )

    if not explanation.strip():
        raise LLMScoreValidationError(f"{dimension}: Explanation cannot be empty")

    logger.debug(
        f"{dimension} validation passed: score={score}, "
        f"explanation_length={len(explanation)}"
    )

    return result


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class LLMAnalysisResult:
    """
    Result from an LLM analyzer.

    Attributes:
        score: Integer score from 1 (poor) to 10 (excellent)
        explanation: Detailed explanation with specific examples
        dimension: Name of the dimension analyzed
    """

    score: int
    explanation: str
    dimension: str


@dataclass
class LLMOrchestrationResult:
    """
    Combined results from all LLM analyzers.

    Attributes:
        clarity: Result from clarity analyzer (or None if failed)
        confidence: Result from confidence analyzer (or None if failed)
        attunement: Result from attunement analyzer (or None if failed)
        errors: Dict of dimension names to error messages
    """

    clarity: Optional[LLMAnalysisResult] = None
    confidence: Optional[LLMAnalysisResult] = None
    attunement: Optional[LLMAnalysisResult] = None
    errors: Dict[str, str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = {}

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary for database storage.

        Returns:
            Dictionary with score and explanation for each dimension
        """
        result = {}

        if self.clarity:
            result["clarity_score"] = self.clarity.score
            result["clarity_explanation"] = self.clarity.explanation

        if self.confidence:
            result["confidence_score"] = self.confidence.score
            result["confidence_explanation"] = self.confidence.explanation

        if self.attunement:
            result["attunement_score"] = self.attunement.score
            result["attunement_explanation"] = self.attunement.explanation

        return result


# =============================================================================
# Base LLM Analyzer
# =============================================================================


class BaseLLMAnalyzer(ABC):
    """
    Abstract base class for LLM-powered analyzers.

    Each analyzer:
    1. Fetches its prompt from Langfuse (with fallback to inline)
    2. Calls LLM provider for structured JSON response
    3. Validates score (1-10) and explanation (non-empty string)
    4. Returns LLMAnalysisResult

    Subclasses must implement:
    - dimension_name: Property returning the dimension name
    - prompt_name: Property returning the Langfuse prompt name
    - _build_fallback_prompt: Method to build inline prompt if Langfuse unavailable
    """

    def __init__(
        self,
        llm_provider,
        langfuse_client: Optional[LangfuseClient] = None,
    ):
        """
        Initialize base analyzer.

        Args:
            llm_provider: LLM provider with generate_structured_json method
            langfuse_client: Optional Langfuse client for prompt management
        """
        self.llm_provider = llm_provider
        self.langfuse_client = langfuse_client

    @property
    @abstractmethod
    def dimension_name(self) -> str:
        """Return the name of the dimension this analyzer evaluates."""
        pass

    @property
    @abstractmethod
    def prompt_name(self) -> str:
        """Return the Langfuse prompt name for this analyzer."""
        pass

    @abstractmethod
    def _build_fallback_prompt(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> str:
        """
        Build fallback prompt if Langfuse is unavailable.

        Args:
            speaker_label: Speaker identifier
            transcript_text: Full transcript text for this speaker
            talk_time_percentage: % of meeting time this speaker talked
            word_count: Total words spoken
            meeting_duration_minutes: Total meeting duration
            total_speakers: Number of speakers in meeting
            **kwargs: Additional dimension-specific parameters

        Returns:
            Formatted prompt string
        """
        pass

    def _get_prompt(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> str:
        """
        Get prompt from Langfuse or fall back to inline.

        Args:
            (same as _build_fallback_prompt)

        Returns:
            Formatted prompt string
        """
        # Try Langfuse first
        if self.langfuse_client and self.langfuse_client.is_enabled():
            prompt = self.langfuse_client.get_prompt(self.prompt_name)
            if prompt:
                try:
                    # Compile prompt with variables
                    compiled = prompt.compile(
                        speaker_label=speaker_label,
                        transcript_text=transcript_text,
                        talk_time_percentage=f"{talk_time_percentage:.1f}",
                        word_count=word_count,
                        meeting_duration_minutes=f"{meeting_duration_minutes:.0f}",
                        total_speakers=total_speakers,
                        **{k: str(v) for k, v in kwargs.items()},
                    )
                    logger.info(
                        f"✅ Using Langfuse prompt: {self.prompt_name} "
                        f"(version: {getattr(prompt, 'version', 'unknown')})"
                    )
                    return compiled
                except Exception as e:
                    logger.warning(
                        f"Failed to compile Langfuse prompt {self.prompt_name}: {e}"
                    )

        # Fallback to inline prompt
        logger.debug(f"Using fallback prompt for {self.dimension_name}")
        return self._build_fallback_prompt(
            speaker_label=speaker_label,
            transcript_text=transcript_text,
            talk_time_percentage=talk_time_percentage,
            word_count=word_count,
            meeting_duration_minutes=meeting_duration_minutes,
            total_speakers=total_speakers,
            **kwargs,
        )

    async def analyze(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> LLMAnalysisResult:
        """
        Analyze a speaker's communication for this dimension.

        Includes retry logic for validation errors (max 2 attempts).

        Args:
            speaker_label: Speaker identifier
            transcript_text: Full transcript text for this speaker
            talk_time_percentage: % of meeting time this speaker talked
            word_count: Total words spoken
            meeting_duration_minutes: Total meeting duration
            total_speakers: Number of speakers in meeting
            **kwargs: Additional dimension-specific parameters

        Returns:
            LLMAnalysisResult with score and explanation

        Raises:
            LLMScoreValidationError: If LLM response is invalid after retries
            Exception: For other errors
        """
        # Get prompt once (used for all attempts)
        prompt = self._get_prompt(
            speaker_label=speaker_label,
            transcript_text=transcript_text,
            talk_time_percentage=talk_time_percentage,
            word_count=word_count,
            meeting_duration_minutes=meeting_duration_minutes,
            total_speakers=total_speakers,
            **kwargs,
        )

        max_attempts = 3  # 1 initial + 2 retries
        last_validation_error = None

        for attempt in range(max_attempts):
            try:
                # Call LLM provider with observability
                if attempt == 0:
                    logger.info(
                        f"Analyzing {self.dimension_name} for {speaker_label}..."
                    )
                else:
                    logger.warning(
                        f"Retrying {self.dimension_name} analysis for {speaker_label} "
                        f"(attempt {attempt + 1}/{max_attempts}) after validation error"
                    )

                result = await self.llm_provider.generate_structured_json(
                    prompt=prompt,
                    observation_name=f"llm-{self.dimension_name.lower()}",
                )

                # Validate response
                validated = validate_llm_score(result, self.dimension_name)

                logger.info(
                    f"✅ {self.dimension_name} analysis complete: "
                    f"score={validated['score']}"
                    + (f" (succeeded on attempt {attempt + 1})" if attempt > 0 else "")
                )

                return LLMAnalysisResult(
                    score=validated["score"],
                    explanation=validated["explanation"],
                    dimension=self.dimension_name,
                )

            except LLMScoreValidationError as e:
                last_validation_error = e
                if attempt < max_attempts - 1:
                    logger.warning(
                        f"Validation failed for {self.dimension_name}: {str(e)}. "
                        f"Retrying (attempt {attempt + 1}/{max_attempts})..."
                    )
                    continue  # Retry
                else:
                    logger.error(
                        f"Validation failed for {self.dimension_name} after "
                        f"{max_attempts} attempts: {str(e)}"
                    )
                    raise  # Give up after max attempts

            except Exception as e:
                error_str = str(e)
                # Check if this is a JSON parse error (retryable)
                is_json_error = "Failed to parse" in error_str and "JSON" in error_str

                if is_json_error and attempt < max_attempts - 1:
                    # JSON parse errors are retryable - LLM may return valid JSON on retry
                    logger.warning(
                        f"JSON parse failed for {self.dimension_name}: {error_str}. "
                        f"Retrying (attempt {attempt + 1}/{max_attempts})..."
                    )
                    continue  # Retry
                else:
                    # Non-retryable error or exhausted retries - fail immediately
                    logger.error(
                        f"Failed to analyze {self.dimension_name} for {speaker_label}: {e}"
                    )
                    raise Exception(
                        f"Failed to analyze {self.dimension_name}: {str(e)}"
                    ) from e

        # Should never reach here, but just in case
        if last_validation_error:
            raise last_validation_error
        raise Exception(
            f"Failed to analyze {self.dimension_name} after {max_attempts} attempts"
        )


# =============================================================================
# LLM Orchestrator
# =============================================================================


class LLMOrchestrator:
    """
    Orchestrates parallel execution of LLM analyzers.

    Runs all 4 analyzers concurrently using asyncio.gather() for performance.
    Handles individual analyzer failures gracefully - if one fails, others continue.
    """

    def __init__(self, analyzers: List[BaseLLMAnalyzer]):
        """
        Initialize orchestrator with analyzers.

        Args:
            analyzers: List of analyzer instances (clarity, confidence, etc.)
        """
        self.analyzers = analyzers
        logger.info(
            f"Initialized LLMOrchestrator with "
            f"{len(analyzers)} analyzers: "
            f"{[a.dimension_name for a in analyzers]}"
        )

    async def analyze_all(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> LLMOrchestrationResult:
        """
        Run all analyzers in parallel.

        Args:
            speaker_label: Speaker identifier
            transcript_text: Full transcript text for this speaker
            talk_time_percentage: % of meeting time this speaker talked
            word_count: Total words spoken
            meeting_duration_minutes: Total meeting duration
            total_speakers: Number of speakers in meeting
            **kwargs: Additional analyzer-specific parameters

        Returns:
            LLMOrchestrationResult with results from all analyzers
        """
        logger.info(
            f"Starting parallel analysis for {speaker_label} "
            f"({len(self.analyzers)} analyzers)..."
        )

        # Create tasks for analyzers, skipping attunement for single-speaker meetings
        tasks = []
        for analyzer in self.analyzers:
            # Skip attunement for single-speaker meetings (collaboration requires 2+ people)
            if analyzer.dimension_name == "Attunement" and total_speakers == 1:
                logger.info(
                    f"Skipping {analyzer.dimension_name} analysis for {speaker_label} "
                    f"(single-speaker meeting)"
                )
                continue

            tasks.append(
                self._analyze_with_error_handling(
                    analyzer=analyzer,
                    speaker_label=speaker_label,
                    transcript_text=transcript_text,
                    talk_time_percentage=talk_time_percentage,
                    word_count=word_count,
                    meeting_duration_minutes=meeting_duration_minutes,
                    total_speakers=total_speakers,
                    **kwargs,
                )
            )

        # Run all analyzers in parallel
        results = await asyncio.gather(*tasks, return_exceptions=False)

        # Map results to their dimensions
        result_dict = {}
        errors = {}

        for result in results:
            if isinstance(result, LLMAnalysisResult):
                result_dict[result.dimension.lower()] = result
            elif isinstance(result, tuple) and len(result) == 2:
                # Error tuple: (dimension_name, error_message)
                dimension, error = result
                errors[dimension] = error
                logger.warning(f"Analyzer {dimension} failed: {error}")

        logger.info(
            f"✅ Parallel analysis complete: "
            f"{len(result_dict)} succeeded, {len(errors)} failed"
        )

        return LLMOrchestrationResult(
            clarity=result_dict.get("clarity"),
            confidence=result_dict.get("confidence"),
            attunement=result_dict.get("attunement"),
            errors=errors,
        )

    async def _analyze_with_error_handling(
        self,
        analyzer: BaseLLMAnalyzer,
        **kwargs,
    ) -> LLMAnalysisResult | tuple[str, str]:
        """
        Run a single analyzer with error handling.

        Args:
            analyzer: The analyzer to run
            **kwargs: Arguments to pass to analyzer.analyze()

        Returns:
            LLMAnalysisResult on success, or (dimension, error_msg) tuple on failure
        """
        try:
            result = await analyzer.analyze(**kwargs)
            return result
        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"Analyzer {analyzer.dimension_name} failed: {error_msg}",
                exc_info=True,
            )
            return (analyzer.dimension_name, error_msg)
