#!/bin/bash

###############################################################################
# Start All Services for Local Development
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

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

step() {
    echo -e "\n${BLUE}▶${NC} $1"
}

# Parse command line arguments
SKIP_DESKTOP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-desktop)
            SKIP_DESKTOP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--no-desktop]"
            exit 1
            ;;
    esac
done

echo "========================================================"
echo "  Meeting Intelligence - Start All Services"
echo "========================================================"
echo ""

# Get the script's directory and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

info "Project root: $PROJECT_ROOT"

###############################################################################
# Step 1: Check Prerequisites
###############################################################################

step "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    error "Docker not found. Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
fi

if ! docker ps &> /dev/null; then
    error "Docker is not running. Please start Docker Desktop and try again."
fi
info "Docker is running"

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js not found. Please install Node.js 18+: https://nodejs.org/"
fi
info "Node.js $(node --version)"

# Check Supabase CLI
if ! command -v supabase &> /dev/null; then
    error "Supabase CLI not found. Install with: npm install -g supabase"
fi
info "Supabase CLI $(supabase --version)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    warn "Root dependencies not installed. Running npm install..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    warn "Frontend dependencies not installed. This may take a few minutes..."
    cd frontend && npm install && cd ..
fi

###############################################################################
# Step 2: Check Environment Files
###############################################################################

step "Checking environment configuration..."

# Check frontend .env.local
if [ ! -f "frontend/.env.local" ]; then
    warn "frontend/.env.local not found"
    if [ -f "frontend/.env.local.example" ]; then
        echo "Creating frontend/.env.local from example..."
        cp frontend/.env.local.example frontend/.env.local
        echo ""
        echo -e "${YELLOW}IMPORTANT:${NC} Please edit frontend/.env.local with your Supabase keys"
        echo "After starting Supabase, get keys from: http://localhost:54323"
        echo ""
    fi
else
    info "Frontend environment configured"
fi

# Check python-backend .env.local
if [ ! -f "python-backend/.env.local" ]; then
    warn "python-backend/.env.local not found"
    if [ -f "python-backend/.env.local.example" ]; then
        echo "Creating python-backend/.env.local from example..."
        cp python-backend/.env.local.example python-backend/.env.local
        echo ""
        echo -e "${YELLOW}IMPORTANT:${NC} Please edit python-backend/.env.local with your API keys:"
        echo "  1. Gemini API: https://aistudio.google.com/app/apikey"
        echo ""
        read -p "Press Enter after you've configured python-backend/.env.local..."
    fi
else
    info "Python backend environment configured"
fi

# Check edge functions .env
if [ ! -f "supabase/functions/.env" ]; then
    if [ -f "supabase/functions/.env.example" ]; then
        echo "Creating supabase/functions/.env from example..."
        cp supabase/functions/.env.example supabase/functions/.env
        info "Edge functions environment configured"
    fi
else
    info "Edge functions environment configured"
fi

###############################################################################
# Step 3: Start Supabase
###############################################################################

step "Starting Supabase services..."

# Check if Supabase is already running
if docker ps | grep -q "supabase"; then
    info "Supabase is already running"
else
    echo "Starting Supabase (this may take a minute)..."
    supabase start

    # Wait for services to be ready
    echo "Waiting for Supabase to be ready..."
    sleep 5

    if docker ps | grep -q "supabase"; then
        info "Supabase started successfully"
    else
        error "Failed to start Supabase. Check logs with: docker ps"
    fi
fi

# Check for and apply new migrations
step "Checking for new migrations..."

# Count pending migrations (those with empty Remote column - shows as spaces between pipes)
PENDING_COUNT=$(supabase migration list --local 2>/dev/null | grep -E "^\s+[0-9]+\s+\|\s+\|" | wc -l | tr -d ' ')

