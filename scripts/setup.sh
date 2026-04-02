#!/bin/bash

###############################################################################
# First-Time Setup Script
###############################################################################
# This script helps you set up the development environment interactively.
# It checks prerequisites, copies environment files, and guides you through
# configuring API keys.
###############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

step() {
    echo -e "\n${BLUE}▶${NC} ${BOLD}$1${NC}"
}

heading() {
    echo ""
    echo "========================================================"
    echo "  $1"
    echo "========================================================"
    echo ""
}

prompt() {
    echo -e "${CYAN}?${NC} $1"
}

# Get the script's directory and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Track if this is a fresh setup or update
FRESH_SETUP=false
NEEDS_RESTART=false

heading "Meeting Intelligence - First-Time Setup"

echo "This script will help you set up your local development environment."
echo "It will:"
echo "  1. Check prerequisites"
echo "  2. Install dependencies"
echo "  3. Configure environment files"
echo "  4. Guide you through API key setup"
echo "  5. Start services (optional)"
echo ""
read -p "Press Enter to continue..."

###############################################################################
# Step 1: Check Prerequisites
###############################################################################

step "Checking prerequisites..."

ALL_DEPS_INSTALLED=true

# Check Docker
if ! command -v docker &> /dev/null; then
    error "Docker not found"
    echo "  Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    ALL_DEPS_INSTALLED=false
else
    if ! docker ps &> /dev/null; then
        error "Docker is not running"
        echo "  Please start Docker Desktop and run this script again"
        ALL_DEPS_INSTALLED=false
    else
        info "Docker is running"
    fi
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js not found"
    echo "  Please install Node.js 18+: https://nodejs.org/"
    ALL_DEPS_INSTALLED=false
else
    NODE_VERSION=$(node --version)
    info "Node.js $NODE_VERSION"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    error "npm not found"
    echo "  npm should be installed with Node.js"
    ALL_DEPS_INSTALLED=false
fi

# Check Supabase CLI
if ! command -v supabase &> /dev/null; then
    error "Supabase CLI not found"
    echo "  Install with: npm install -g supabase"
    ALL_DEPS_INSTALLED=false
else
    SUPABASE_VERSION=$(supabase --version)
    info "Supabase CLI $SUPABASE_VERSION"
fi

# Check Git
if ! command -v git &> /dev/null; then
    error "Git not found"
    echo "  Please install Git: https://git-scm.com/"
    ALL_DEPS_INSTALLED=false
else
    info "Git installed"
fi

# Check Python (optional but recommended)
if ! command -v python3 &> /dev/null; then
    warn "Python 3 not found (optional - only needed for local Python backend development)"
else
    PYTHON_VERSION=$(python3 --version)
    info "Python $PYTHON_VERSION"
fi

if [ "$ALL_DEPS_INSTALLED" = false ]; then
    echo ""
    error "Some prerequisites are missing. Please install them and run this script again."
    exit 1
fi

echo ""
info "All prerequisites are installed!"

###############################################################################
# Step 2: Install Dependencies
###############################################################################

step "Installing dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
    FRESH_SETUP=true
else
    info "Root dependencies already installed"
fi

# Check frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies (this may take a few minutes)..."
    cd frontend && npm install && cd ..
    FRESH_SETUP=true
else
    info "Frontend dependencies already installed"
fi

# Check supabase dependencies
if [ ! -d "supabase/node_modules" ]; then
    echo "Installing Supabase dependencies..."
    cd supabase && npm install && cd ..
else
    info "Supabase dependencies already installed"
fi

# Check Python dependencies (optional)
if command -v python3 &> /dev/null; then
    if [ ! -f "python-backend/requirements.txt" ]; then
        warn "python-backend/requirements.txt not found. Skipping Python dependencies."
    else
        prompt "Install Python dependencies? (y/n)"
        read -r INSTALL_PYTHON
        if [[ "$INSTALL_PYTHON" =~ ^[Yy]$ ]]; then
            echo "Installing Python dependencies..."
            cd python-backend
            if [ ! -d "venv" ]; then
                python3 -m venv venv
            fi
            source venv/bin/activate
            pip install -r requirements.txt
            deactivate
            cd ..
            info "Python dependencies installed"
        fi
    fi
fi

###############################################################################
# Step 3: Configure Environment Files
###############################################################################

step "Configuring environment files..."

# Frontend .env.local
if [ ! -f "frontend/.env.local" ]; then
    echo ""
    echo "Creating frontend/.env.local from example..."
    cp frontend/.env.local.example frontend/.env.local
    info "Created frontend/.env.local"
    FRESH_SETUP=true
