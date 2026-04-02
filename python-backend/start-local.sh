#!/bin/bash

###############################################################################
# Start Python Backend for Local Development
###############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

echo "========================================"
echo "  Python Backend - Local Development"
echo "========================================"
echo ""

###############################################################################
# Check Prerequisites
###############################################################################

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker not found. Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
fi

# Check if Docker is running
if ! docker ps &> /dev/null; then
    error "Docker is not running. Please start Docker Desktop and try again."
fi

info "Docker is running"

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    warn ".env.local not found"
    echo ""
    echo "Creating .env.local from .env.local.example..."
    if [ -f ".env.local.example" ]; then
        cp .env.local.example .env.local
        echo ""
        echo -e "${YELLOW}IMPORTANT:${NC} Please edit .env.local with your API keys:"
        echo "  1. Get Gemini API key: https://aistudio.google.com/app/apikey"
        echo "  2. Get local Supabase service role key from: http://localhost:54323"
        echo ""
        read -p "Press Enter after you've filled in .env.local..."
    else
        error ".env.local.example not found. Cannot create .env.local"
    fi
fi

info "Environment file found"

###############################################################################
# Build and Start Container
###############################################################################

echo ""
echo "Starting Python backend with Docker Compose..."
echo ""

# Check if image needs to be built
if ! docker images | grep -q "python-backend"; then
    warn "Image not found. Building for the first time (this may take 5-10 minutes)..."
    docker-compose build
fi

# Start the container
docker-compose up -d

# Wait for container to be healthy
echo ""
echo "Waiting for container to start..."
sleep 3

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    info "Container started successfully!"
else
    error "Container failed to start. Check logs with: docker-compose logs"
fi

###############################################################################
# Verify Service
###############################################################################

echo ""
echo "Verifying service health..."
sleep 2

# Try health check (with retry)
MAX_RETRIES=5
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        info "Health check passed!"
        echo ""
        curl -s http://localhost:8000/api/health | jq '.' 2>/dev/null || curl -s http://localhost:8000/api/health
        break
    else
        RETRY_COUNT=$((RETRY_COUNT+1))
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            warn "Health check failed. Service may still be starting up."
            echo "Check logs with: docker-compose logs -f"
        else
            echo "Retrying health check ($RETRY_COUNT/$MAX_RETRIES)..."
            sleep 2
        fi
    fi
done

###############################################################################
# Success Message
###############################################################################

echo ""
echo "========================================"
echo "  Python Backend is Running!"
echo "========================================"
echo ""
echo "Service URL:   ${GREEN}http://localhost:8000${NC}"
echo "API Docs:      ${GREEN}http://localhost:8000/docs${NC}"
echo "Health Check:  ${GREEN}http://localhost:8000/api/health${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:      docker-compose logs -f"
echo "  Stop service:   docker-compose down"
echo "  Restart:        docker-compose restart"
echo "  Rebuild:        docker-compose build --no-cache"
echo ""
echo "Note: Code changes in ./app/ will auto-reload (no restart needed)"
echo ""
