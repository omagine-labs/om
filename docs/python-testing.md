# Python Backend Testing

Testing strategy, patterns, and guidelines for the Python backend (FastAPI).

**Status**: 🚧 Testing infrastructure not yet implemented.

---

## Overview

The Python backend uses pytest for unit and integration tests.

**Test Organization**:

- `python-backend/tests/unit/` - Unit tests for services, utilities, and business logic
- `python-backend/tests/integration/` - Integration tests for API endpoints and external services
- `python-backend/tests/fixtures/` - Reusable test fixtures and mock data

---

## Running Tests

**Prerequisites**: Tests run inside the Python virtual environment (`python-backend/venv/`). The npm scripts automatically activate the venv.

### All Tests

```bash
# Run all Python tests (from project root)
npm run test:python

# Run tests with coverage report
npm run test:python:coverage

# Watch mode (re-run on changes)
npm run test:python:watch
```

### Specific Tests

```bash
# From python-backend directory
cd python-backend

# Run specific test file
pytest tests/services/analysis/test_metrics_analyzer.py

# Run specific test function
pytest tests/services/analysis/test_metrics_analyzer.py::test_verbosity_calculation

# Run tests matching pattern
pytest -k "verbosity"

# Run with verbose output
pytest -v

# Run with coverage for specific module
pytest --cov=app.services.analysis --cov-report=term-missing
```

---

## Test Structure

### Unit Tests

**Location**: `python-backend/tests/services/`

**What to Test**:

- Metrics calculation logic
- Data transformations
- Business logic functions
- Helper utilities

**Example**:

```python
# tests/services/analysis/test_metrics_analyzer.py
import pytest
from app.services.analysis.metrics_analyzer import MetricsAnalyzer

def test_verbosity_calculation(metrics_analyzer, mock_transcription):
    """Test basic verbosity calculation with multiple segments"""
    result = metrics_analyzer.analyze("job-123", mock_transcription)

    # Assert word count and segment count
    assert result["A"]["word_count"] == 9
    assert result["A"]["segments"] == 3

    # Implied verbosity = 9 / 3 = 3.0 words per segment
```

### Integration Tests

**Location**: `python-backend/tests/api/`

**What to Test**:

- API endpoint responses
- Request validation
- Authentication/authorization
- End-to-end processing flows

