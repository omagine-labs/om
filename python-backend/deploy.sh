#!/bin/bash

###############################################################################
# Deploy Python Backend to Google Cloud Run
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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
    exit 1
}

prompt() {
    read -p "$(echo -e ${YELLOW}?${NC}) $1: " response
    echo $response
}

###############################################################################
# Step 1: Check Prerequisites
###############################################################################

echo "================================================"
echo "  Meeting Intelligence - Python Backend Deploy"
echo "================================================"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    error "gcloud CLI not found. Please install: https://cloud.google.com/sdk/docs/install"
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    error "Not authenticated with gcloud. Run: gcloud auth login"
fi

info "gcloud CLI authenticated"

###############################################################################
# Step 2: Get Project Configuration
###############################################################################

# Get current project or prompt for one
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)

if [ -z "$CURRENT_PROJECT" ]; then
    echo ""
    echo "Available projects:"
    gcloud projects list --format="table(projectId,name)"
    echo ""
    PROJECT_ID=$(prompt "Enter your GCP project ID")
    gcloud config set project $PROJECT_ID
else
    echo ""
    info "Current project: $CURRENT_PROJECT"
    USE_CURRENT=$(prompt "Use this project? (y/n)")
    if [ "$USE_CURRENT" != "y" ]; then
        echo ""
        echo "Available projects:"
        gcloud projects list --format="table(projectId,name)"
        echo ""
        PROJECT_ID=$(prompt "Enter your GCP project ID")
        gcloud config set project $PROJECT_ID
    else
        PROJECT_ID=$CURRENT_PROJECT
    fi
fi

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
info "Project number: $PROJECT_NUMBER"

# Set region
REGION=${REGION:-us-central1}
echo ""
echo "Common regions: us-central1, us-east1, us-west1, europe-west1"
CUSTOM_REGION=$(prompt "Deploy region (press Enter for default: $REGION)")
if [ ! -z "$CUSTOM_REGION" ] && [ "$CUSTOM_REGION" != "y" ] && [ "$CUSTOM_REGION" != "n" ]; then
    REGION=$CUSTOM_REGION
fi
info "Using region: $REGION"

###############################################################################
# Step 3: Enable Required APIs
###############################################################################

echo ""
echo "Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet

info "APIs enabled"

###############################################################################
# Step 4: Create Artifact Registry (if needed)
###############################################################################

echo ""
echo "Checking Artifact Registry..."

if gcloud artifacts repositories describe meeting-intelligence \
    --location=$REGION &>/dev/null; then
    info "Artifact Registry repository already exists"
else
    echo "Creating Artifact Registry repository..."
    gcloud artifacts repositories create meeting-intelligence \
      --repository-format=docker \
      --location=$REGION \
      --description="Meeting Intelligence container images"
    info "Artifact Registry repository created"
fi

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
info "Docker authentication configured"

###############################################################################
# Step 5: Setup Secrets
###############################################################################

echo ""
echo "================================================"
echo "  Secret Configuration"
echo "================================================"
echo ""

# Check for .env.deploy file
if [ ! -f ".env.deploy" ]; then
    error ".env.deploy file not found! Please create it from .env.deploy.example"
fi

# Load environment variables from .env.deploy
export $(cat .env.deploy | grep -v '^#' | xargs)

info "Loaded secrets from .env.deploy"

# Validate required secrets
if [ -z "$SUPABASE_URL" ]; then
    error "SUPABASE_URL not set in .env.deploy"
fi

if [ -z "$SUPABASE_SECRET_KEY" ]; then
    error "SUPABASE_SECRET_KEY not set in .env.deploy"
fi

if [ -z "$GEMINI_API_KEY" ]; then
    warn "GEMINI_API_KEY not set in .env.deploy (you may skip if using OpenAI)"
fi

if [ -z "$ASSEMBLYAI_API_KEY" ]; then
    warn "ASSEMBLYAI_API_KEY not set in .env.deploy (transcription will use mock provider)"
fi

if [ -z "$TRANSCRIPTION_PROVIDER" ]; then
    warn "TRANSCRIPTION_PROVIDER not set in .env.deploy (defaulting to mock)"
fi

