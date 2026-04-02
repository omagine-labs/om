"""
Tests for API key authentication middleware.

Tests authorization validation, excluded paths, header parsing, and error
handling for the APIKeyMiddleware.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI, Request, Response, status
from app.middleware.auth import APIKeyMiddleware


@pytest.fixture
def app():
    """Create a test FastAPI application."""
    return FastAPI()


@pytest.fixture
def mock_request():
    """Create a mock request object."""
    request = MagicMock(spec=Request)
    request.url = MagicMock()
    request.headers = {}
    return request


@pytest.fixture
def mock_call_next():
    """Create a mock call_next function."""
    async_mock = AsyncMock(return_value=Response(content="Success"))
    return async_mock


class TestMiddlewareInitialization:
    """Test suite for middleware initialization."""

    def test_initialization_with_default_excluded_paths(self, app):
        """Test middleware initializes with default excluded paths."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)

            assert middleware.api_key == "test-key"
            assert "/api/health" in middleware.excluded_paths
            assert "/docs" in middleware.excluded_paths
            assert "/openapi.json" in middleware.excluded_paths
            assert "/" in middleware.excluded_paths

    def test_initialization_with_custom_excluded_paths(self, app):
        """Test middleware with custom excluded paths."""
        custom_paths = ["/custom", "/test"]
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app, excluded_paths=custom_paths)

            assert middleware.excluded_paths == custom_paths

    def test_initialization_without_api_key(self, app):
        """Test middleware initialization when API_KEY is not set."""
        with patch.dict("os.environ", {}, clear=True):
            middleware = APIKeyMiddleware(app)

            assert middleware.api_key is None


class TestExcludedPaths:
    """Test suite for excluded path handling."""

    @pytest.mark.asyncio
    async def test_health_endpoint_bypasses_auth(
        self, app, mock_request, mock_call_next
    ):
        """Test that /api/health bypasses authentication."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/health"

            response = await middleware.dispatch(mock_request, mock_call_next)

            # Should call next middleware without checking auth
            mock_call_next.assert_called_once_with(mock_request)
            assert response.body == b"Success"

    @pytest.mark.asyncio
    async def test_docs_endpoint_bypasses_auth(self, app, mock_request, mock_call_next):
        """Test that /docs bypasses authentication."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/docs"

            response = await middleware.dispatch(mock_request, mock_call_next)

            mock_call_next.assert_called_once_with(mock_request)
            assert response.body == b"Success"

    @pytest.mark.asyncio
    async def test_openapi_endpoint_bypasses_auth(
        self, app, mock_request, mock_call_next
    ):
        """Test that /openapi.json bypasses authentication."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/openapi.json"

            await middleware.dispatch(mock_request, mock_call_next)

            mock_call_next.assert_called_once_with(mock_request)

    @pytest.mark.asyncio
    async def test_root_endpoint_bypasses_auth(self, app, mock_request, mock_call_next):
        """Test that / bypasses authentication."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/"

            await middleware.dispatch(mock_request, mock_call_next)

            mock_call_next.assert_called_once_with(mock_request)

    @pytest.mark.asyncio
    async def test_health_subpath_bypasses_auth(
        self, app, mock_request, mock_call_next
    ):
        """Test that /api/health/* sub-paths bypass authentication (prefix match)."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/health/sentry"

            response = await middleware.dispatch(mock_request, mock_call_next)

            mock_call_next.assert_called_once_with(mock_request)
            assert response.body == b"Success"

    @pytest.mark.asyncio
    async def test_root_subpath_requires_auth(self, app, mock_request, mock_call_next):
        """Test that /some-path does NOT bypass auth (/ matches only exactly)."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {}  # No auth header

            response = await middleware.dispatch(mock_request, mock_call_next)

            # Should require authentication
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            mock_call_next.assert_not_called()


class TestLocalDevelopmentMode:
    """Test suite for local development mode (no API_KEY set)."""

    @pytest.mark.asyncio
    async def test_no_api_key_allows_all_requests(
        self, app, mock_request, mock_call_next
    ):
        """Test that requests are allowed when API_KEY is not configured."""
        with patch.dict("os.environ", {}, clear=True):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"

            response = await middleware.dispatch(mock_request, mock_call_next)

            # Should proceed without authentication
            mock_call_next.assert_called_once_with(mock_request)
            assert response.body == b"Success"