if [ "$PENDING_COUNT" -gt 0 ]; then
    warn "Found $PENDING_COUNT pending migration(s)"
    echo "Applying migrations to local database..."

    # Capture output to check for out-of-order migration error
    # Use temp file with tee to avoid hanging on interactive commands
    TEMP_OUTPUT=$(mktemp)

    if supabase db push --local 2>&1 | tee "$TEMP_OUTPUT"; then
        PUSH_EXIT_CODE=0
    else
        PUSH_EXIT_CODE=$?
    fi

    # Read captured output for error checking
    PUSH_OUTPUT=$(cat "$TEMP_OUTPUT")
    rm -f "$TEMP_OUTPUT"

    # Check for SQL errors in output even if exit code is 0
    # supabase db push sometimes returns 0 even when migrations fail
    if echo "$PUSH_OUTPUT" | grep -qi "ERROR:"; then
        echo ""
        error "Migration failed with SQL error. See output above."
    fi

    if [ $PUSH_EXIT_CODE -eq 0 ]; then
        info "Migrations applied successfully"

        # Regenerate TypeScript types after migration
        echo "Regenerating database types..."
        if npm run db:types:sync > /dev/null 2>&1; then
            info "Database types updated"
        else
            warn "Failed to regenerate types. Run manually: npm run db:types:sync"
        fi
    else
        # Check if it failed due to out-of-order migrations
        if echo "$PUSH_OUTPUT" | grep -q "Found local migration files to be inserted before"; then
            echo ""
            error "Migration ordering conflict detected"
            echo ""
            echo "You have local migrations created before migrations already on production."
            echo "This usually happens when you create migrations without pulling latest changes first."
            echo ""
            echo -e "${YELLOW}Affected migrations:${NC}"
            echo "$PUSH_OUTPUT" | grep "supabase/migrations/" | sed 's/^/  /'
            echo ""
            echo -e "${YELLOW}To fix this, run:${NC}"
            echo "  supabase db push --local --include-all"
            echo "  npm run db:types:sync"
            echo ""
            echo -e "${YELLOW}To prevent this in the future:${NC}"
            echo "  1. Always pull latest changes before creating migrations"
            echo "  2. Coordinate with team when creating migrations simultaneously"
            echo ""
            exit 1
        else
            # Different error, show it and exit
            echo "$PUSH_OUTPUT"
            error "Failed to apply migrations. Check the error above."
        fi
    fi
else
    info "No pending migrations"
fi

# Display Supabase URLs
echo ""
echo "  API:    http://localhost:54321"
echo "  Studio: http://localhost:54323"

###############################################################################
# Step 3.5: Start Edge Functions
###############################################################################

step "Starting Edge Functions..."

# Clean up deno.lock if it exists (prevents version incompatibility with Supabase Edge Runtime)
# Local Deno creates lockfile v5, but Supabase Edge Runtime only supports earlier versions
if [ -f "supabase/functions/deno.lock" ]; then
    rm -f supabase/functions/deno.lock
    info "Cleaned up deno.lock (prevents Edge Runtime version mismatch)"
fi

# Check if edge functions are already running
if pgrep -f "supabase functions serve" > /dev/null 2>&1; then
    info "Edge functions are already running"
else
    # Start edge functions in background
    # Using --no-verify-jwt for local development to avoid JWT validation issues
    nohup supabase functions serve --env-file supabase/functions/.env --no-verify-jwt > /dev/null 2>&1 &

    # Wait a moment for functions to initialize
    sleep 2

    if pgrep -f "supabase functions serve" > /dev/null 2>&1; then
        info "Edge functions started successfully"
    else
        warn "Edge functions may not have started. Check manually with: supabase functions serve"
    fi
fi

echo "  Functions: http://localhost:54321/functions/v1/"

###############################################################################
# Step 4: Start Python Backend and Stripe
###############################################################################

step "Starting Python backend and Stripe..."

cd python-backend

