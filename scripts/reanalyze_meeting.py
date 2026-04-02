#!/usr/bin/env python3
"""
Re-analyze a meeting using the saved transcript.

This script re-runs the analysis pipeline on a meeting without re-transcribing.
Useful for testing new metrics on existing meetings.

Usage:
    python scripts/reanalyze_meeting.py <meeting_id> [--env local|prod]

Examples:
    # Local development (default)
    python scripts/reanalyze_meeting.py b50a9a71-2331-4391-8ff6-e65365719adf

    # Production
    python scripts/reanalyze_meeting.py b50a9a71-2331-4391-8ff6-e65365719adf --env prod
"""

import argparse
import asyncio
import sys
import os
from pathlib import Path

# Parse arguments FIRST to determine environment
parser = argparse.ArgumentParser(description="Re-analyze a meeting using saved transcript")
parser.add_argument("meeting_id", help="The meeting ID to reanalyze")
parser.add_argument(
    "--env",
    choices=["local", "prod"],
    default="local",
    help="Environment to use (default: local)"
)
args = parser.parse_args()

# Load environment variables BEFORE any app imports
from dotenv import load_dotenv
backend_path = Path(__file__).parent.parent / "python-backend"

if args.env == "local":
    env_path = backend_path / ".env.local"
    print(f"Using LOCAL environment ({env_path})")
else:
    env_path = backend_path / ".env.deploy"
    print(f"Using PRODUCTION environment ({env_path})")

if not env_path.exists():
    print(f"ERROR: Environment file not found: {env_path}")
    sys.exit(1)

load_dotenv(env_path, override=True)

# For local environment, replace Docker-specific URLs
# (host.docker.internal is for Docker containers, use localhost for direct execution)
if args.env == "local":
    supabase_url = os.getenv("SUPABASE_URL", "")
    if "host.docker.internal" in supabase_url:
        os.environ["SUPABASE_URL"] = supabase_url.replace("host.docker.internal", "localhost")

# Add the python-backend to the path AFTER loading env vars
sys.path.insert(0, str(backend_path))

# Now import app modules (they will use the loaded env vars)
from app.services.supabase_client import SupabaseClient
from app.services.analysis.analysis_orchestrator import AnalysisOrchestrator


