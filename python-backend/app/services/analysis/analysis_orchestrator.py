"""
Analysis orchestrator for coordinating speaker metrics calculation.

Orchestrates the calculation of various speaker metrics by delegating
to specialized analyzers for different types of metrics.
"""

import asyncio
import sys
import logging
from typing import Dict, Any
from app.services.analysis.apologies_analyzer import detect_apologies
from app.services.analysis.filler_words_analyzer import detect_filler_words
from app.services.analysis.hedge_phrases_analyzer import detect_hedge_phrases
from app.services.analysis.incomplete_thoughts_analyzer import (
    detect_incomplete_thoughts,
)
from app.services.analysis.key_point_analyzer import calculate_key_point_position
from app.services.analysis.longest_segment_analyzer import calculate_longest_segment
from app.services.analysis.signposting_analyzer import detect_signposting
from app.services.analysis.softeners_analyzer import detect_softeners
from app.services.analysis.specificity_analyzer import calculate_specificity_score
from app.services.analysis.topics_analyzer import calculate_topics_per_segment
from app.services.analysis.response_latency_analyzer import (
    calculate_per_speaker_response_latency,
)
from app.services.analysis.interruption_analyzer import (
    calculate_per_speaker_interruptions,
)
from app.services.analysis.llm.providers.gemini import GeminiProvider
from app.services.analysis.llm.langfuse_client import LangfuseClient
from app.services.analysis.llm.analyzers import (
    ClarityAnalyzer,
    ConfidenceAnalyzer,
    AttunementAnalyzer,
)
from app.services.analysis.llm.llm_analyzer import LLMOrchestrator
from app.services.analysis.pillar_score_calculator import extract_pillar_scores
from app.services.slack_notifier import send_llm_failure_alert
import os
import sentry_sdk

logger = logging.getLogger(__name__)