# Check if requirements.txt has changed since last build or platform mismatch
REBUILD_NEEDED=false
if docker images | grep -q "python-backend-python-backend"; then
    # Check for platform mismatch (e.g., AMD64 image on ARM64 host)
    IMAGE_PLATFORM=$(docker inspect python-backend-python-backend:latest --format '{{.Architecture}}' 2>/dev/null || echo "unknown")
    HOST_PLATFORM=$(uname -m)
    # Normalize platform names (docker uses amd64, uname uses x86_64)
    if [ "$HOST_PLATFORM" = "x86_64" ]; then HOST_PLATFORM="amd64"; fi
    if [ "$HOST_PLATFORM" = "aarch64" ] || [ "$HOST_PLATFORM" = "arm64" ]; then HOST_PLATFORM="arm64"; fi

    if [ "$IMAGE_PLATFORM" != "$HOST_PLATFORM" ]; then
        warn "Platform mismatch detected (image: $IMAGE_PLATFORM, host: $HOST_PLATFORM) - rebuilding..."
        REBUILD_NEEDED=true
    else
        # Get the hash of requirements.txt in the current image
        CURRENT_REQ_HASH=$(docker run --rm python-backend-python-backend:latest sh -c "cat /app/requirements.txt 2>/dev/null | md5sum | cut -d' ' -f1" 2>/dev/null || echo "none")
        # Get the hash of the local requirements.txt
        LOCAL_REQ_HASH=$(md5sum requirements.txt | cut -d' ' -f1)

        if [ "$CURRENT_REQ_HASH" != "$LOCAL_REQ_HASH" ]; then
            warn "Python dependencies have changed - rebuilding image..."
            REBUILD_NEEDED=true
        else
            info "Python dependencies are up to date"
        fi
    fi
else
    # No image exists yet, will build on first start
    REBUILD_NEEDED=false
fi

# Remove old image if platform mismatch (ensures clean rebuild)
if [ "$REBUILD_NEEDED" = true ] && [ "$IMAGE_PLATFORM" != "$HOST_PLATFORM" ] 2>/dev/null; then
    info "Removing old image with wrong platform..."
    docker rmi python-backend-python-backend:latest 2>/dev/null || true
fi

# Check if containers are already running
if docker ps | grep -q "meeting-intelligence-python-backend"; then
    if [ "$REBUILD_NEEDED" = true ]; then
        info "Stopping Python backend to rebuild..."
        docker-compose down python-backend
        docker-compose build --no-cache python-backend
        docker-compose up -d
    else
        info "Python backend is already running"
    fi

    # Start Stripe if not running
    if ! docker ps | grep -q "stripe-webhook-forwarder"; then
        info "Starting Stripe webhook forwarder..."
        docker-compose up -d stripe-cli
    else
        info "Stripe webhook forwarder is already running"
    fi
else
    if [ "$REBUILD_NEEDED" = true ]; then
        # Rebuild if dependencies changed
        docker-compose build --no-cache python-backend
    fi

    # Start all services (Python backend + Stripe)
    docker-compose up -d

    # Wait for Python backend to be ready
    echo "Waiting for Python backend to be ready..."
    MAX_RETRIES=10
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
            info "Python backend started successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT+1))
            if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
                warn "Python backend health check failed. It may still be starting."
                echo "Check logs with: cd python-backend && docker-compose logs -f"
            else
                sleep 2
            fi
        fi
    done

    # Check Stripe started successfully
    if docker ps | grep -q "stripe-webhook-forwarder"; then
        info "Stripe webhook forwarder started successfully"
    else
        warn "Stripe webhook forwarder failed to start. Check logs: docker logs stripe-webhook-forwarder"
    fi
fi

echo ""
echo "  API:    http://localhost:8000"
echo "  Docs:   http://localhost:8000/docs"

cd ..

###############################################################################
# Step 5: Start Frontend
###############################################################################

step "Starting Frontend..."

# Check if frontend is already running on port 3000
if lsof -ti:3000 > /dev/null 2>&1; then
    info "Frontend is already running on port 3000"
    echo ""
else
    echo ""
    echo "The frontend will start in a new terminal window/tab."
    echo "You can also start it manually with:"
    echo "  cd frontend && npm run dev"
    echo ""

    # Try to open a new terminal tab/window based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - auto-detect current terminal (iTerm vs Terminal)
        if [[ "$TERM_PROGRAM" == "iTerm.app" ]]; then
            # Running in iTerm - create new tab
            osascript <<EOF
tell application "iTerm"
    tell current window
        set newTab to (create tab with default profile)
        tell current session of newTab
            write text "cd '$PROJECT_ROOT/frontend' && npm run dev"
        end tell
    end tell
end tell
EOF
            info "Frontend starting in new iTerm tab"
        elif [[ "$TERM_PROGRAM" == "Apple_Terminal" ]]; then
            # Running in Terminal - create new tab
            osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT/frontend' && npm run dev"
    activate
