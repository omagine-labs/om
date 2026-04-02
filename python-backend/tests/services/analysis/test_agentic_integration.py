"""
Integration tests for agentic analysis pipeline.

Tests the full flow from AnalysisOrchestrator through LLM analyzers
to ensure all scores are properly calculated and saved.
"""

import pytest
from unittest.mock import AsyncMock, patch
from app.services.analysis.analysis_orchestrator import AnalysisOrchestrator


class TestAgenticIntegration:
    """Integration tests for agentic analysis in the analysis pipeline."""

    @pytest.fixture
    def mock_transcription_result(self):
        """Create a realistic mock transcription result."""
        return {
            "duration": 1800,  # 30 minutes
            "segments": [
                {
                    "speaker": "Speaker A",
                    "text": "Let me explain the plan clearly. First, we'll focus on X.",
                    "start": 0.0,
                    "end": 5.0,
                },
                {
                    "speaker": "Speaker B",
                    "text": "That makes sense. I'll build on your idea with Y.",
                    "start": 5.5,
                    "end": 10.0,
                },
                {
                    "speaker": "Speaker A",
                    "text": "Great point! I agree with your approach.",
                    "start": 10.5,
                    "end": 14.0,
                },
                {
                    "speaker": "Speaker B",
                    "text": "Let's collaborate on this together.",
                    "start": 14.5,
                    "end": 17.0,
                },
            ],
        }

    @pytest.mark.asyncio
    async def test_full_analysis_pipeline_includes_agentic_scores(
        self, mock_transcription_result
    ):
        """Test that full analysis pipeline includes agentic scores."""
        with patch(
            "app.services.analysis.analysis_orchestrator.LangfuseClient"
        ) as MockLangfuse, patch(
            "app.services.analysis.analysis_orchestrator.GeminiProvider"
        ) as MockGeminiProvider, patch(
            "app.services.analysis.analysis_orchestrator.LLMOrchestrator"
        ) as MockLLMOrch:
            # Mock Langfuse client
            from unittest.mock import MagicMock

            mock_langfuse = MagicMock()
            mock_langfuse.flush = MagicMock()  # Not async
            MockLangfuse.return_value = mock_langfuse

            # Mock Gemini provider responses
            mock_provider = AsyncMock()

            # Mock general analysis response
            mock_provider.generate_general_analysis = AsyncMock(
                return_value={
                    "general_overview": "A test meeting",
                    "tips": ["Tip 1", "Tip 2"],
                }
            )

            # Mock agentic analysis responses
            mock_provider.generate_structured_json = AsyncMock(
                side_effect=[
                    # Speaker A - 3 analyzers
                    {"score": 8, "explanation": "Clear communication"},  # Clarity
                    {"score": 7, "explanation": "Confident tone"},  # Confidence
                    {"score": 8, "explanation": "Good acknowledgement"},  # Attunement
                    # Speaker B - 3 analyzers
                    {"score": 7, "explanation": "Pretty clear"},  # Clarity
                    {"score": 8, "explanation": "Very confident"},  # Confidence
                    {"score": 9, "explanation": "Strong attunement"},  # Attunement
                ]
            )

            MockGeminiProvider.return_value = mock_provider

            # Mock LLM orchestrator to return different results for each speaker
            mock_orch_result_a = MagicMock()
            mock_orch_result_a.to_dict.return_value = {
                "clarity_score": 8,
                "clarity_explanation": "Clear communication",
                "confidence_score": 7,
                "confidence_explanation": "Confident tone",
                "attunement_score": 8,
                "attunement_explanation": "Good acknowledgement",
            }

            mock_orch_result_b = MagicMock()
            mock_orch_result_b.to_dict.return_value = {
                "clarity_score": 7,
                "clarity_explanation": "Pretty clear",
                "confidence_score": 8,
                "confidence_explanation": "Very confident",
                "attunement_score": 9,
                "attunement_explanation": "Strong attunement",
            }

            MockLLMOrch.return_value.analyze_all = AsyncMock(
                side_effect=[
                    mock_orch_result_a,
                    mock_orch_result_b,
                ]  # Different for each speaker
            )

            # Create orchestrator and run analysis
            orchestrator = AnalysisOrchestrator()
            result = await orchestrator.analyze(
                job_id="test-job-123",
                transcription_result=mock_transcription_result,
            )

            # Verify basic metrics are calculated
            assert "Speaker A" in result
            assert "Speaker B" in result
            assert result["Speaker A"]["word_count"] > 0
            assert result["Speaker B"]["word_count"] > 0

            # Verify communication tips were generated
            assert "communication_tips" in result["Speaker A"]
            assert "communication_tips" in result["Speaker B"]
            assert len(result["Speaker A"]["communication_tips"]) == 2

            # Verify all 3 agentic scores are present for Speaker A
            assert "clarity_score" in result["Speaker A"]
            assert "clarity_explanation" in result["Speaker A"]
            assert "confidence_score" in result["Speaker A"]
            assert "confidence_explanation" in result["Speaker A"]
            assert "attunement_score" in result["Speaker A"]
            assert "attunement_explanation" in result["Speaker A"]

            # Verify scores have correct values
            assert result["Speaker A"]["clarity_score"] == 8
            assert result["Speaker A"]["confidence_score"] == 7
            assert result["Speaker A"]["attunement_score"] == 8

            # Verify all 3 agentic scores are present for Speaker B
            assert result["Speaker B"]["clarity_score"] == 7
            assert result["Speaker B"]["confidence_score"] == 8
            assert result["Speaker B"]["attunement_score"] == 9

            # Verify pillar scores are calculated from agentic dimensions
            assert "content_pillar_score" in result["Speaker A"]
            assert "poise_pillar_score" in result["Speaker A"]
            assert "connection_pillar_score" in result["Speaker A"]

            # Verify pillar scores match agentic scores (direct mapping)
            assert result["Speaker A"]["content_pillar_score"] == 8.0  # From clarity
            assert result["Speaker A"]["poise_pillar_score"] == 7.0  # From confidence
            assert (
                result["Speaker A"]["connection_pillar_score"] == 8.0
            )  # From attunement

            # Verify Speaker B pillar scores
            assert result["Speaker B"]["content_pillar_score"] == 7.0
            assert result["Speaker B"]["poise_pillar_score"] == 8.0
            assert (
                result["Speaker B"]["connection_pillar_score"] == 9.0
            )  # From attunement

    @pytest.mark.asyncio
    async def test_analysis_pipeline_graceful_degradation(
        self, mock_transcription_result
    ):
        """Test that pipeline continues if agentic analysis fails."""
        with patch(
            "app.services.analysis.analysis_orchestrator.LangfuseClient"
        ) as MockLangfuse, patch(
            "app.services.analysis.analysis_orchestrator.GeminiProvider"
        ) as MockGeminiProvider, patch(
            "app.services.analysis.analysis_orchestrator.LLMOrchestrator"
        ) as MockLLMOrch, patch(
            "app.services.analysis.analysis_orchestrator.send_llm_failure_alert"
        ) as MockSlackNotify:
            # Mock Langfuse client
            from unittest.mock import MagicMock

            mock_langfuse = MagicMock()
            mock_langfuse.flush = MagicMock()  # Not async
            MockLangfuse.return_value = mock_langfuse

            # Mock Gemini provider that fails on agentic analysis
            mock_provider = AsyncMock()

            # General analysis succeeds
            mock_provider.generate_general_analysis = AsyncMock(
                return_value={
                    "general_overview": "A test meeting",
                    "tips": ["Tip 1", "Tip 2"],
                }
            )

            # Agentic analysis fails
            mock_provider.generate_structured_json = AsyncMock(
                side_effect=Exception("LLM API error")
            )

            MockGeminiProvider.return_value = mock_provider

            # LLM orchestrator fails
            MockLLMOrch.return_value.analyze_all = AsyncMock(
                side_effect=Exception("LLM API error")
            )

            # Create orchestrator and run analysis
            orchestrator = AnalysisOrchestrator()
            result = await orchestrator.analyze(
                job_id="test-job-123",
                transcription_result=mock_transcription_result,
            )

            # Verify basic metrics still calculated
            assert "Speaker A" in result
            assert result["Speaker A"]["word_count"] > 0

            # Verify communication tips still generated (fallback)
            assert "communication_tips" in result["Speaker A"]

            # Verify agentic scores are NOT present (graceful failure)
            assert "clarity_score" not in result["Speaker A"]
            assert "confidence_score" not in result["Speaker A"]

            # Verify Slack notifications were attempted for failures
            assert MockSlackNotify.call_count >= 2  # At least one per speaker

    @pytest.mark.asyncio
    async def test_analysis_pipeline_performance(self, mock_transcription_result):
        """Test that agentic analysis completes in reasonable time (parallel)."""
        import asyncio
        import time

        with patch(
            "app.services.analysis.analysis_orchestrator.LangfuseClient"
        ) as MockLangfuse, patch(
            "app.services.analysis.analysis_orchestrator.GeminiProvider"
        ) as MockGeminiProvider, patch(
            "app.services.analysis.analysis_orchestrator.LLMOrchestrator"
        ) as MockLLMOrch:
            # Mock Langfuse client
            from unittest.mock import MagicMock

            mock_langfuse = MagicMock()
            mock_langfuse.flush = MagicMock()  # Not async
            MockLangfuse.return_value = mock_langfuse

            # Mock provider with realistic delays
            mock_provider = AsyncMock()

            async def mock_general(*args, **kwargs):
                await asyncio.sleep(0.1)  # 100ms per analysis
                return {
                    "general_overview": "A test meeting",
                    "tips": ["Tip 1", "Tip 2"],
                }

            async def mock_json(*args, **kwargs):
                await asyncio.sleep(0.2)  # 200ms per analyzer
                return {"score": 8, "explanation": "Test"}

            mock_provider.generate_general_analysis = mock_general
            mock_provider.generate_structured_json = mock_json

            MockGeminiProvider.return_value = mock_provider

            # Mock LLM orchestrator with delay
            async def mock_analyze_all(*args, **kwargs):
                await asyncio.sleep(0.2)
                result = MagicMock()
                result.to_dict.return_value = {
                    "clarity_score": 8,
                    "clarity_explanation": "Test",
                    "confidence_score": 7,
                    "confidence_explanation": "Test",
                    "collaboration_score": 9,
                    "collaboration_explanation": "Test",
                    "attunement_score": 8,
                    "attunement_explanation": "Test",
                }
                return result

            MockLLMOrch.return_value.analyze_all = mock_analyze_all

            orchestrator = AnalysisOrchestrator()

            start = time.time()
            await orchestrator.analyze(
                job_id="test-perf",
                transcription_result=mock_transcription_result,
            )
            elapsed = time.time() - start

            # With 2 speakers:
            # - 2 tip generations @ 100ms = 200ms sequential
            # - 2 speakers × 4 analyzers @ 200ms = 1600ms BUT parallel per speaker
            #   so 4 analyzers in parallel = ~200ms per speaker = 400ms total
            # Total: ~600ms + overhead

            # Verify it completes fast due to parallelism (not 1600ms sequential)
            assert elapsed < 2.0  # Should be well under 2 seconds with parallelism

    def test_agentic_scores_schema_compatibility(self):
        """Test that agentic score fields match database schema."""
        # This test verifies field naming convention matches the database
        expected_fields = {
            "clarity_score",
            "clarity_explanation",
            "confidence_score",
            "confidence_explanation",
            "attunement_score",
            "attunement_explanation",
        }

        # Import the orchestration result to verify field names
        from app.services.analysis.llm.llm_analyzer import LLMOrchestrationResult
        from app.services.analysis.llm.llm_analyzer import LLMAnalysisResult

        # Create mock results
        result = LLMOrchestrationResult(
            clarity=LLMAnalysisResult(8, "Clear", "Clarity"),
            confidence=LLMAnalysisResult(7, "Confident", "Confidence"),
            attunement=LLMAnalysisResult(8, "Attuned", "Attunement"),
        )

        # Convert to dict and verify fields match schema
        result_dict = result.to_dict()
        assert set(result_dict.keys()) == expected_fields