if [ -z "$LANGFUSE_PUBLIC_KEY" ]; then
    warn "LANGFUSE_PUBLIC_KEY not set in .env.deploy (LLM observability will be disabled)"
fi

if [ -z "$LANGFUSE_SECRET_KEY" ]; then
    warn "LANGFUSE_SECRET_KEY not set in .env.deploy (LLM observability will be disabled)"
fi

if [ -z "$LANGFUSE_HOST" ]; then
    warn "LANGFUSE_HOST not set in .env.deploy (defaulting to https://cloud.langfuse.com)"
    LANGFUSE_HOST="https://cloud.langfuse.com"
fi

if [ -z "$RESEND_API_KEY" ]; then
    warn "RESEND_API_KEY not set in .env.deploy (anonymous upload email notifications will be disabled)"
fi

echo ""
echo "Creating/updating secrets in Google Secret Manager..."

# Supabase URL
if gcloud secrets describe supabase-url &>/dev/null; then
    echo -n "$SUPABASE_URL" | gcloud secrets versions add supabase-url --data-file=-
    info "Updated secret 'supabase-url'"
else
    echo -n "$SUPABASE_URL" | gcloud secrets create supabase-url --data-file=-
    info "Created secret 'supabase-url'"
fi

# Supabase Secret Key
if gcloud secrets describe supabase-service-role-key &>/dev/null; then
    echo -n "$SUPABASE_SECRET_KEY" | gcloud secrets versions add supabase-service-role-key --data-file=-
    info "Updated secret 'supabase-service-role-key'"
else
    echo -n "$SUPABASE_SECRET_KEY" | gcloud secrets create supabase-service-role-key --data-file=-
    info "Created secret 'supabase-service-role-key'"
fi

# Gemini API Key
if [ ! -z "$GEMINI_API_KEY" ]; then
    if gcloud secrets describe gemini-api-key &>/dev/null; then
        echo -n "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
        info "Updated secret 'gemini-api-key'"
    else
        echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
        info "Created secret 'gemini-api-key'"
    fi
fi

# AssemblyAI API Key
if [ ! -z "$ASSEMBLYAI_API_KEY" ]; then
    if gcloud secrets describe assemblyai-api-key &>/dev/null; then
        echo -n "$ASSEMBLYAI_API_KEY" | gcloud secrets versions add assemblyai-api-key --data-file=-
        info "Updated secret 'assemblyai-api-key'"
    else
        echo -n "$ASSEMBLYAI_API_KEY" | gcloud secrets create assemblyai-api-key --data-file=-
        info "Created secret 'assemblyai-api-key'"
    fi
fi

# Langfuse Public Key
if [ ! -z "$LANGFUSE_PUBLIC_KEY" ]; then
    if gcloud secrets describe langfuse-public-key &>/dev/null; then
        echo -n "$LANGFUSE_PUBLIC_KEY" | gcloud secrets versions add langfuse-public-key --data-file=-
        info "Updated secret 'langfuse-public-key'"
    else
        echo -n "$LANGFUSE_PUBLIC_KEY" | gcloud secrets create langfuse-public-key --data-file=-
        info "Created secret 'langfuse-public-key'"
    fi
fi

# Langfuse Secret Key
if [ ! -z "$LANGFUSE_SECRET_KEY" ]; then
    if gcloud secrets describe langfuse-secret-key &>/dev/null; then
        echo -n "$LANGFUSE_SECRET_KEY" | gcloud secrets versions add langfuse-secret-key --data-file=-
        info "Updated secret 'langfuse-secret-key'"
    else
        echo -n "$LANGFUSE_SECRET_KEY" | gcloud secrets create langfuse-secret-key --data-file=-
        info "Created secret 'langfuse-secret-key'"
    fi
fi

# Langfuse Host
if [ ! -z "$LANGFUSE_HOST" ]; then
    if gcloud secrets describe langfuse-host &>/dev/null; then
        echo -n "$LANGFUSE_HOST" | gcloud secrets versions add langfuse-host --data-file=-
        info "Updated secret 'langfuse-host'"
    else
        echo -n "$LANGFUSE_HOST" | gcloud secrets create langfuse-host --data-file=-
        info "Created secret 'langfuse-host'"
    fi
