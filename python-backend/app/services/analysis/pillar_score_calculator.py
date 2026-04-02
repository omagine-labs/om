"""
Pillar score calculation service for meeting analytics.

Calculates composite pillar scores based on agentic communication dimensions.
Each pillar is computed from 1-2 underlying agentic scores on a 0-10 scale.

Pillar Formulas:
- Content Pillar: clarity_score (1-10 scale, max 1 decimal)
- Poise Pillar: confidence_score (1-10 scale, max 1 decimal)
- Connection Pillar: attunement_score (1-10 scale, max 1 decimal)
"""

from typing import Dict, Any, Optional


def calculate_pillar_scores(
    agentic_scores: Dict[str, Optional[float]],
) -> Dict[str, Optional[float]]:
    """
    Calculate pillar scores from agentic communication dimensions.

    Pillar scores are calculated as follows:
    - Content Pillar = Clarity Score
    - Poise Pillar = Confidence Score
    - Connection Pillar = Attunement Score

    All scores are on a 1-10 scale with max 1 decimal place.

    Args:
        agentic_scores: Dictionary containing agentic dimension scores:
            - clarity_score: Clarity dimension (1-10)
            - confidence_score: Confidence dimension (1-10)
            - attunement_score: Attunement dimension (1-10)

    Returns:
        Dictionary with pillar scores:
            - content_pillar_score: Content pillar (1-10, max 1 decimal)
            - poise_pillar_score: Poise pillar (1-10, max 1 decimal)
            - connection_pillar_score: Connection pillar (1-10, max 1 decimal)

        Returns None for any pillar if underlying scores are unavailable.

    Example:
        >>> agentic = {
        ...     "clarity_score": 7.5,
        ...     "confidence_score": 8.2,
        ...     "attunement_score": 7.9
        ... }
        >>> result = calculate_pillar_scores(agentic)
        >>> result
        {
            'content_pillar_score': 7.5,
            'poise_pillar_score': 8.2,
            'connection_pillar_score': 7.9
        }
    """
    # Extract agentic scores
    clarity = agentic_scores.get("clarity_score")
    confidence = agentic_scores.get("confidence_score")
    attunement = agentic_scores.get("attunement_score")

    # Calculate pillar scores (direct mapping)
    content_pillar = round(clarity, 1) if clarity is not None else None
    poise_pillar = round(confidence, 1) if confidence is not None else None
    connection_pillar = round(attunement, 1) if attunement is not None else None

    return {
        "content_pillar_score": content_pillar,
        "poise_pillar_score": poise_pillar,
        "connection_pillar_score": connection_pillar,
    }


def extract_pillar_scores(speaker_stats: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """
    Extract pillar scores from speaker statistics dictionary.

    Convenience function to calculate pillar scores from speaker stats
    returned by the analysis orchestrator.

    Args:
        speaker_stats: Speaker statistics dictionary containing agentic scores

    Returns:
        Dictionary with pillar scores (same format as calculate_pillar_scores)

    Example:
        >>> stats = {
        ...     "clarity_score": 7.5,
        ...     "confidence_score": 8.2,
        ...     "attunement_score": 7.9,
        ...     "word_count": 1500,
        ...     "percentage": 45.2
        ... }
        >>> pillar_scores = extract_pillar_scores(stats)
        >>> pillar_scores['content_pillar_score']
        7.5
    """
    agentic_scores = {
        "clarity_score": speaker_stats.get("clarity_score"),
        "confidence_score": speaker_stats.get("confidence_score"),
        "attunement_score": speaker_stats.get("attunement_score"),
    }

    return calculate_pillar_scores(agentic_scores)
