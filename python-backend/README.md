# Python Backend - Video Processing Service

This is a FastAPI-based Python backend that handles video processing operations for the Meeting Intelligence application.

## 🎯 Purpose

Python is better suited for video processing than Node.js due to:
- Native FFmpeg bindings
- OpenCV support
- Better performance for CPU-intensive tasks
- Rich ecosystem of video/audio libraries

## 🚀 Quick Start

### Prerequisites

1. **Python 3.10+**
2. **FFmpeg** (system dependency)

Install FFmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows (with Chocolatey)
choco install ffmpeg
```

### Installation

```bash
# Navigate to python-backend directory
cd python-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
```

### Run Development Server

```bash
# From python-backend directory
uvicorn app.main:app --reload --port 8000

# Or use the root npm script (from project root)
npm run dev:python
```

The server will start at: **http://localhost:8000**

API Documentation: **http://localhost:8000/docs**

## 📡 API Endpoints

### Health Check
```bash
GET /api/health
```
Returns service status and available features.

### Extract Audio from Video
```bash
POST /api/video/extract-audio
Content-Type: multipart/form-data

Parameters:
- file: Video file (required)
- format: Audio format - "wav" or "mp3" (default: "wav")

Returns: Audio file
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/video/extract-audio \
  -F "file=@meeting.mp4" \
  -F "format=wav" \
  --output audio.wav
```

### Generate Thumbnail
```bash
POST /api/video/thumbnail
Content-Type: multipart/form-data

Parameters:
- file: Video file (required)
- timestamp: Time in seconds (default: 0.0)
- width: Thumbnail width (default: 640)
- height: Thumbnail height (default: 360)

Returns: JPEG image
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/video/thumbnail \
  -F "file=@meeting.mp4" \
  -F "timestamp=5.0" \
  -F "width=320" \
  -F "height=180" \
  --output thumbnail.jpg
```

### Get Video Information
```bash
POST /api/video/info
Content-Type: multipart/form-data

Parameters:
- file: Video file (required)

Returns: JSON with duration, resolution, codec, etc.
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/video/info \
  -F "file=@meeting.mp4"
```

**Response:**
```json
{
  "duration": 125.5,
  "size": 45678900,
  "bitrate": 2912000,
  "video": {
    "codec": "h264",
    "width": 1920,
    "height": 1080,
    "fps": 30.0
  },
  "audio": {
    "codec": "aac",
    "sample_rate": "48000",
    "channels": 2
  }
}
```

### Compress Video
```bash
POST /api/video/compress
Content-Type: multipart/form-data

Parameters:
- file: Video file (required)
- quality: "low", "medium", or "high" (default: "medium")

Returns: Compressed MP4 file
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/video/compress \
  -F "file=@meeting.mp4" \
  -F "quality=high" \
  --output compressed.mp4
```

## 🔧 Integration with Frontend

### From Next.js API Routes

```typescript
// frontend/app/api/process/route.ts
const formData = new FormData();
formData.append('file', videoFile);
formData.append('format', 'wav');

const response = await fetch('http://localhost:8000/api/video/extract-audio', {
  method: 'POST',
  body: formData,
});

const audioBlob = await response.blob();
```

### Environment Variables

In your **frontend/.env.local**:
```bash
PYTHON_BACKEND_URL=http://localhost:8000
```

## 🏗️ Project Structure

```
python-backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration
│   └── routes/
│       ├── __init__.py
│       ├── health.py        # Health check endpoints
│       └── video.py         # Video processing endpoints
├── tests/                   # Unit tests
├── storage/                 # Temporary storage (gitignored)
│   ├── uploads/
│   └── temp/
├── requirements.txt         # Python dependencies
├── .env.example            # Environment variables template
├── .gitignore
└── README.md
```

## 🧪 Testing

```bash
# Run tests (when implemented)
pytest

# Run with coverage
pytest --cov=app
```

## 📦 Dependencies

- **FastAPI** - Modern web framework
- **Uvicorn** - ASGI server
- **ffmpeg-python** - FFmpeg bindings
- **opencv-python** - Computer vision (for future features)
- **Pillow** - Image processing
- **pydantic** - Data validation

## 🚢 Production Deployment

### Using Docker

```dockerfile
FROM python:3.10-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Using Systemd (Linux)

```ini
[Unit]
Description=Python Video Processing Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/python-backend
ExecStart=/path/to/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

## 🔧 Troubleshooting

### Docker Build Issues

**Problem:** Container crashes with `ModuleNotFoundError` for packages listed in requirements.txt

**Cause:** Docker layer caching can sometimes result in stale cached layers where dependencies weren't properly installed.

**Solution:** The `npm start` script automatically detects when `requirements.txt` changes and rebuilds the image. If you encounter issues, manually rebuild:

```bash
cd python-backend
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Prevention:** The start script (`scripts/start.sh`) now includes automatic detection:
- Compares `requirements.txt` hash in the Docker image vs local file
- Automatically rebuilds with `--no-cache` when dependencies change
- This ensures fresh installs and prevents stale cache issues

### Health Check Failures

If the health check fails after deployment:
1. Check logs: `docker logs meeting-intelligence-python-backend`
2. Verify environment variables are set in `.env.local`
3. Ensure FFmpeg is installed (should be automatic in Docker)
4. Check that port 8000 isn't already in use

## 🔒 Security Notes

- Always validate file types before processing
- Implement rate limiting in production
- Use authentication for sensitive operations
- Set max file size limits
- Sanitize file names
- Use temporary files and clean up after processing

## 💡 Future Enhancements

- [ ] Video splitting/trimming
- [ ] Face detection
- [ ] Scene detection
- [ ] Speaker diarization (who spoke when)
- [ ] Video quality analysis
- [ ] Subtitle extraction/generation
- [ ] Multiple audio track handling
- [ ] Batch processing queue

## 🤝 Contributing

1. Create a feature branch
2. Add tests for new endpoints
3. Update this README
4. Submit a pull request

## 📝 License

Same as the main project.

<!-- Deployment trigger: 2025-10-20 -->

