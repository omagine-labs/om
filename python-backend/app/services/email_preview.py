"""
Email Preview Generator for Anonymous Upload Notifications

Generates compelling HTML email previews with key meeting insights for anonymous users.
"""

import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)


def humanize_speaker_label(label: str) -> str:
    """Convert SPEAKER_A to Speaker A"""
    return label.replace("_", " ").title()


def generate_insight_headline(speaker_stats: Dict[str, Any]) -> str:
    """
    Generate a compelling one-liner insight based on speaker statistics.

    Args:
        speaker_stats: Dictionary containing speaker statistics for all speakers

    Returns:
        A compelling one-liner insight about the meeting
    """
    if not speaker_stats:
        return "Your meeting analysis is ready!"

    # Get the speaker with the most talk time
    dominant_speaker = max(
        speaker_stats.items(), key=lambda x: x[1].get("total_time", 0)
    )
    dominant_label, dominant_stats = dominant_speaker
    dominant_percentage = dominant_stats.get("percentage", 0)

    # Get total number of speakers
    num_speakers = len(speaker_stats)

    # Calculate average filler rate for all speakers
    avg_filler_rate = (
        sum(stats.get("filler_words_per_minute", 0) for stats in speaker_stats.values())
        / num_speakers
        if num_speakers > 0
        else 0
    )

    # Get total interruptions
    total_interruptions = sum(
        stats.get("times_interrupting", 0) + stats.get("times_interrupted", 0)
        for stats in speaker_stats.values()
    )

    # Generate varied, interesting insights
    if num_speakers == 1:
        if avg_filler_rate > 15:
            return "Solo presentation with opportunities to reduce filler words."
        else:
            return "Polished solo presentation with strong clarity."
    elif dominant_percentage > 70:
        return f"One speaker dominated at {dominant_percentage:.0f}% talk time — see who and why."
    elif dominant_percentage < 30 and num_speakers > 2:
        if total_interruptions > 5:
            return (
                f"Dynamic {num_speakers}-way conversation with active back-and-forth."
            )
        else:
            return f"Collaborative discussion with balanced participation across {num_speakers} speakers."
    elif total_interruptions > 10:
        return f"Fast-paced conversation with {total_interruptions} interruptions detected."
    elif avg_filler_rate > 20:
        return f"{num_speakers} speakers analyzed — opportunities to improve clarity."
    else:
        return f"{num_speakers} speakers analyzed with personalized communication insights."


def generate_key_metrics_html(
    speaker_stats: Dict[str, Any], duration_seconds: int
) -> str:
    """
    Generate HTML snippet for 3-4 compelling metrics with email-safe inline styles.

    Args:
        speaker_stats: Dictionary containing speaker statistics for all speakers
        duration_seconds: Total meeting duration in seconds

    Returns:
        HTML string with key metrics styled for email
    """
    if not speaker_stats:
        return ""

    # Calculate meeting-level metrics
    num_speakers = len(speaker_stats)
    total_words = sum(stats.get("word_count", 0) for stats in speaker_stats.values())

    # Get average filler words per minute
    avg_filler_rate = (
        sum(stats.get("filler_words_per_minute", 0) for stats in speaker_stats.values())
        / num_speakers
        if num_speakers > 0
        else 0
    )

    # Get total interruptions
    total_interruptions = sum(
        stats.get("times_interrupting", 0) + stats.get("times_interrupted", 0)
        for stats in speaker_stats.values()
    )

    # Calculate words per minute (meeting pace)
    duration_minutes = duration_seconds // 60
    words_per_minute = total_words / duration_minutes if duration_minutes > 0 else 0

    # Get talk time distribution (most vs least)
    speaker_percentages = [
        stats.get("percentage", 0) for stats in speaker_stats.values()
    ]
    max_percentage = max(speaker_percentages) if speaker_percentages else 0
    min_percentage = min(speaker_percentages) if speaker_percentages else 0
    balance_gap = max_percentage - min_percentage

    # Build HTML with inline styles (email-safe) - Dynamic metrics based on data
    container_style = (
        "background-color: #f0fdfa; border-radius: 12px; padding: 24px; "
        "margin: 20px 0; font-family: -apple-system, BlinkMacSystemFont, "
        "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; "
        "border: 1px solid #ccfbf1;"
    )
    metric_box_style = (
        "background-color: white; border-radius: 8px; padding: 18px; "
        "box-shadow: 0 1px 3px rgba(0,0,0,0.05);"
    )
    metric_label_style = (
        "color: #64748b; font-size: 11px; text-transform: uppercase; "
        "letter-spacing: 0.8px; margin-bottom: 6px; font-weight: 600;"
    )
    metric_value_style = "color: #0f766e; font-size: 26px; font-weight: 700;"

    # Choose dynamic metrics based on what's interesting about this meeting
    metrics = []

    # Metric 1: Always show meeting basics
    metrics.append(
        {
            "label": "Meeting Overview",
            "value": f"{duration_minutes} min · {num_speakers} speaker{'s' if num_speakers != 1 else ''}",
            "color": "#14b8a6",
        }
    )

    # Metric 2: Show most interesting metric
    if balance_gap > 50:
        # Unbalanced conversation - show talk time distribution
        metrics.append(
            {
                "label": "Talk Time Balance",
                "value": f"{int(max_percentage)}% to {int(min_percentage)}% split",
                "color": "#0d9488",
            }
        )
    elif words_per_minute > 180:
        # Fast-paced meeting
        metrics.append(
            {
                "label": "Meeting Pace",
                "value": f"{int(words_per_minute)} words/min (Fast!)",
                "color": "#0d9488",
            }
        )
    else:
        # Default to total words
        metrics.append(
            {
                "label": "Words Spoken",
                "value": f"{total_words:,} words",
                "color": "#0d9488",
            }
        )

    # Metric 3: Show filler words if interesting, otherwise interruptions
    if avg_filler_rate > 15:
        metrics.append(
            {
                "label": "Clarity Opportunity",
                "value": f"{avg_filler_rate:.1f} filler words/min",
                "color": "#f59e0b",
            }
        )
    elif total_interruptions > 5:
        metrics.append(
            {
                "label": "Conversation Energy",
                "value": f"{total_interruptions} interruptions",
                "color": "#f59e0b",
            }
        )
    else:
        metrics.append(
            {
                "label": "Communication Style",
                "value": "Smooth & Focused",
                "color": "#10b981",
            }
        )

    # Build metrics HTML
    metrics_html = ""
    for metric in metrics:
        metrics_html += f"""
            <div style="{metric_box_style} border-left: 4px solid {metric['color']};">
                <div style="{metric_label_style}">{metric['label']}</div>
                <div style="{metric_value_style}">{metric['value']}</div>
            </div>
        """

    html = f"""
    <div style="{container_style}">
        <h2 style="color: #0f766e; font-size: 20px; font-weight: 700; \
margin: 0 0 18px 0;">Key Takeaways</h2>
        <div style="display: grid; gap: 14px;">
            {metrics_html}
        </div>
    </div>
    """

    return html


def generate_email_preview(
    meeting_id: str,
    duration_seconds: int,
    speaker_stats: Dict[str, Any],
    signup_url: Optional[str] = None,  # Keep param for backward compatibility
    access_token: Optional[str] = None,
) -> str:
    """
    Generate complete HTML email preview for anonymous upload completion.

    Args:
        meeting_id: The meeting identifier
        duration_seconds: Total meeting duration in seconds
        speaker_stats: Dictionary containing speaker statistics for all speakers
        signup_url: Deprecated - kept for backward compatibility
        access_token: Secret token for secure access to the analysis preview

    Returns:
        Complete HTML email body
    """
    insight_headline = generate_insight_headline(speaker_stats)
    metrics_html = generate_key_metrics_html(speaker_stats, duration_seconds)

    # Link to analysis preview page with access token for security
    preview_url = f"{settings.frontend_url}/analysis/{meeting_id}"
    if access_token:
        preview_url = f"{preview_url}?token={access_token}"

    # Email styles - updated to match new teal theme
    body_style = (
        "margin: 0; padding: 0; background-color: #ffffff; "
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
        "'Helvetica Neue', Arial, sans-serif;"
    )
    header_style = (
        "color: #0f766e; font-size: 28px; font-weight: 700; " "margin: 0 0 8px 0;"
    )
    cta_bg_style = (
        "background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); "
        "border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0;"
    )
    cta_text_style = (
        "color: rgba(255, 255, 255, 0.95); font-size: 15px; "
        "margin: 0 0 24px 0; line-height: 1.5;"
    )
    cta_button_style = (
        "display: inline-block; background-color: white; color: #0d9488; "
        "text-decoration: none; padding: 14px 32px; border-radius: 8px; "
        "font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Meeting Analysis is Ready</title>
    </head>
    <body style="{body_style}">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="{header_style}">✨ Your Meeting Analysis is Ready!</h1>
                <p style="color: #64748b; font-size: 17px; margin: 0; line-height: 1.5;">
                    {insight_headline}
                </p>
            </div>

            <!-- Key Metrics -->
            {metrics_html}

            <!-- CTA Section -->
            <div style="{cta_bg_style}">
                <h2 style="color: white; font-size: 24px; font-weight: 700; \
margin: 0 0 14px 0;">
                    Identify Yourself & See Your Results
                </h2>
                <p style="{cta_text_style}">
                    Click below to select which speaker you are and unlock \
your personalized communication scores, detailed metrics, and actionable tips.
                </p>
                <a href="{preview_url}" style="{cta_button_style}">
                    View My Analysis →
                </a>
            </div>

            <!-- Footer -->
            <div style="text-align: center; padding-top: 24px; \
border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    Powered by <strong style="color: #6b7280;">Omagine</strong> \
| AI-powered meeting intelligence.
                </p>
                <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">
                    Your recording will be automatically deleted after 7 days.
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    return html


def extract_preview_data(
    speaker_stats: Dict[str, Any], duration_seconds: int
) -> Dict[str, Any]:
    """
    Extract preview data to be stored in database.

    Args:
        speaker_stats: Dictionary containing speaker statistics for all speakers
        duration_seconds: Total meeting duration in seconds

    Returns:
        Dictionary with preview data to store
    """
    if not speaker_stats:
        return {
            "headline": "Your meeting analysis is ready!",
            "metrics": {},
        }

    num_speakers = len(speaker_stats)
    total_words = sum(stats.get("word_count", 0) for stats in speaker_stats.values())
    avg_filler_rate = (
        sum(stats.get("filler_words_per_minute", 0) for stats in speaker_stats.values())
        / num_speakers
        if num_speakers > 0
        else 0
    )
    total_interruptions = sum(
        stats.get("times_interrupting", 0) + stats.get("times_interrupted", 0)
        for stats in speaker_stats.values()
    )

    return {
        "headline": generate_insight_headline(speaker_stats),
        "metrics": {
            "duration_minutes": duration_seconds // 60,
            "num_speakers": num_speakers,
            "total_words": total_words,
            "avg_filler_rate": round(avg_filler_rate, 1),
            "total_interruptions": total_interruptions,
        },
    }
