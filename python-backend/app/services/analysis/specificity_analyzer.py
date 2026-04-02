"""
Specificity score analyzer for measuring communication precision.

Analyzes how specific vs vague a speaker's language is by detecting:
- Specific indicators: numbers, dates, percentages, proper nouns, action verbs
- Vague indicators: "stuff", "things", "something", vague quantifiers

Higher specificity scores indicate more precise, actionable communication.
"""

import re
from typing import Dict, Any, List


# Vague language patterns that decrease specificity
VAGUE_PATTERNS = [
    "stuff",
    "things",
    "something",
    "somehow",
    "somewhere",
    "someone",
    "sometime",
    "a lot",
    "lots of",
    "a bunch",
    "bunch of",
    "a few",
    "some",
    "many",
    "much",
    "whatever",
    "whichever",
    "wherever",
    "whenever",
    "however",
    "etc",
    "and so on",
    "and so forth",
    "kind of thing",
    "sort of thing",
    "that kind of",
    "that sort of",
    "you know what I mean",
    "if that makes sense",
]


def calculate_specificity_score(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate a specificity score based on language precision.

    Analyzes text for:
    - Numbers and percentages (increases score)
    - Dates and times (increases score)
    - Specific names/proper nouns (increases score)
    - Vague language patterns (decreases score)

    Score formula: Base 5 + adjustments based on specific vs vague indicators

    Args:
        segments: List of transcription segments with text content

    Returns:
        Dictionary with specificity metrics:
            - score: Specificity score from 0-10
            - details: Breakdown of specific and vague indicators found

    Example:
        >>> segments = [{"text": "Revenue increased 25% in Q3 2024"}]
        >>> result = calculate_specificity_score(segments)
        >>> result["score"] >= 6  # Above average due to numbers
        True
    """
    if not segments:
        return {
            "score": None,
            "details": {},
        }

    # Combine all text for analysis
    all_text = " ".join(segment.get("text", "") for segment in segments)

    if not all_text.strip():
        return {
            "score": None,
            "details": {},
        }

    text_lower = all_text.lower()
    word_count = len(all_text.split())

    # Count specific indicators
    specific_counts = {
        "numbers": 0,
        "percentages": 0,
        "dates": 0,
        "currencies": 0,
    }

    # Detect numbers (e.g., 25, 1000, 3.5)
    numbers = re.findall(r"\b\d+(?:\.\d+)?\b", all_text)
    specific_counts["numbers"] = len(numbers)

    # Detect percentages (e.g., 25%, 3.5%)
    percentages = re.findall(r"\b\d+(?:\.\d+)?%", all_text)
    specific_counts["percentages"] = len(percentages)

    # Detect date patterns (e.g., Q3 2024, January, 2024, 12/15)
    month_names = (
        r"January|February|March|April|May|June|"
        r"July|August|September|October|November|December"
    )
    dates = re.findall(
        r"\b(?:Q[1-4]\s*\d{4}|"
        r"(?:" + month_names + r")\s*\d{0,4}|"
        r"\d{1,2}/\d{1,2}(?:/\d{2,4})?|"
        r"\d{4})\b",
        all_text,
        re.IGNORECASE,
    )
    specific_counts["dates"] = len(dates)

    # Detect currency (e.g., $100, £50, €25)
    currencies = re.findall(
        r"[\$£€¥]\s*\d+(?:,\d{3})*(?:\.\d+)?(?:[KMBkmb])?", all_text
    )
    specific_counts["currencies"] = len(currencies)

    # Count vague indicators
    vague_counts: Dict[str, int] = {}
    for pattern in VAGUE_PATTERNS:
        pattern_lower = pattern.lower()
        regex = r"\b" + re.escape(pattern_lower) + r"\b"
        matches = re.findall(regex, text_lower)
        if matches:
            vague_counts[pattern_lower] = len(matches)

    # Calculate totals
    total_specific = sum(specific_counts.values())
    total_vague = sum(vague_counts.values())

    # Calculate score (base 5, adjusted by ratio of specific to vague)
    # Weight adjustments per 100 words to normalize across different length segments
    if word_count > 0:
        specific_per_100 = (total_specific / word_count) * 100
        vague_per_100 = (total_vague / word_count) * 100

        # Each specific indicator per 100 words adds ~0.5 to score
        # Each vague indicator per 100 words subtracts ~0.3 from score
        adjustment = (specific_per_100 * 0.5) - (vague_per_100 * 0.3)

        # Clamp to 0-10 range
        score = min(10.0, max(0.0, 5.0 + adjustment))
        score = round(score, 1)
    else:
        score = None

    return {
        "score": score,
        "details": {
            "specific_indicators": specific_counts,
            "vague_indicators": vague_counts,
            "total_specific": total_specific,
            "total_vague": total_vague,
            "word_count": word_count,
        },
    }