**Pattern**:

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_process_meeting_endpoint(client, mock_auth_token):
    """Test meeting processing endpoint"""
    response = client.post(
        "/api/process",
        json={"meeting_id": "test-123"},
        headers={"Authorization": f"Bearer {mock_auth_token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "processing"
```

---

## Test Fixtures

**Location**: `python-backend/tests/conftest.py`

Fixtures provide reusable test data and mock objects.

### Common Fixtures

```python
# tests/conftest.py
import pytest
from app.services.analysis.metrics_analyzer import MetricsAnalyzer

@pytest.fixture
def metrics_analyzer():
    """Provide MetricsAnalyzer instance"""
    return MetricsAnalyzer()

@pytest.fixture
def mock_transcription():
    """Provide mock AssemblyAI transcription result"""
    return {
        "segments": [
            {
                "speaker": "A",
                "text": "Hello world",
                "start": 0,
                "end": 1,
            },
            {
                "speaker": "B",
                "text": "Hi there friend",
                "start": 1,
                "end": 2,
            },
        ]
    }

@pytest.fixture
def mock_meeting_data():
    """Provide mock meeting database record"""
    return {
        "id": "test-meeting-123",
        "user_id": "test-user-456",
        "title": "Test Meeting",
        "duration_seconds": 3600,
    }
```

### Fixture Scopes

```python
# Function scope (default) - new instance per test
@pytest.fixture
def temp_file():
    file = create_temp_file()
    yield file
    file.unlink()  # Cleanup after each test

# Module scope - shared across test file
@pytest.fixture(scope="module")
def heavy_resource():
    resource = load_heavy_model()
    yield resource
    resource.cleanup()

# Session scope - shared across entire test run
@pytest.fixture(scope="session")
def database_connection():
    conn = create_db_connection()
    yield conn
    conn.close()
```

---

## Testing Patterns

### Testing Async Functions

```python
import pytest

@pytest.mark.asyncio
async def test_async_processing():
    """Test async function"""
    result = await async_process_meeting("meeting-123")
    assert result.status == "completed"
```

### Mocking External Services

#### AssemblyAI Transcription

```python
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_transcription_service(mock_transcription):
    """Test transcription service with mocked API"""
    with patch('app.services.transcription.aai_client') as mock_client:
        # Mock the transcription result
        mock_client.transcribe.return_value = mock_transcription

        result = await transcribe_audio("test-file.mp3")

        assert result["segments"] == mock_transcription["segments"]
        mock_client.transcribe.assert_called_once()
```

#### Supabase Database

```python
@pytest.fixture
def mock_supabase():
    """Mock Supabase client"""
    from unittest.mock import MagicMock

    mock = MagicMock()
    mock.table().select().eq().execute.return_value = {
        "data": [{"id": "123", "status": "completed"}],
        "error": None,
    }
    return mock

def test_database_query(mock_supabase):
    """Test database interaction"""
    result = fetch_meeting_data(mock_supabase, "meeting-123")
    assert result["id"] == "123"
```

### Testing Error Handling

```python
def test_empty_transcription_handling(metrics_analyzer):
    """Test handling of empty transcription"""
    empty_transcription = {"segments": []}

    result = metrics_analyzer.analyze("job-123", empty_transcription)

    # Should return empty dict, not crash
    assert result == {}

def test_missing_speaker_field(metrics_analyzer):
    """Test handling of malformed segment data"""
    bad_transcription = {
        "segments": [
            {"text": "Hello", "start": 0, "end": 1}  # Missing 'speaker'
        ]
    }

    with pytest.raises(KeyError):
        metrics_analyzer.analyze("job-123", bad_transcription)
```

### Parametrized Tests

```python
@pytest.mark.parametrize("word_count,segment_count,expected", [
    (10, 2, 5.0),   # Basic calculation
    (0, 1, 0.0),    # Empty segment
    (15, 1, 15.0),  # Single segment
    (100, 10, 10.0) # Multiple segments
])
def test_verbosity_scenarios(metrics_analyzer, word_count, segment_count, expected):
    """Test verbosity calculation with different scenarios"""
    transcription = create_mock_transcription(word_count, segment_count)
    result = metrics_analyzer.analyze("job-123", transcription)

    calculated_verbosity = result["A"]["word_count"] / result["A"]["segments"]
    assert calculated_verbosity == expected
```

---

## Testing Metrics Calculations

### Metrics Analyzer Tests

When testing metrics calculations, verify:

1. **Calculation accuracy**: Does the math match the formula?
2. **Edge cases**: Empty data, single values, extreme values
3. **Data types**: Correct types (int, float, dict)
4. **Speaker separation**: Each speaker tracked independently

**Example Test Suite**:

```python
# tests/services/analysis/test_metrics_analyzer.py

class TestVerbosityMetric:
    """Test suite for verbosity metric calculation"""

    def test_basic_calculation(self, metrics_analyzer):
        """Test standard verbosity calculation"""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello world test", "start": 0, "end": 1},
                {"speaker": "A", "text": "Another sentence here", "start": 2, "end": 3},
            ]
        }

        result = metrics_analyzer.analyze("job-123", transcription)

        assert result["A"]["word_count"] == 6  # 3 + 3 words
        assert result["A"]["segments"] == 2

    def test_multiple_speakers(self, metrics_analyzer):
        """Test that speakers are tracked separately"""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "Hello", "start": 0, "end": 1},
                {"speaker": "B", "text": "Hi there friend", "start": 1, "end": 2},
            ]
        }

        result = metrics_analyzer.analyze("job-123", transcription)

        assert result["A"]["word_count"] == 1
        assert result["B"]["word_count"] == 3

    def test_empty_segment(self, metrics_analyzer):
        """Test handling of empty text"""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "", "start": 0, "end": 1},
                {"speaker": "A", "text": "   ", "start": 2, "end": 3},  # Whitespace only
            ]
        }

        result = metrics_analyzer.analyze("job-123", transcription)

        assert result["A"]["word_count"] == 0
        assert result["A"]["segments"] == 2

    def test_multiple_spaces(self, metrics_analyzer):
        """Test word counting with irregular spacing"""
        transcription = {
            "segments": [
                {"speaker": "A", "text": "hello  world   test", "start": 0, "end": 1},
            ]
        }

        result = metrics_analyzer.analyze("job-123", transcription)

        # split() handles multiple spaces correctly
        assert result["A"]["word_count"] == 3