end tell
EOF
            info "Frontend starting in new Terminal tab"
        else
            # Unknown terminal - try Terminal as fallback
            osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT/frontend' && npm run dev"
    activate
end tell
EOF
            info "Frontend starting in new Terminal tab (fallback)"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux - try various terminal emulators
        if command -v gnome-terminal &> /dev/null; then
            gnome-terminal -- bash -c "cd '$PROJECT_ROOT/frontend' && npm run dev; exec bash"
            info "Frontend starting in new terminal"
        elif command -v xterm &> /dev/null; then
            xterm -e "cd '$PROJECT_ROOT/frontend' && npm run dev" &
            info "Frontend starting in new terminal"
        else
            warn "Could not open new terminal. Start frontend manually:"
            echo "  cd frontend && npm run dev"
        fi
    else
        # Windows or other
        warn "Could not detect terminal type. Start frontend manually:"
        echo "  cd frontend && npm run dev"
    fi
fi

###############################################################################
# Step 6: Start Desktop App
###############################################################################

if [ "$SKIP_DESKTOP" = true ]; then
    step "Skipping Desktop App (--no-desktop flag)"
else
    step "Starting Desktop App..."

    # Check if om-desktop directory exists
if [ ! -d "om-desktop" ]; then
    warn "om-desktop directory not found, skipping desktop app"
else
    # Check if desktop app is already running
    # In dev mode: electron-forge running from chip-mono-mvp with om-desktop
    # In production: Om.app bundle
    if pgrep -f "Om.app/Contents/MacOS" > /dev/null 2>&1 || \
       pgrep -f "chip-mono-mvp.*electron-forge" > /dev/null 2>&1 || \
       pgrep -f "chip-mono-mvp/node_modules/electron/dist/Electron.app" > /dev/null 2>&1; then
        info "Desktop app is already running"
    else
        # Check if desktop dependencies are installed
        if [ ! -d "om-desktop/node_modules" ]; then
            warn "Desktop dependencies not installed. Installing..."
            cd om-desktop && npm install && cd ..
        fi

        # Check if desktop .env exists
        if [ ! -f "om-desktop/.env" ]; then
            warn "om-desktop/.env not found"
            if [ -f "om-desktop/.env.example" ]; then
                echo "Creating om-desktop/.env from example..."
                cp om-desktop/.env.example om-desktop/.env
                echo ""
                echo -e "${YELLOW}IMPORTANT:${NC} Please edit om-desktop/.env with your configuration"
                echo "See om-desktop/.env.example for details"
                echo ""
            fi
        else
            info "Desktop environment configured"
        fi

        echo ""
        echo "The desktop app will start in a new terminal window/tab."
        echo "You can also start it manually with:"
        echo "  cd om-desktop && npm start"
        echo ""

        # Try to open a new terminal tab/window based on OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - auto-detect current terminal (iTerm vs Terminal)
        if [[ "$TERM_PROGRAM" == "iTerm.app" ]]; then
            # Running in iTerm - create new tab
            osascript <<EOF
tell application "iTerm"
    tell current window
        set newTab to (create tab with default profile)
        tell current session of newTab
            write text "cd '$PROJECT_ROOT/om-desktop' && npm start"
        end tell
    end tell
end tell
EOF
            info "Desktop app starting in new iTerm tab"
        elif [[ "$TERM_PROGRAM" == "Apple_Terminal" ]]; then
            # Running in Terminal - create new tab
            osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT/om-desktop' && npm start"
    activate
end tell
EOF
            info "Desktop app starting in new Terminal tab"
        else
            # Unknown terminal - try Terminal as fallback
            osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT/om-desktop' && npm start"
    activate
end tell
EOF
            info "Desktop app starting in new Terminal tab (fallback)"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux - try various terminal emulators
        if command -v gnome-terminal &> /dev/null; then
            gnome-terminal -- bash -c "cd '$PROJECT_ROOT/om-desktop' && npm start; exec bash"
            info "Desktop app starting in new terminal"
        elif command -v xterm &> /dev/null; then
            xterm -e "cd '$PROJECT_ROOT/om-desktop' && npm start" &
            info "Desktop app starting in new terminal"
        else
            warn "Could not open new terminal. Start desktop app manually:"
            echo "  cd om-desktop && npm start"
        fi
    else
        # Windows or other
        warn "Could not detect terminal type. Start desktop app manually:"
        echo "  cd om-desktop && npm start"
    fi
    fi
    fi
