# Build arg for platform - defaults to native, set to linux/amd64 for Cloud Run
ARG TARGETPLATFORM
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fontconfig \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p storage/uploads storage/temp

# Set environment variables
ENV PYTHONPATH=/app
ENV PORT=8080

# Expose port (Cloud Run uses 8080 by default)
EXPOSE 8080

# Start command - use $PORT environment variable
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT