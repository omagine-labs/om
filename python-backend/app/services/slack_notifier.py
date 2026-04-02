"""
Slack notification service for LLM analysis failures.

Sends alerts to Slack when LLM analysis fails so the team can
proactively monitor and debug issues.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Maximum characters for truncated fields to stay within Slack limits
MAX_FIELD_LENGTH = 500


def _truncate(text: str, max_length: int = MAX_FIELD_LENGTH) -> str:
    """Truncate text to max length with ellipsis indicator."""
    if not text:
        return ""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


async def send_llm_failure_alert(
    job_id: str,
    speaker: str,
    stage: str,
    error_message: str,
    meeting_id: Optional[str] = None,
    input_prompt: Optional[str] = None,
    raw_output: Optional[str] = None,
    extra_context: Optional[dict] = None,
) -> bool:
    """
    Send a Slack notification for an LLM analysis failure.

    Args:
        job_id: The job identifier
        speaker: Speaker label that failed
        stage: Analysis stage (agentic_analysis, pillar_score_calculation, general_analysis)
        error_message: The error message from the exception
        meeting_id: Optional meeting ID for reference
        input_prompt: Optional input prompt (will be truncated)
        raw_output: Optional raw LLM output (will be truncated)
        extra_context: Optional additional context dict

    Returns:
        True if notification was sent successfully, False otherwise
    """
    webhook_url = settings.slack_webhook_url

    if not webhook_url:
        logger.debug(
            f"[Job {job_id}] Slack notification skipped - no webhook URL configured"
        )
        return False

    try:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        # Build the message blocks
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "🔴 LLM Analysis Failure",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Job ID:*\n`{job_id}`"},
                    {"type": "mrkdwn", "text": f"*Speaker:*\n{speaker}"},
                    {"type": "mrkdwn", "text": f"*Stage:*\n{stage}"},
                    {"type": "mrkdwn", "text": f"*Timestamp:*\n{timestamp}"},
                ],
            },
        ]

        # Add meeting ID if provided
        if meeting_id:
            blocks.append(
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Meeting ID:*\n`{meeting_id}`"},
                    ],
                }
            )

        # Add error message
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Error:*\n```{_truncate(error_message)}```",
                },
            }
        )

        # Add input prompt if provided
        if input_prompt:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Input Prompt (truncated):*\n```{_truncate(input_prompt)}```",
                    },
                }
            )

        # Add raw output if provided
        if raw_output:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Raw Output (truncated):*\n```{_truncate(raw_output)}```",
                    },
                }
            )

        # Add extra context if provided
        if extra_context:
            context_text = "\n".join(
                f"• *{k}:* {v}" for k, v in extra_context.items() if v is not None
            )
            if context_text:
                blocks.append(
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Additional Context:*\n{context_text}",
                        },
                    }
                )

        # Add divider at the end
        blocks.append({"type": "divider"})

        payload = {
            "blocks": blocks,
            "text": f"LLM Analysis Failure: {stage} for {speaker} in job {job_id}",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()

        logger.info(f"[Job {job_id}] Slack notification sent for {stage} failure")
        return True

    except httpx.HTTPStatusError as e:
        logger.warning(
            f"[Job {job_id}] Failed to send Slack notification: HTTP {e.response.status_code}"
        )
        return False
    except httpx.RequestError as e:
        logger.warning(
            f"[Job {job_id}] Failed to send Slack notification: {type(e).__name__}"
        )
        return False
    except Exception as e:
        logger.warning(
            f"[Job {job_id}] Unexpected error sending Slack notification: {str(e)}"
        )
        return False