else
    info "frontend/.env.local already exists"
fi

# Python backend .env.local
if [ ! -f "python-backend/.env.local" ]; then
    echo ""
    echo "Creating python-backend/.env.local from example..."
    cp python-backend/.env.local.example python-backend/.env.local
    info "Created python-backend/.env.local"
    FRESH_SETUP=true
else
    info "python-backend/.env.local already exists"
fi

# Supabase functions .env (if example exists)
if [ -f "supabase/functions/.env.example" ]; then
    if [ ! -f "supabase/functions/.env" ]; then
        echo ""
        echo "Creating supabase/functions/.env from example..."
        cp supabase/functions/.env.example supabase/functions/.env
        info "Created supabase/functions/.env"
    else
        info "supabase/functions/.env already exists"
    fi
fi

###############################################################################
# Step 4: Start Supabase to Get Keys
###############################################################################

step "Starting local Supabase..."

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
        error "Failed to start Supabase"
        exit 1
    fi
fi

# Get Supabase keys
echo ""
echo "Getting Supabase keys..."
SUPABASE_STATUS=$(supabase status)

# Extract keys from status output
SUPABASE_ANON_KEY=$(echo "$SUPABASE_STATUS" | grep "anon key:" | awk '{print $3}')
SUPABASE_SERVICE_ROLE_KEY=$(echo "$SUPABASE_STATUS" | grep "service_role key:" | awk '{print $3}')

