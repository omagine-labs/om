"""
Langfuse Client Wrapper

Provides observability for LLM operations with graceful degradation.
If Langfuse credentials are not configured, operations continue without tracing.

Uses the Langfuse Python SDK decorator-based API.
"""

import os
import logging
from typing import Optional
from functools import wraps

logger = logging.getLogger(__name__)


class LangfuseClient:
    """
    Wrapper for Langfuse observability with graceful degradation.

    If Langfuse credentials are not configured, methods return no-op decorators
    and the application continues to function normally.
    """

    def __init__(
        self,
        public_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        host: Optional[str] = None,
    ):
        """
        Initialize Langfuse client.

        Args:
            public_key: Langfuse public key (or from LANGFUSE_PUBLIC_KEY env)
            secret_key: Langfuse secret key (or from LANGFUSE_SECRET_KEY env)
            host: Langfuse host URL (or from LANGFUSE_HOST env)
        """
        # Try environment variables if not provided
        self.public_key = public_key or os.getenv("LANGFUSE_PUBLIC_KEY")
        self.secret_key = secret_key or os.getenv("LANGFUSE_SECRET_KEY")
        self.host = host or os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

        self._enabled = bool(self.public_key and self.secret_key)
        self._observe_decorator = None

        if self._enabled:
            try:
                # Initialize Langfuse with environment variables
                os.environ["LANGFUSE_PUBLIC_KEY"] = self.public_key
                os.environ["LANGFUSE_SECRET_KEY"] = self.secret_key
                os.environ["LANGFUSE_HOST"] = self.host

                # Import and configure Langfuse (v3 API)
                from langfuse import observe, get_client

                self._observe_decorator = observe
                self._client = get_client()

                logger.info("✅ Langfuse observability enabled")
            except ImportError as e:
                logger.warning(
                    f"langfuse package not installed - "
                    f"observability disabled. Error: {e}"
                )
                self._enabled = False
            except Exception as e:
                logger.warning(f"Failed to initialize Langfuse: {e}")
                self._enabled = False
        else:
            logger.info("ℹ️  Langfuse not configured (observability disabled)")

    def is_enabled(self) -> bool:
        """Check if Langfuse is enabled and configured."""
        return self._enabled

    def observe(self, **kwargs):
        """
        Decorator to observe function calls with Langfuse.

        If Langfuse is not enabled, returns a no-op decorator.

        Args:
            **kwargs: Arguments to pass to Langfuse @observe decorator
                     (name, as_type, capture_input, capture_output, etc.)

        Returns:
            Decorator function
        """
        if self._enabled and self._observe_decorator:
            return self._observe_decorator(**kwargs)
        else:
            # No-op decorator when Langfuse is disabled
            def noop_decorator(func):
                @wraps(func)
                def wrapper(*args, **kwargs):
                    return func(*args, **kwargs)

                return wrapper

            return noop_decorator

    def get_langfuse_client(self):
        """
        Get the Langfuse client for manual span/generation updates.

        Returns:
            Langfuse client object or None if disabled
        """
        if self._enabled:
            return self._client
        return None

    def flush(self):
        """
        Flush pending traces to Langfuse.

        This ensures all traces are sent before the process exits.
        """
        if self._enabled and self._client:
            try:
                self._client.flush()
                logger.info("Langfuse traces flushed")
            except Exception as e:
                logger.warning(f"Failed to flush Langfuse traces: {e}")

    def get_prompt(self, name: str, version: Optional[int] = None):
        """
        Fetch a prompt from Langfuse prompt management.

        Args:
            name: Prompt name in Langfuse
            version: Optional specific version (defaults to latest production)

        Returns:
            Prompt object with compile() method, or None if not available
        """
        if not self._enabled or not self._client:
            return None

        try:
            if version:
                return self._client.get_prompt(name, version=version)
            else:
                return self._client.get_prompt(name)
        except Exception as e:
            logger.debug(f"Failed to fetch prompt '{name}' from Langfuse: {e}")
            return None