async def reanalyze_meeting(meeting_id: str, env: str) -> None:
    """Re-analyze a meeting using the saved transcript."""
    print(f"\n{'='*60}")
    print(f"Re-analyzing meeting: {meeting_id}")
    print(f"Environment: {env.upper()}")
    print(f"{'='*60}\n")

    supabase = SupabaseClient()
    analysis = AnalysisOrchestrator()

    # Step 1: Fetch transcript from database
    print("[1/5] Fetching transcript from database...")
    transcript = await supabase.get_transcript(meeting_id)

    if not transcript:
        print(f"ERROR: No transcript found for meeting {meeting_id}")
        return

    segments = transcript.get("segments", [])
    duration = transcript.get("duration_seconds", 0)
    speakers = transcript.get("speakers", [])

    print(f"      Found {len(segments)} segments, {len(speakers)} speakers, {duration}s duration")

    # Step 2: Build transcription result format expected by analyzer
    transcription_result = {
        "segments": segments,
        "duration": duration,
        "speakers": speakers,
    }

    # Step 3: Run analysis
    print("[2/5] Running analysis (this may take a moment for LLM calls)...")
    job_id = f"reanalyze-{meeting_id[:8]}"
    speaker_stats = await analysis.analyze(job_id, transcription_result)

    print(f"      Analysis complete for {len(speaker_stats)} speakers")

    # Step 4: Get existing meeting_analysis records to update
    print("[3/5] Fetching existing analysis records...")
    existing_records = supabase.client.table("meeting_analysis").select(
        "id, speaker_label, job_id, created_by"
    ).eq("meeting_id", meeting_id).execute()

    if not existing_records.data:
        print(f"ERROR: No existing analysis records found for meeting {meeting_id}")
        return

    print(f"      Found {len(existing_records.data)} existing records")

    # Step 5: Update each speaker's record with new metrics
    print("[4/5] Updating analysis records with new metrics...")
    for record in existing_records.data:
        speaker_label = record["speaker_label"]
        stats = speaker_stats.get(speaker_label, {})

        if not stats:
            print(f"      WARNING: No stats for speaker {speaker_label}, skipping")
            continue

        # Build update payload with metrics v2 fields
        update_data = {
            # Basic metrics (re-calculated)
            "talk_time_seconds": stats.get("total_time"),
            "talk_time_percentage": stats.get("percentage"),
            "word_count": stats.get("word_count"),
            "words_per_minute": stats.get("words_per_minute"),
            "verbosity": stats.get("verbosity"),
            "turn_taking_balance": stats.get("turn_taking_balance"),
            "segments_count": stats.get("segments"),
            # Response metrics
            "avg_response_latency_seconds": stats.get("response_latency"),
            "response_count": stats.get("response_count"),
            "quick_responses_percentage": stats.get("quick_responses_percentage"),
            # Interruption metrics
            "times_interrupted": stats.get("times_interrupted", 0),
            "times_interrupting": stats.get("times_interrupting", 0),
            "interruption_rate": stats.get("interruption_rate"),
            # Filler words
            "filler_words_total": stats.get("filler_words_total", 0),
            "filler_words_breakdown": stats.get("filler_words_breakdown", {}),
            "filler_words_per_minute": stats.get("filler_words_per_minute", 0.0),
            # === METRICS V2 ===
            # Longest segment
            "longest_segment_seconds": stats.get("longest_segment_seconds", 0.0),
            # Hedge phrases
            "hedge_phrases_total": stats.get("hedge_phrases_total", 0),
            "hedge_phrases_breakdown": stats.get("hedge_phrases_breakdown", {}),
            "hedge_phrases_per_minute": stats.get("hedge_phrases_per_minute", 0.0),
            # Apologies
            "apologies_total": stats.get("apologies_total", 0),
            "apologies_breakdown": stats.get("apologies_breakdown", {}),
            # Signposting
            "signposting_total": stats.get("signposting_total", 0),
            "signposting_breakdown": stats.get("signposting_breakdown", {}),
            "signposting_per_segment": stats.get("signposting_per_segment", 0.0),
            # Softeners
            "softeners_total": stats.get("softeners_total", 0),
            "softeners_breakdown": stats.get("softeners_breakdown", {}),
            "softeners_per_minute": stats.get("softeners_per_minute", 0.0),
            # Incomplete thoughts
            "incomplete_thoughts_count": stats.get("incomplete_thoughts_count", 0),
            "incomplete_thoughts_percentage": stats.get("incomplete_thoughts_percentage", 0.0),
            # Specificity
            "specificity_score": stats.get("specificity_score"),
            "specificity_details": stats.get("specificity_details", {}),
            # Topics per segment
            "avg_topics_per_segment": stats.get("avg_topics_per_segment"),
            "max_topics_in_segment": stats.get("max_topics_in_segment", 0),
            # Key point position
            "key_point_position": stats.get("key_point_position"),
            "key_point_summary": stats.get("key_point_summary"),
            # Agentic scores (LLM)
            "clarity_score": stats.get("clarity_score"),
            "clarity_explanation": stats.get("clarity_explanation"),
            "confidence_score": stats.get("confidence_score"),
            "confidence_explanation": stats.get("confidence_explanation"),
            "attunement_score": stats.get("attunement_score"),
            "attunement_explanation": stats.get("attunement_explanation"),
            # Communication tips
            "communication_tips": stats.get("communication_tips", []),
            "general_overview": stats.get("general_overview"),
        }

        # Update the record
        supabase.client.table("meeting_analysis").update(update_data).eq(
            "id", record["id"]
        ).execute()

        print(f"      Updated {speaker_label}")

    print("[5/5] Done!")
    print(f"\n{'='*60}")
    print("Re-analysis complete! View results at:")
    if env == "local":
        print(f"http://localhost:3000/meetings/{meeting_id}/analysis?metricsV2=true")
    else:
        print(f"https://app.chip.io/meetings/{meeting_id}/analysis?metricsV2=true")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(reanalyze_meeting(args.meeting_id, args.env))
