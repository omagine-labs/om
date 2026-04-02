"""
Authentication middleware for API key validation.
"""

import os
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Middleware to validate API key for all requests except health check."""

    def __init__(self, app, excluded_paths: list[str] = None):
        super().__init__(app)
        self.api_key = os.getenv("API_KEY")
        self.excluded_paths = excluded_paths or [
            "/api/health",
            "/docs",
            "/openapi.json",
            "/",
        ]

    async def dispatch(self, request: Request, call_next):
        # Skip authentication for excluded paths
        # For "/" only match exactly, for others match prefix
        path = request.url.path
        for excluded_path in self.excluded_paths:
            if excluded_path == "/" and path == "/":
                return await call_next(request)
            elif excluded_path != "/" and path.startswith(excluded_path):
                return await call_next(request)

        # Check if API key is configured
        if not self.api_key:
            # If no API key is set, allow all requests (local development)
            return await call_next(request)

        # Get API key from Authorization header
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing Authorization header"},
            )

        # Extract bearer token
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": (
                        "Invalid Authorization header format. "
                        "Expected: Bearer <token>"
                    )
                },
            )

        provided_key = auth_header.replace("Bearer ", "")

        # Validate API key (no key material logged for security)
        if provided_key != self.api_key:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid API key"},
            )

        # API key is valid, proceed with request
        return await call_next(request)