fi

###############################################################################
# Success Summary
###############################################################################

echo ""
echo "========================================================"
echo "  All Services Started!"
echo "========================================================"
echo ""
echo -e "📱 Frontend:          ${GREEN}http://localhost:3000${NC}"
if [ "$SKIP_DESKTOP" = false ]; then
    echo -e "🖥️  Desktop App:       ${GREEN}Running in menu bar${NC}"
fi
echo -e "🐍 Python Backend:    ${GREEN}http://localhost:8000${NC}"
echo -e "🗄️  Supabase API:      ${GREEN}http://localhost:54321${NC}"
echo -e "🎨 Supabase Studio:   ${GREEN}http://localhost:54323${NC}"
echo -e "⚡ Edge Functions:    ${GREEN}http://localhost:54321/functions/v1/${NC}"
echo ""
echo -e "💳 Stripe Webhook Forwarder: ${GREEN}Running${NC}"
echo ""

# Check if Stripe is fully configured
STRIPE_CONFIGURED=true

# Check frontend Stripe keys
if ! grep -q "^STRIPE_SECRET_KEY=sk_test_" "$PROJECT_ROOT/frontend/.env.local" 2>/dev/null || \
   ! grep -q "^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_" "$PROJECT_ROOT/frontend/.env.local" 2>/dev/null || \
   ! grep -q "^STRIPE_WEBHOOK_SECRET=whsec_" "$PROJECT_ROOT/frontend/.env.local" 2>/dev/null; then
    STRIPE_CONFIGURED=false
fi

# Check python-backend Stripe API key
if ! grep -q "^STRIPE_API_KEY=sk_test_" "$PROJECT_ROOT/python-backend/.env.local" 2>/dev/null; then
    STRIPE_CONFIGURED=false
fi

if [ "$STRIPE_CONFIGURED" = false ]; then
    echo "📝 First-time Stripe setup:"
    echo ""
    echo -e "  1. Add Stripe keys to ${YELLOW}frontend/.env.local${NC}:"
    echo "     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx"
    echo "     STRIPE_SECRET_KEY=sk_test_xxx"
    echo ""
    echo -e "  2. Add Stripe API key to ${YELLOW}python-backend/.env.local${NC} (for Stripe CLI container):"
    echo "     STRIPE_API_KEY=sk_test_xxx (same value as STRIPE_SECRET_KEY)"
    echo ""
    echo "  3. Recreate Stripe CLI container to load the API key:"
    echo "     cd python-backend && docker-compose up -d --force-recreate stripe-cli"
    echo ""
    echo "  4. Wait a few seconds, then get the webhook secret:"
    echo "     sleep 5 && docker logs stripe-webhook-forwarder 2>&1 | grep -A 2 'Ready!'"
    echo ""
    echo -e "  5. Add webhook secret to ${YELLOW}frontend/.env.local${NC}:"
    echo "     STRIPE_WEBHOOK_SECRET=whsec_xxx"
    echo ""
    echo "  6. Restart frontend to load the webhook secret:"
    echo "     (Stop the frontend terminal and run: cd frontend && npm run dev)"
    echo ""
else
    info "Stripe is fully configured"
    echo ""
fi
echo "📚 Useful Commands:"
echo ""
echo "  View Python logs:      cd python-backend && docker-compose logs -f"
echo "  View Stripe logs:      docker logs -f stripe-webhook-forwarder"
echo "  View Supabase status:  supabase status"
echo "  Stop all services:     ./scripts/stop.sh"
echo ""
echo "  Restart Python:        cd python-backend && docker-compose restart python-backend"
echo "  Restart Stripe:        cd python-backend && docker-compose restart stripe-cli"
echo "  Restart Supabase:      supabase stop && supabase start"
echo ""
echo "📖 Documentation:"
echo "  Main Guide:            ./README.md"
echo "  Detailed Docs:         ./docs/"
echo ""
echo "Happy coding! 🚀"
echo ""
