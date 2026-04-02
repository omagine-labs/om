"""
Game Pipeline Orchestrator for PowerPoint Karaoke.

Simplified pipeline for game recordings:
Downloads audio → Analyzes with Gemini → Saves results.

Note: Uses audio-only files (~3 MB) instead of video (~55 MB) since
Gemini analysis is audio-only. This reduces download time, memory usage,
and processing costs.
"""

import sys
import logging
import tempfile
from pathlib import Path

import sentry_sdk

from app.services.supabase_client import SupabaseClient
from app.services.game.game_analyzer import GameAnalyzer
from app.services.analysis.llm.langfuse_client import LangfuseClient

logger = logging.getLogger(__name__)


class GamePipelineOrchestrator:
    """
    Orchestrates the game analysis pipeline.

    This is a simplified pipeline for PowerPoint Karaoke games that:
    1. Downloads the audio from Supabase Storage (~3 MB vs ~55 MB video)
    2. Runs Gemini audio analysis
    3. Saves results directly to games table
    """

    def __init__(self):
        """Initialize the orchestrator with required services."""
        self.supabase = SupabaseClient()
        self.langfuse_client = LangfuseClient()
        self.analyzer = GameAnalyzer()

    async def execute_for_game(
        self,
        game_id: str,
    ) -> None:
        """
        Execute the game analysis pipeline for the new games table.

        Args:
            game_id: The game identifier (from games table)

        Raises:
            Exception: If any step in the pipeline fails
        """
        temp_dir = None
        try:
            # Create temp directory for this game
            temp_dir = Path(tempfile.mkdtemp(prefix=f"game_{game_id}_"))

            # Set Sentry context for debugging
            self._set_sentry_context_for_game(game_id)

            logger.info(f"[Game {game_id}] Starting game analysis pipeline")
            sys.stdout.flush()

            # Step 1: Fetch game record and update status to processing
            game = await self.supabase.get_game(game_id)
            audio_storage_path = game.get("audio_storage_path")
            topic_date = game.get("topic_date")

            if not audio_storage_path:
                raise ValueError("Game has no audio_storage_path")

            await self.supabase.update_game_status(game_id, "processing")
            logger.info(f"[Game {game_id}] Status updated to processing")
            sys.stdout.flush()

            # Fetch topic name for the game's topic_date
            topic_name = None
            if topic_date:
                topic_name = await self.supabase.get_topic_name(topic_date)
                if topic_name:
                    logger.info(f"[Game {game_id}] Topic: {topic_name}")
                else:
                    logger.warning(f"[Game {game_id}] No topic found for {topic_date}")
            sys.stdout.flush()

            # Step 2: Download audio from Supabase Storage (audio-only for efficiency)
            # Note: Gemini analysis is audio-only, so we skip video to reduce
            # download size from ~55MB to ~3MB, improving speed and reducing memory
            logger.info(
                f"[Game {game_id}] Downloading audio from: {audio_storage_path}"
            )
            sys.stdout.flush()

            audio_file = temp_dir / "audio.webm"
            await self.supabase.download_file(
                bucket="recordings",
                path=audio_storage_path,
                destination=audio_file,
            )

            logger.info(f"[Game {game_id}] Audio downloaded: {audio_file}")
            sys.stdout.flush()

            # Step 3: Run Gemini audio analysis
            logger.info(f"[Game {game_id}] Running Gemini audio analysis...")
            sys.stdout.flush()

            result = await self.analyzer.analyze(audio_file, topic_name=topic_name)

            logger.info(
                f"[Game {game_id}] Analysis complete: "
                f"clarity={result.clarity['score']}, confidence={result.confidence['score']}, "
                f"words={result.word_count}, wpm={result.words_per_minute:.1f}"
            )
            if result.transcript_text:
                logger.info(
                    f"[Game {game_id}] Transcript: {result.transcript_text[:200]}..."
                )
            sys.stdout.flush()

            # Step 4: Save results directly to games table
            logger.info(f"[Game {game_id}] Saving analysis results to games table...")
            sys.stdout.flush()

            # Build analysis data dict from the result
            analysis_data = {
                "transcript": result.transcript,
                "signals": result.signals,
                "signal_feedback": result.signal_feedback,
                "clarity": result.clarity,
                "confidence": result.confidence,
                "biggest_fixes": result.biggest_fixes,
                "shareable_quote": result.shareable_quote,
            }

            await self.supabase.save_game_results(
                game_id=game_id,
                analysis_data=analysis_data,
            )

            logger.info(
                f"[Game {game_id}] Game analysis pipeline completed successfully"
            )
            sys.stdout.flush()

        except Exception as e:
            error_message = str(e)
            logger.error(
                f"[Game {game_id}] Game analysis pipeline failed: {error_message}",
                exc_info=True,
            )
            sys.stdout.flush()

            # Capture error in Sentry
            sentry_sdk.capture_exception(e)

            # Update game status to failed
            try:
                await self.supabase.update_game_status(
                    game_id,
                    "failed",
                    error=f"Game analysis failed: {error_message}",
                )
            except Exception as update_error:
                logger.error(
                    f"[Game {game_id}] Failed to update game status: {update_error}"
                )

            raise

        finally:
            # Cleanup temp files
            if temp_dir:
                self._cleanup_temp_dir(game_id, temp_dir)

    def _set_sentry_context_for_game(self, game_id: str) -> None:
        """Set Sentry context for error tracking (games table)."""
        try:
            sentry_sdk.set_tag("game_id", game_id)
            sentry_sdk.set_tag("pipeline_type", "game")
            sentry_sdk.set_context(
                "game_processing",
                {
                    "game_id": game_id,
                },
            )
        except Exception as sentry_error:
            logger.warning(
                f"[Game {game_id}] Failed to set Sentry context: {sentry_error}"
            )

    def _cleanup_temp_dir(self, game_id: str, temp_dir: Path) -> None:
        """Clean up temporary directory and its contents."""
        try:
            import shutil

            if temp_dir.exists():
                shutil.rmtree(temp_dir)
                logger.info(f"[Game {game_id}] Cleaned up temp directory")
        except Exception as cleanup_error:
            logger.warning(f"[Game {game_id}] Cleanup error: {cleanup_error}")
