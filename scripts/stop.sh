#!/bin/bash

###############################################################################
# Stop All Services
###############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

step() {
    echo -e "\n${BLUE}▶${NC} $1"
}

echo "========================================================"
echo "  Meeting Intelligence - Stop All Services"
echo "========================================================"
echo ""

# Get the script's directory and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

###############################################################################
# Stop Python Backend and Stripe
###############################################################################

step "Stopping Python backend and Stripe..."

cd python-backend

# Stop both Python backend and Stripe (if running)
# Using --profile stripe ensures Stripe container is stopped even if it was started
if docker ps | grep -q "meeting-intelligence-python-backend\|stripe-webhook-forwarder"; then
    docker-compose --profile stripe down
    if docker ps | grep -q "stripe-webhook-forwarder"; then
        info "Stripe webhook forwarder stopped"
    fi
    info "Python backend stopped"
else
    info "Python backend and Stripe were not running"
fi

cd ..

###############################################################################
# Stop Edge Functions
###############################################################################

step "Stopping Edge Functions..."

# Find and kill edge functions process
EDGE_FUNCTIONS_PID=$(pgrep -f "supabase functions serve" 2>/dev/null || true)
if [ ! -z "$EDGE_FUNCTIONS_PID" ]; then
    kill $EDGE_FUNCTIONS_PID 2>/dev/null || true
    sleep 1
    # Force kill if still running
    if pgrep -f "supabase functions serve" > /dev/null 2>&1; then
        pkill -9 -f "supabase functions serve" 2>/dev/null || true
    fi
    info "Edge functions stopped"
else
    info "Edge functions were not running"
fi

###############################################################################
# Stop Supabase
###############################################################################

step "Stopping Supabase services..."

if docker ps | grep -q "supabase"; then
    supabase stop
    info "Supabase stopped"
else
    info "Supabase was not running"
fi

###############################################################################
# Frontend Info
###############################################################################

step "Frontend (manual stop)..."

warn "Frontend must be stopped manually:"
echo "  Find the terminal running 'npm run dev' and press Ctrl+C"
echo ""

# Try to find and show running node processes (frontend)
if command -v lsof &> /dev/null; then
    FRONTEND_PID=$(lsof -ti:3000 2>/dev/null || true)
    if [ ! -z "$FRONTEND_PID" ]; then
        echo "Frontend is running on port 3000 (PID: $FRONTEND_PID)"
        echo "To kill it: kill $FRONTEND_PID"
        echo ""
    fi
fi

###############################################################################
# Desktop App Info
###############################################################################

step "Desktop App (manual stop)..."

warn "Desktop app must be stopped manually:"
echo "  Find the terminal running the desktop app and press Ctrl+C"
echo "  Or quit the Om app from the menu bar"
echo ""

# Try to find running Electron process
if command -v pgrep &> /dev/null; then
    DESKTOP_PID=$(pgrep -f "electron-forge start" 2>/dev/null || pgrep -f "Om.app" 2>/dev/null || true)
    if [ ! -z "$DESKTOP_PID" ]; then
        echo "Desktop app is running (PID: $DESKTOP_PID)"
        echo "To kill it: kill $DESKTOP_PID"
        echo ""
    fi
fi

###############################################################################
# Summary
###############################################################################

echo "========================================================"
echo "  Services Stopped"
echo "========================================================"
echo ""
echo "✓ Python backend stopped"
echo "✓ Stripe webhook forwarder stopped"
echo "✓ Edge functions stopped"
echo "✓ Supabase stopped"
echo "⚠ Frontend - stop manually (Ctrl+C in terminal)"
echo "⚠ Desktop App - stop manually (Ctrl+C in terminal or quit from menu bar)"
echo ""
echo "To start again:"
echo "  ./scripts/start.sh"
echo ""
echo "Or using npm:"
echo "  npm start"
echo ""