if [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    warn "Could not automatically extract Supabase keys"
    echo ""
    echo "Please manually copy keys from:"
    echo "  http://localhost:54323"
    echo ""
    echo "Or run: supabase status"
else
    info "Supabase keys retrieved"

    # Update frontend .env.local with Supabase keys
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=$SUPABASE_ANON_KEY|" frontend/.env.local
        sed -i '' "s|SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY|" frontend/.env.local
    else
        # Linux
        sed -i "s|NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=$SUPABASE_ANON_KEY|" frontend/.env.local
        sed -i "s|SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY|" frontend/.env.local
    fi

    # Update python-backend .env.local with service role key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|SUPABASE_SECRET_KEY=.*|SUPABASE_SECRET_KEY=$SUPABASE_SERVICE_ROLE_KEY|" python-backend/.env.local
    else
        sed -i "s|SUPABASE_SECRET_KEY=.*|SUPABASE_SECRET_KEY=$SUPABASE_SERVICE_ROLE_KEY|" python-backend/.env.local
    fi

    info "Supabase keys automatically configured in .env files"
fi

###############################################################################
# Step 5: API Keys Configuration Guide
###############################################################################

step "API Keys Configuration"

echo ""
echo "${BOLD}The following API keys need to be configured manually:${NC}"
echo ""

# Stripe Keys
echo "${BOLD}1. Stripe (Required for subscriptions)${NC}"
echo "   Get test keys from: ${CYAN}https://dashboard.stripe.com/test/apikeys${NC}"
echo ""
echo "   Add to ${YELLOW}frontend/.env.local${NC}:"
echo "     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx"
echo "     STRIPE_SECRET_KEY=sk_test_xxx"
echo ""
echo "   Add to ${YELLOW}python-backend/.env.local${NC}:"
echo "     STRIPE_SECRET_KEY=sk_test_xxx (same as above)"
echo ""

# Gemini Key
echo "${BOLD}2. Google Gemini AI (Required for AI analysis)${NC}"
echo "   Get free API key from: ${CYAN}https://aistudio.google.com/app/apikey${NC}"
echo ""
echo "   Add to ${YELLOW}python-backend/.env.local${NC}:"
echo "     GEMINI_API_KEY=your_gemini_api_key_here"
echo ""

# AssemblyAI Key
echo "${BOLD}3. AssemblyAI (Required for transcription)${NC}"
echo "   Get free API key from: ${CYAN}https://www.assemblyai.com/${NC}"
echo ""
echo "   Add to ${YELLOW}python-backend/.env.local${NC}:"
echo "     ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here"
echo ""

# OAuth (Optional)
echo "${BOLD}4. OAuth Providers (Optional - for Google/Microsoft login)${NC}"
echo ""
echo "   ${BOLD}Google OAuth:${NC}"
echo "   Get from: ${CYAN}https://console.cloud.google.com/apis/credentials${NC}"
echo "   Add to ${YELLOW}frontend/.env.local${NC}:"
echo "     NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id"
echo ""
echo "   ${BOLD}Microsoft OAuth:${NC}"
echo "   Get from: ${CYAN}https://portal.azure.com/${NC} → Microsoft Entra ID → App registrations"
echo "   Add to ${YELLOW}frontend/.env.local${NC}:"
echo "     NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_azure_client_id"
echo ""

echo "========================================================"
echo ""
prompt "Have you added the required API keys? (y/n)"
read -r API_KEYS_ADDED

if [[ ! "$API_KEYS_ADDED" =~ ^[Yy]$ ]]; then
    echo ""
    warn "Please add the API keys to the .env files before starting the services."
    echo ""
    echo "Edit these files:"
    echo "  - frontend/.env.local"
    echo "  - python-backend/.env.local"
    echo ""
    echo -e "Then run: ${CYAN}npm start${NC} to start all services"
    exit 0
fi

###############################################################################
# Step 6: Stripe Webhook Secret Setup
###############################################################################

step "Stripe Webhook Configuration"

echo ""
echo "Once you start the services, you'll need to configure Stripe."
echo ""
echo "${YELLOW}Important: Stripe is configured in TWO places${NC}"
echo ""
echo "Steps:"
echo "  1. Start services (next step)"
echo ""
echo "  2. Add Stripe keys to ${YELLOW}frontend/.env.local${NC}:"
echo "     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx"
echo "     STRIPE_SECRET_KEY=sk_test_xxx"
echo ""
echo "  3. Add Stripe API key to ${YELLOW}python-backend/.env.local${NC}:"
echo "     STRIPE_API_KEY=sk_test_xxx (same value as STRIPE_SECRET_KEY)"
echo ""
echo "  4. Recreate Stripe CLI container:"
echo "     ${CYAN}cd python-backend && docker-compose up -d stripe-cli${NC}"
echo ""
echo "  5. Get webhook secret:"
echo "     ${CYAN}docker logs stripe-webhook-forwarder 2>&1 | grep 'whsec_'${NC}"
echo ""
echo "  6. Add webhook secret to ${YELLOW}frontend/.env.local${NC}:"
echo "     STRIPE_WEBHOOK_SECRET=whsec_xxx"
echo ""
echo "  7. Restart frontend to load the secrets"
echo ""

###############################################################################
# Step 7: Validation
###############################################################################

step "Validating configuration..."

VALIDATION_PASSED=true

# Check frontend .env.local has required keys
if grep -q "your_.*_key_here" frontend/.env.local 2>/dev/null; then
    warn "frontend/.env.local still contains placeholder values"
    VALIDATION_PASSED=false
fi

# Check python-backend .env.local has required keys
if grep -q "your_.*_key_here" python-backend/.env.local 2>/dev/null; then
    warn "python-backend/.env.local still contains placeholder values"
    VALIDATION_PASSED=false
fi

if [ "$VALIDATION_PASSED" = true ]; then
    info "Configuration validation passed!"
else
    warn "Some configuration values still need to be updated"
    echo "Please check the .env files and add your API keys"
fi

###############################################################################
# Step 8: Start Services (Optional)
###############################################################################

echo ""
echo "========================================================"
prompt "Start all services now? (y/n)"
read -r START_SERVICES

if [[ "$START_SERVICES" =~ ^[Yy]$ ]]; then
    echo ""
    step "Starting all services..."
    echo ""

    # Run the start script
    ./scripts/start.sh
else
    echo ""
    heading "Setup Complete!"

    echo "Your development environment is configured!"
    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. ${BOLD}Start all services:${NC}"
    echo "     ${CYAN}npm start${NC}"
    echo ""
    echo "  2. ${BOLD}Configure Stripe (see output above for full steps):${NC}"
    echo "     Add STRIPE keys to frontend/.env.local"
    echo "     Add STRIPE_API_KEY to python-backend/.env.local"
    echo "     Recreate Stripe CLI, get webhook secret"
    echo "     Add STRIPE_WEBHOOK_SECRET to frontend/.env.local"
    echo ""
    echo "  3. ${BOLD}Open the app:${NC}"
    echo "     Frontend:        ${CYAN}http://localhost:3000${NC}"
    echo "     Supabase Studio: ${CYAN}http://localhost:54323${NC}"
    echo "     Python API:      ${CYAN}http://localhost:8000${NC}"
    echo ""
    echo "  4. ${BOLD}Read the docs:${NC}"
    echo "     ${CYAN}cat README.md${NC}"
    echo ""
    echo "Happy coding! 🚀"
    echo ""
fi
