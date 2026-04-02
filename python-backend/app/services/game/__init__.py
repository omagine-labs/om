"""
Game analysis services for PowerPoint Karaoke.

This package contains a simplified, faster analysis pipeline
for game recordings using Gemini video+audio analysis.
"""

from .game_analyzer import GameAnalyzer, GameAnalysisResult
from .game_orchestrator import GamePipelineOrchestrator

__all__ = ["GameAnalyzer", "GameAnalysisResult", "GamePipelineOrchestrator"]