class AnalysisOrchestrator:
    """Orchestrates the calculation of communication metrics from transcription data."""

    def __init__(self):
        """Initialize the analysis orchestrator with LLM and observability clients."""
        self.langfuse_client = LangfuseClient()

        # Create shared semaphore for rate limiting Gemini API calls
        # 100 concurrent requests (~5% of 2K RPM limit - plenty of headroom)
        self.rate_limit_semaphore = asyncio.Semaphore(100)

        # Initialize Gemini provider with shared semaphore
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.gemini_provider = GeminiProvider(
            api_key=gemini_api_key,
            langfuse_client=self.langfuse_client,
            rate_limit_semaphore=self.rate_limit_semaphore,
        )

        # Initialize LLM analyzers and orchestrator
        self.llm_orchestrator = LLMOrchestrator(
            [
                ClarityAnalyzer(self.gemini_provider, self.langfuse_client),
                ConfidenceAnalyzer(self.gemini_provider, self.langfuse_client),
                AttunementAnalyzer(self.gemini_provider, self.langfuse_client),
            ]
        )

    async def analyze(
        self, job_id: str, transcription_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Calculate speaker statistics and communication metrics.

        Args:
            job_id: The job identifier for logging
            transcription_result: Transcription data with segments and speakers

        Returns:
            Dictionary mapping speaker names to their statistics including:
                - total_time: Total speaking time in seconds
                - word_count: Number of words spoken
                - segments: Number of speaking segments
                - percentage: Percentage of total speaking time
                - words_per_minute: Speaking rate in words per minute
                - verbosity: Average words per segment (communication style indicator)
                - turn_taking_balance: Composite balance score from tri-factor analysis
                  (segments, duration, words). Positive = dominating, Negative = under-participating
                - response_latency: Average response time
                - response_count: Number of responses
                - quick_responses_percentage: Percentage of quick responses
                - times_interrupted: Number of times interrupted
                - times_interrupting: Number of times interrupting
                - interruption_rate: Interruptions per minute
                - filler_words_total: Total count of filler words
                - filler_words_breakdown: Dict mapping filler words to counts
                - filler_words_per_minute: Rate of filler words per minute of speaking time
                - clarity_score: Clarity dimension score (1-10, or None if unavailable)
                - confidence_score: Confidence dimension score (1-10, or None if unavailable)
                - attunement_score: Attunement dimension score (1-10, or None if unavailable)
                - content_pillar_score: Content pillar score (1-10, max 1 decimal, or None)
                - poise_pillar_score: Poise pillar score (1-10, max 1 decimal, or None)
                - connection_pillar_score: Connection pillar score (1-10, max 1 decimal, or None)
        """
        logger.info(f"[Job {job_id}] Calculating speaker statistics...")
        sys.stdout.flush()

        segments = transcription_result.get("segments", [])
        speaker_stats: Dict[str, Any] = {}

        # Calculate basic speaker statistics
        for segment in segments:
            speaker = segment.get("speaker", "Unknown")
            if speaker not in speaker_stats:
                speaker_stats[speaker] = {
                    "total_time": 0,
                    "word_count": 0,
                    "segments": 0,
                }

            speaker_stats[speaker]["total_time"] += segment.get("end", 0) - segment.get(
                "start", 0
            )
            speaker_stats[speaker]["word_count"] += len(segment.get("text", "").split())
            speaker_stats[speaker]["segments"] += 1

        # Calculate percentages
        total_time = sum(stats["total_time"] for stats in speaker_stats.values())
        for speaker, stats in speaker_stats.items():
            if total_time > 0:
                percentage = round((stats["total_time"] / total_time * 100), 1)
            else:
                percentage = 0
            stats["percentage"] = percentage
            stats["total_time"] = round(stats["total_time"], 2)

        # Calculate words per minute for each speaker
        for speaker, stats in speaker_stats.items():
            total_time_seconds = stats["total_time"]
            word_count = stats["word_count"]

            if total_time_seconds > 0:
                # Formula: (total_words / total_seconds) * 60
                wpm = (word_count / total_time_seconds) * 60
                stats["words_per_minute"] = round(wpm, 1)
            else:
                stats["words_per_minute"] = 0.0

        # Calculate verbosity (words per segment) for each speaker
        for speaker, stats in speaker_stats.items():
            segments_count = stats["segments"]
            word_count = stats["word_count"]

            if segments_count > 0:
                # Formula: total_words / total_segments
                verbosity = word_count / segments_count
                stats["verbosity"] = round(verbosity, 1)
            else:
                stats["verbosity"] = 0.0

        # Calculate Turn Taking Balance metric (tri-factor: segments, duration, words)
        num_speakers = len(speaker_stats)
        if num_speakers > 0:
            # Calculate totals across all speakers
            total_segments = sum(stats["segments"] for stats in speaker_stats.values())
            total_words = sum(stats["word_count"] for stats in speaker_stats.values())
            # total_time already calculated above

            # Expected percentage for balanced participation
            expected_percentage = 100.0 / num_speakers

            # Calculate Turn Taking Balance for each speaker
            for speaker, stats in speaker_stats.items():
                # Calculate actual percentages for each factor
                segment_percentage = (
                    (stats["segments"] / total_segments * 100)
                    if total_segments > 0
                    else 0
                )
                duration_percentage = stats["percentage"]  # Already calculated above
                word_percentage = (
                    (stats["word_count"] / total_words * 100) if total_words > 0 else 0
                )

                # Calculate deviations from expected balanced participation
                segment_deviation = segment_percentage - expected_percentage
                duration_deviation = duration_percentage - expected_percentage
                word_deviation = word_percentage - expected_percentage

                # Turn Taking Balance: average of three deviations (equal weighting)
                # Positive = dominating conversation, Negative = under-participating, 0 = balanced
                turn_taking_balance = round(
                    (segment_deviation + duration_deviation + word_deviation) / 3, 2
                )
                stats["turn_taking_balance"] = turn_taking_balance
        else:
            # No speakers, set to 0
            for speaker, stats in speaker_stats.items():
                stats["turn_taking_balance"] = 0.0

        logger.info(f"[Job {job_id}] Speaker statistics calculated")
        sys.stdout.flush()

        # Calculate per-speaker communication metrics
        logger.info(f"[Job {job_id}] Calculating per-speaker metrics...")
        sys.stdout.flush()

        # Calculate per-speaker response latency
        per_speaker_latency = calculate_per_speaker_response_latency(segments)

        # Calculate per-speaker interruptions
        per_speaker_interruptions = calculate_per_speaker_interruptions(segments)

        # Calculate per-speaker filler words
        per_speaker_fillers = {}
        for speaker in speaker_stats.keys():
            # Get segments for this speaker only
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_fillers[speaker] = detect_filler_words(speaker_segments)

        # Calculate per-speaker hedge phrases
        per_speaker_hedges = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_hedges[speaker] = detect_hedge_phrases(speaker_segments)

        # Calculate per-speaker apologies
        per_speaker_apologies = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_apologies[speaker] = detect_apologies(speaker_segments)

        # Calculate per-speaker signposting
        per_speaker_signposting = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_signposting[speaker] = detect_signposting(speaker_segments)

        # Calculate per-speaker softeners
        per_speaker_softeners = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_softeners[speaker] = detect_softeners(speaker_segments)

        # Calculate per-speaker incomplete thoughts
        per_speaker_incomplete = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_incomplete[speaker] = detect_incomplete_thoughts(
                speaker_segments
            )

        # Calculate per-speaker specificity score
        per_speaker_specificity = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_specificity[speaker] = calculate_specificity_score(
                speaker_segments
            )

        # Calculate per-speaker topics per segment
        per_speaker_topics = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_topics[speaker] = calculate_topics_per_segment(speaker_segments)

        # Calculate per-speaker key point position
        per_speaker_key_point = {}
        for speaker in speaker_stats.keys():
            speaker_segments = [s for s in segments if s.get("speaker") == speaker]
            per_speaker_key_point[speaker] = calculate_key_point_position(
                speaker_segments
            )

        # Calculate per-speaker longest segment
        per_speaker_longest = calculate_longest_segment(segments)

        # Merge metrics into speaker_stats
        for speaker, stats in speaker_stats.items():
            # Add response latency metrics
            latency_metrics = per_speaker_latency.get(speaker, {})
            stats["response_latency"] = latency_metrics.get("average_seconds", 0.0)
            stats["response_count"] = latency_metrics.get("response_count", 0)
            stats["quick_responses_percentage"] = latency_metrics.get(
                "quick_responses_percentage", 0.0
            )

            # Add interruption metrics
            interruption_metrics = per_speaker_interruptions.get(speaker, {})
            stats["times_interrupted"] = interruption_metrics.get(
                "times_interrupted", 0
            )
            stats["times_interrupting"] = interruption_metrics.get(
                "times_interrupting", 0
            )
            stats["interruption_rate"] = interruption_metrics.get(
                "interruption_rate", 0.0
            )

            # Add filler words metrics
            filler_metrics = per_speaker_fillers.get(speaker, {})
            stats["filler_words_total"] = filler_metrics.get("total", 0)
            stats["filler_words_breakdown"] = filler_metrics.get("breakdown", {})

            # Calculate filler words per minute rate
            talk_time_seconds = stats["total_time"]
            if talk_time_seconds > 0:
                talk_time_minutes = talk_time_seconds / 60.0
                filler_words_per_minute = (
                    stats["filler_words_total"] / talk_time_minutes
                )
                stats["filler_words_per_minute"] = round(filler_words_per_minute, 2)
            else:
                stats["filler_words_per_minute"] = 0.0

            # Add longest segment metrics
            longest_metrics = per_speaker_longest.get(speaker, {})
            stats["longest_segment_seconds"] = longest_metrics.get(
                "longest_segment_seconds", 0.0
            )

            # Add hedge phrases metrics
            hedge_metrics = per_speaker_hedges.get(speaker, {})
            stats["hedge_phrases_total"] = hedge_metrics.get("total", 0)
            stats["hedge_phrases_breakdown"] = hedge_metrics.get("breakdown", {})

            # Calculate hedge phrases per minute rate
            if talk_time_seconds > 0:
                hedge_phrases_per_minute = (
                    stats["hedge_phrases_total"] / talk_time_minutes
                )
                stats["hedge_phrases_per_minute"] = round(hedge_phrases_per_minute, 2)
            else:
                stats["hedge_phrases_per_minute"] = 0.0

            # Add apologies metrics (count only, not rate-based since infrequent)
            apology_metrics = per_speaker_apologies.get(speaker, {})
            stats["apologies_total"] = apology_metrics.get("total", 0)
            stats["apologies_breakdown"] = apology_metrics.get("breakdown", {})

            # Add signposting metrics
            signpost_metrics = per_speaker_signposting.get(speaker, {})
            stats["signposting_total"] = signpost_metrics.get("total", 0)
            stats["signposting_breakdown"] = signpost_metrics.get("breakdown", {})

            # Calculate signposting per segment rate
            segments_count = stats.get("segments", 0)
            if segments_count > 0:
                signposting_per_segment = stats["signposting_total"] / segments_count
                stats["signposting_per_segment"] = round(signposting_per_segment, 2)
            else:
                stats["signposting_per_segment"] = 0.0

            # Add softeners metrics
            softener_metrics = per_speaker_softeners.get(speaker, {})
            stats["softeners_total"] = softener_metrics.get("total", 0)
            stats["softeners_breakdown"] = softener_metrics.get("breakdown", {})

            # Calculate softeners per minute rate
            if talk_time_seconds > 0:
                softeners_per_minute = stats["softeners_total"] / talk_time_minutes
                stats["softeners_per_minute"] = round(softeners_per_minute, 2)
            else:
                stats["softeners_per_minute"] = 0.0

            # Add incomplete thoughts metrics
            incomplete_metrics = per_speaker_incomplete.get(speaker, {})
            stats["incomplete_thoughts_count"] = incomplete_metrics.get("count", 0)
            stats["incomplete_thoughts_percentage"] = incomplete_metrics.get(
                "percentage", 0.0
            )

            # Add specificity metrics
            specificity_metrics = per_speaker_specificity.get(speaker, {})
            stats["specificity_score"] = specificity_metrics.get("score")
            stats["specificity_details"] = specificity_metrics.get("details", {})

            # Add topics per segment metrics
            topics_metrics = per_speaker_topics.get(speaker, {})
            stats["avg_topics_per_segment"] = topics_metrics.get(
                "avg_topics_per_segment"
            )
            stats["max_topics_in_segment"] = topics_metrics.get(
                "max_topics_in_segment", 0
            )

            # Add key point position metrics
            key_point_metrics = per_speaker_key_point.get(speaker, {})
            stats["key_point_position"] = key_point_metrics.get("position")
            stats["key_point_summary"] = key_point_metrics.get("summary")

        logger.info(f"[Job {job_id}] Per-speaker metrics calculated")
        sys.stdout.flush()

        meeting_duration_minutes = transcription_result.get("duration", 0) / 60
        total_speakers = len(speaker_stats)

        # Run agentic LLM analysis for each speaker
        # Note: Speakers are processed sequentially (one at a time) to spread out API calls.
        # Within each speaker, the 4 analyzers run in parallel, but rate limiting via
        # semaphore ensures we stay under 2K RPM Gemini quota (100 concurrent max).
        logger.info(f"[Job {job_id}] Running agentic analysis for each speaker...")
        sys.stdout.flush()

        # Get full transcript for attunement analysis
        full_transcript = "\n".join(
            [
                f"{seg.get('speaker', 'Unknown')}: {seg.get('text', '')}"
                for seg in segments
            ]
        )

        for speaker, stats in speaker_stats.items():
            try:
                # Get speaker-only transcript for clarity and confidence
                speaker_segments = [s for s in segments if s.get("speaker") == speaker]
                speaker_transcript = " ".join(
                    [s.get("text", "") for s in speaker_segments]
                )

                # Run all 4 analyzers in parallel
                agentic_results = await self.llm_orchestrator.analyze_all(
                    speaker_label=speaker,
                    transcript_text=speaker_transcript,  # Used by Clarity/Confidence
                    talk_time_percentage=stats["percentage"],
                    word_count=stats["word_count"],
                    meeting_duration_minutes=meeting_duration_minutes,
                    total_speakers=total_speakers,
                    # Pass metrics for all analyzers via kwargs
                    full_transcript=full_transcript,
                    # Clarity metrics
                    filler_words_per_minute=stats.get("filler_words_per_minute", 0.0),
                    # Confidence metrics
                    verbosity=stats.get("verbosity", 0.0),
                    words_per_minute=stats.get("words_per_minute", 0.0),
                    # Attunement/Collaboration metrics
                    turn_taking_balance=stats.get("turn_taking_balance", 0.0),
                    times_interrupting=stats.get("times_interrupting", 0),
                    times_interrupted=stats.get("times_interrupted", 0),
                    interruption_rate=stats.get("interruption_rate", 0.0),
                )

                # Add agentic scores to stats
                agentic_dict = agentic_results.to_dict()
                stats.update(agentic_dict)

                success_count = len(
                    [k for k in agentic_dict.keys() if k.endswith("_score")]
                )
                logger.info(
                    f"[Job {job_id}] Agentic analysis for {speaker}: "
                    f"{success_count}/3 dimensions analyzed"
                )

                # Send Slack notification for each individual analyzer that failed
                for dimension, error_msg in agentic_results.errors.items():
                    logger.warning(
                        f"[Job {job_id}] {dimension.title()} analysis failed for "
                        f"{speaker}: {error_msg}"
                    )

                    # Track in Sentry for monitoring
                    sentry_sdk.capture_exception(
                        Exception(error_msg),
                        extra={
                            "job_id": job_id,
                            "speaker": speaker,
                            "stage": f"{dimension}_analysis",
                            "talk_time_percentage": stats.get("percentage", 0),
                            "word_count": stats.get("word_count", 0),
                        },
                    )

                    # Send Slack notification for this specific analyzer failure
                    await send_llm_failure_alert(
                        job_id=job_id,
                        speaker=speaker,
                        stage=f"{dimension.title()} Analysis",
                        error_message=error_msg,
                        extra_context={
                            "talk_time_percentage": stats.get("percentage", 0),
                            "word_count": stats.get("word_count", 0),
                        },
                    )

            except Exception as agentic_error:
                # Catastrophic failure - the whole analyze_all() call failed
                logger.warning(
                    f"[Job {job_id}] Agentic analysis failed for {speaker}: "
                    f"{str(agentic_error)}"
                )

                # Track in Sentry for monitoring
                sentry_sdk.capture_exception(
                    agentic_error,
                    extra={
                        "job_id": job_id,
                        "speaker": speaker,
                        "stage": "agentic_analysis",
                        "analyzers": [
                            "clarity",
                            "confidence",
                            "attunement",
                        ],
                        "talk_time_percentage": stats.get("percentage", 0),
                        "word_count": stats.get("word_count", 0),
                    },
                )

                # Send Slack notification for catastrophic LLM failure
                await send_llm_failure_alert(
                    job_id=job_id,
                    speaker=speaker,
                    stage="Agentic Analysis (All Analyzers)",
                    error_message=str(agentic_error),
                    extra_context={
                        "analyzers": "clarity, confidence, attunement",
                        "talk_time_percentage": stats.get("percentage", 0),
                        "word_count": stats.get("word_count", 0),
                    },
                )

                # Continue without agentic scores - they remain NULL in DB

        sys.stdout.flush()

        # Calculate pillar scores from agentic dimensions
        logger.info(f"[Job {job_id}] Calculating pillar scores for each speaker...")
        sys.stdout.flush()

        for speaker, stats in speaker_stats.items():
            try:
                pillar_scores = extract_pillar_scores(stats)
                stats.update(pillar_scores)

                pillar_count = len([v for v in pillar_scores.values() if v is not None])
                logger.info(
                    f"[Job {job_id}] Pillar scores for {speaker}: "
                    f"{pillar_count}/4 pillars calculated"
                )

            except Exception as pillar_error:
                logger.warning(
                    f"[Job {job_id}] Pillar score calculation failed for {speaker}: "
                    f"{str(pillar_error)}"
                )

                # Track in Sentry for monitoring (no Slack - this is just math, not LLM)
                sentry_sdk.capture_exception(
                    pillar_error,
                    extra={
                        "job_id": job_id,
                        "speaker": speaker,
                        "stage": "pillar_score_calculation",
                        "available_scores": {
                            "clarity": stats.get("clarity_score"),
                            "confidence": stats.get("confidence_score"),
                            "attunement": stats.get("attunement_score"),
                        },
                    },
                )

                # Continue without pillar scores - they remain NULL in DB

        sys.stdout.flush()

        # Generate general analysis (overview + tips) for each speaker
        # This runs AFTER pillar analysis so it can leverage the descriptive explanations
        logger.info(f"[Job {job_id}] Generating general analysis for each speaker...")
        sys.stdout.flush()

        for speaker, stats in speaker_stats.items():
            try:
                # Get pillar explanations (may be None if analysis failed)
                clarity_explanation = stats.get("clarity_explanation")
                confidence_explanation = stats.get("confidence_explanation")
                attunement_explanation = stats.get("attunement_explanation")

                # Generate general analysis with pillar insights
                general_analysis = await self.gemini_provider.generate_general_analysis(
                    speaker_label=speaker,
                    full_transcript=full_transcript,
                    clarity_explanation=clarity_explanation,
                    confidence_explanation=confidence_explanation,
                    attunement_explanation=attunement_explanation,
                )

                # Store results in stats
                stats["general_overview"] = general_analysis.get("general_overview", "")
                stats["communication_tips"] = general_analysis.get("tips", [])

                logger.info(
                    f"[Job {job_id}] General analysis for {speaker}: "
                    f"overview generated, {len(stats['communication_tips'])} tips"
                )

            except Exception as general_error:
                logger.error(
                    f"[Job {job_id}] General analysis failed for {speaker}: "
                    f"{str(general_error)}"
                )

                # Track in Sentry for monitoring
                sentry_sdk.capture_exception(
                    general_error,
                    extra={
                        "job_id": job_id,
                        "speaker": speaker,
                        "stage": "general_analysis",
                        "has_clarity": clarity_explanation is not None,
                        "has_confidence": confidence_explanation is not None,
                        "has_attunement": attunement_explanation is not None,
                    },
                )

                # Send Slack notification for overview analysis failure
                await send_llm_failure_alert(
                    job_id=job_id,
                    speaker=speaker,
                    stage="Overview Analysis",
                    error_message=str(general_error),
                    extra_context={
                        "has_clarity_explanation": clarity_explanation is not None,
                        "has_confidence_explanation": confidence_explanation
                        is not None,
                        "has_attunement_explanation": attunement_explanation
                        is not None,
                    },
                )

                # Leave fields as None - frontend will hide these sections
                # No fake fallback text that misleads users
                stats["general_overview"] = None
                stats["communication_tips"] = None

        sys.stdout.flush()

        # Flush observability traces after analysis completes
        logger.info(f"[Job {job_id}] Flushing observability traces...")
        sys.stdout.flush()
        self.langfuse_client.flush()

        return speaker_stats
