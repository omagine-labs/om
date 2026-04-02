"""Configuration settings."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal
from dotenv import load_dotenv

# Load environment variables from .env.local first, then .env
env_local = Path(__file__).parent.parent / ".env.local"
env_file = Path(__file__).parent.parent / ".env"

if env_local.exists():
    load_dotenv(env_local)
elif env_file.exists():
    load_dotenv(env_file)


class Settings(BaseSettings):
    """Application settings."""

    # Server
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))

    # Storage
    upload_dir: Path = Path(os.getenv("UPLOAD_DIR", "./storage/uploads"))
    temp_dir: Path = Path(os.getenv("TEMP_DIR", "./storage/temp"))

    # Limits
    max_file_size: int = int(os.getenv("MAX_FILE_SIZE", "500"))  # MB

    # CORS
    cors_origins: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")

    # Supabase Configuration
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_secret_key: str = os.getenv("SUPABASE_SECRET_KEY", "")

    # AI Provider Configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Transcription Provider Configuration
    assemblyai_api_key: str = os.getenv("ASSEMBLYAI_API_KEY", "")
    transcription_provider: Literal["assemblyai", "mock"] = os.getenv(
        "TRANSCRIPTION_PROVIDER", "assemblyai"
    )

    # Resend Email Configuration
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    email_from_address: str = os.getenv(
        "EMAIL_FROM_ADDRESS", "notifications@omaginelabs.com"
    )
    email_from_name: str = os.getenv("EMAIL_FROM_NAME", "Om by Omagine Labs")

    # Frontend URL for generating signup links
    frontend_url: str = os.getenv("FRONTEND_URL", "https://app.omaginelabs.com")

    # Slack webhook for LLM failure alerts
    slack_webhook_url: str = os.getenv("SLACK_WEBHOOK_URL", "")

    # Preferred AI provider (auto, openai, gemini, anthropic)
    ai_provider: Literal["auto", "openai", "gemini", "anthropic"] = os.getenv(
        "AI_PROVIDER", "auto"
    )

    model_config = SettingsConfigDict(
        env_file=".env.local",  # Load from .env.local (falls back to .env)
        extra="ignore",  # Ignore extra environment variables not defined in model
    )

    def validate_ai_config(self) -> dict:
        """Validate AI configuration."""
        errors = []

        if (
            not self.openai_api_key
            and not self.gemini_api_key
            and not self.anthropic_api_key
        ):
            errors.append(
                "At least one AI provider API key is required "
                "(OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY)"
            )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "available_providers": [
                name
                for name, key in [
                    ("OpenAI", self.openai_api_key),
                    ("Gemini", self.gemini_api_key),
                    ("Anthropic", self.anthropic_api_key),
                ]
                if key
            ],
        }


settings = Settings()