```

---

## Coverage Targets

- **Metrics Calculations**: >90% coverage (critical business logic)
- **API Endpoints**: >80% coverage
- **Error Handlers**: 100% coverage (all error paths tested)
- **Utilities**: >70% coverage

**Check Coverage**:

```bash
# Generate coverage report
pytest --cov=app --cov-report=html

# View in browser
open htmlcov/index.html

# Terminal report with line numbers
pytest --cov=app --cov-report=term-missing
```

---

## Best Practices

1. ✅ **Use fixtures** for reusable test data
2. ✅ **Mock external services** (APIs, databases) to isolate code under test
3. ✅ **Test edge cases** (empty, null, extreme values)
4. ✅ **Use descriptive test names** that explain what is being tested
5. ✅ **Group related tests** in classes or modules
6. ✅ **Test one thing per test** (single assertion focus)
7. ✅ **Clean up resources** (temp files, connections) in fixtures
8. ✅ **Use parametrize** for testing multiple scenarios
9. ✅ **Test error paths** not just happy paths
10. ✅ **Keep tests fast** by mocking slow operations

---

## Debugging Tests

### Test Fails with Import Error

**Problem**: Module not found

**Solution**:

- Ensure pytest is running from `python-backend/` directory
- Check `PYTHONPATH` includes `app/` directory
- Add `__init__.py` files to test directories

### Mock Not Working

**Problem**: Real function is being called instead of mock

**Solution**:

- Check mock is patching correct import path
- Ensure mock is applied before function call
- Use `return_value` for sync, `return_value` or `side_effect` for async

### Async Test Hangs

**Problem**: Async test never completes

**Solution**:

- Add `@pytest.mark.asyncio` decorator
- Check `pytest-asyncio` is installed
- Ensure all async calls use `await`

### Coverage Missing Lines

**Problem**: Coverage report shows uncovered code

**Solution**:

- Add tests for error handling branches
- Test early returns and edge cases
- Check if code is unreachable (dead code)

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Python Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd python-backend
          pip install -r requirements.txt

      - name: Run tests
        run: |
          cd python-backend
          pytest --cov=app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./python-backend/coverage.xml
```

---

## Adding New Tests

### 1. Choose Test Location

- Metrics calculation → `tests/services/analysis/`
- API endpoint → `tests/api/`
- Utility function → `tests/utils/`
- External service integration → `tests/integration/`

### 2. Create Test File

```python
# tests/services/analysis/test_new_metric.py
import pytest
from app.services.analysis.metrics_analyzer import MetricsAnalyzer

class TestNewMetric:
    """Test suite for new metric calculation"""

    def test_basic_calculation(self, metrics_analyzer, mock_transcription):
        """Test standard metric calculation"""
        result = metrics_analyzer.analyze("job-123", mock_transcription)

        # Add assertions
        assert result["A"]["new_metric"] == expected_value
```

### 3. Add Fixtures (if needed)

```python
# tests/conftest.py (or local conftest.py)
@pytest.fixture
def mock_data_for_new_metric():
    """Provide test data for new metric"""
    return {
        # Test data structure
    }
```

### 4. Run Tests

```bash
# Run new test file
pytest tests/services/analysis/test_new_metric.py -v

# Check coverage
pytest tests/services/analysis/test_new_metric.py --cov=app.services.analysis
```

---

## Resources

- [pytest Documentation](https://docs.pytest.org/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [pytest-cov](https://pytest-cov.readthedocs.io/)
- [FastAPI Testing Guide](https://fastapi.tiangolo.com/tutorial/testing/)
- [Python Mock Documentation](https://docs.python.org/3/library/unittest.mock.html)

---

## Related Documentation

- [Testing Overview](./testing.md) - General testing strategy
- [Architecture](./architecture.md) - System architecture context
- [Backend Guidelines](@.claude/backend.md) - Python code style and patterns