fi

# Resend API Key
if [ ! -z "$RESEND_API_KEY" ]; then
    if gcloud secrets describe resend-api-key &>/dev/null; then
        echo -n "$RESEND_API_KEY" | gcloud secrets versions add resend-api-key --data-file=-
        info "Updated secret 'resend-api-key'"
    else
        echo -n "$RESEND_API_KEY" | gcloud secrets create resend-api-key --data-file=-
        info "Created secret 'resend-api-key'"
    fi
fi

# Grant secret access to Cloud Run service account
echo ""
echo "Granting secret access to Cloud Run service account..."
for SECRET in supabase-url supabase-service-role-key gemini-api-key assemblyai-api-key langfuse-public-key langfuse-secret-key langfuse-host resend-api-key; do
    if gcloud secrets describe $SECRET &>/dev/null; then
        gcloud secrets add-iam-policy-binding $SECRET \
          --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
          --role="roles/secretmanager.secretAccessor" \
          --quiet 2>/dev/null || true
    fi
done
info "Secret access configured"

###############################################################################
# Step 6: Build Container
###############################################################################

echo ""
echo "================================================"
echo "  Building Container"
echo "================================================"
echo ""

IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/meeting-intelligence/python-backend:latest"

echo "Building container image..."
echo "Image: $IMAGE_NAME"
echo ""

gcloud builds submit \
  --tag $IMAGE_NAME \
  --timeout=20m \
  .

info "Container built successfully"

###############################################################################
# Step 7: Deploy to Cloud Run
###############################################################################

echo ""
echo "================================================"
echo "  Deploying to Cloud Run"
echo "================================================"
echo ""

echo ""
echo "Deploying service..."
echo "  Memory: 2Gi"
echo "  CPU: 2"
echo "  Timeout: 300s"
echo "  Min instances: 0"
echo "  Max instances: 10"
echo ""
echo "Note: CORS not needed - Python backend only receives requests from Edge Functions"
echo ""

gcloud run deploy meeting-intelligence-backend \
  --image $IMAGE_NAME \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s \
  --min-instances 0 \
  --max-instances 10 \
  --set-secrets "SUPABASE_URL=supabase-url:latest,SUPABASE_SECRET_KEY=supabase-service-role-key:latest,GEMINI_API_KEY=gemini-api-key:latest,API_KEY=python-backend-api-key:latest,ASSEMBLYAI_API_KEY=assemblyai-api-key:latest,LANGFUSE_PUBLIC_KEY=langfuse-public-key:latest,LANGFUSE_SECRET_KEY=langfuse-secret-key:latest,LANGFUSE_HOST=langfuse-host:latest,RESEND_API_KEY=resend-api-key:latest" \
  --set-env-vars "AI_PROVIDER=gemini,TRANSCRIPTION_PROVIDER=assemblyai" \
  --quiet

###############################################################################
# Step 8: Get Service URL and Test
###############################################################################

echo ""
echo "================================================"
echo "  Deployment Complete"
echo "================================================"
echo ""

SERVICE_URL=$(gcloud run services describe meeting-intelligence-backend \
  --region $REGION \
  --format="value(status.url)")

info "Service deployed successfully!"
echo ""
echo "Service URL: ${GREEN}$SERVICE_URL${NC}"
echo ""

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "$SERVICE_URL/api/health" || echo "ERROR")

if [[ $HEALTH_RESPONSE == *"healthy"* ]]; then
    info "Health check passed!"
    echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    warn "Health check failed. Check logs with:"
    echo "  gcloud run services logs read meeting-intelligence-backend --region $REGION"
fi

echo ""
echo "================================================"
echo "  Next Steps"
echo "================================================"
echo ""
echo "1. Add this to your frontend/.env.local:"
echo "   ${YELLOW}PYTHON_BACKEND_URL=$SERVICE_URL${NC}"
echo ""
echo "2. View logs:"
echo "   gcloud run services logs read meeting-intelligence-backend --region $REGION"
echo ""
echo "3. View service details:"
echo "   gcloud run services describe meeting-intelligence-backend --region $REGION"
echo ""
echo "4. Update service (after code changes):"
echo "   ./deploy.sh"
echo ""