class TestAuthorizationHeaderValidation:
    """Test suite for Authorization header validation."""

    @pytest.mark.asyncio
    async def test_missing_authorization_header_returns_401(
        self, app, mock_request, mock_call_next
    ):
        """Test that missing Authorization header returns 401."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {}  # No Authorization header

            response = await middleware.dispatch(mock_request, mock_call_next)

            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            assert "Missing Authorization header" in str(response.body)
            mock_call_next.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_header_format_returns_401(
        self, app, mock_request, mock_call_next
    ):
        """Test that invalid Authorization header format returns 401."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {
                "Authorization": "InvalidFormat test-key"  # Not Bearer
            }

            response = await middleware.dispatch(mock_request, mock_call_next)

            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            assert "Invalid Authorization header format" in str(response.body)
            assert "Expected: Bearer <token>" in str(response.body)
            mock_call_next.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_bearer_prefix_returns_401(
        self, app, mock_request, mock_call_next
    ):
        """Test that Authorization header without Bearer prefix returns 401."""
        with patch.dict("os.environ", {"API_KEY": "test-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {"Authorization": "test-key"}  # No Bearer prefix

            response = await middleware.dispatch(mock_request, mock_call_next)

            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            mock_call_next.assert_not_called()


class TestAPIKeyValidation:
    """Test suite for API key validation."""

    @pytest.mark.asyncio
    async def test_valid_api_key_allows_request(
        self, app, mock_request, mock_call_next
    ):
        """Test that valid API key allows request to proceed."""
        with patch.dict("os.environ", {"API_KEY": "correct-key-123"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {"Authorization": "Bearer correct-key-123"}

            response = await middleware.dispatch(mock_request, mock_call_next)

            # Should proceed to next middleware
            mock_call_next.assert_called_once_with(mock_request)
            assert response.body == b"Success"

    @pytest.mark.asyncio
    async def test_invalid_api_key_returns_401(self, app, mock_request, mock_call_next):
        """Test that invalid API key returns 401."""
        with patch.dict("os.environ", {"API_KEY": "correct-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {"Authorization": "Bearer wrong-key"}

            response = await middleware.dispatch(mock_request, mock_call_next)

            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            assert "Invalid API key" in str(response.body)
            mock_call_next.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_api_key_returns_401(self, app, mock_request, mock_call_next):
        """Test that empty API key in header returns 401."""
        with patch.dict("os.environ", {"API_KEY": "correct-key"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {"Authorization": "Bearer "}  # Empty key

            response = await middleware.dispatch(mock_request, mock_call_next)

            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            mock_call_next.assert_not_called()


class TestSecurityLogging:
    """Test suite to verify no sensitive key material is logged."""

    @pytest.mark.asyncio
    async def test_no_key_material_logged_on_failure(
        self, app, mock_request, mock_call_next, capsys
    ):
        """Test that middleware does NOT log API key material (security fix)."""
        with patch.dict("os.environ", {"API_KEY": "test-key-12345"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {"Authorization": "Bearer wrong-key-xyz"}

            await middleware.dispatch(mock_request, mock_call_next)

            # Verify no key material is leaked to logs
            captured = capsys.readouterr()
            assert "test-key" not in captured.out
            assert "wrong-key" not in captured.out
            assert "Provided key" not in captured.out
            assert "Expected key" not in captured.out

    @pytest.mark.asyncio
    async def test_no_key_material_logged_on_success(
        self, app, mock_request, mock_call_next, capsys
    ):
        """Test that middleware does NOT log API key on successful auth."""
        with patch.dict("os.environ", {"API_KEY": "very-long-test-key-12345"}):
            middleware = APIKeyMiddleware(app)
            mock_request.url.path = "/api/process"
            mock_request.headers = {"Authorization": "Bearer very-long-test-key-12345"}

            await middleware.dispatch(mock_request, mock_call_next)

            # Verify no key material is leaked to logs
            captured = capsys.readouterr()
            assert "very-long-" not in captured.out
            assert "test-key" not in captured.out


# Mark all test classes as unit tests
pytest.mark.unit(TestMiddlewareInitialization)
pytest.mark.unit(TestExcludedPaths)
pytest.mark.unit(TestLocalDevelopmentMode)
pytest.mark.unit(TestAuthorizationHeaderValidation)
pytest.mark.unit(TestAPIKeyValidation)
pytest.mark.unit(TestSecurityLogging)
