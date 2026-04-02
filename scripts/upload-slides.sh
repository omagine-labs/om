#!/bin/bash

###############################################################################
# Upload Slides Script
###############################################################################
# Uploads slide images to Supabase storage and creates database entries.
#
# Usage:
#   ./scripts/upload-slides.sh <directory> [--local|--production]
#
# Examples:
#   ./scripts/upload-slides.sh ./slides-to-upload --local
#   ./scripts/upload-slides.sh ./slides-to-upload --production
#
# The script will:
#   1. Upload each image to Supabase storage with a UUID filename
#   2. Create a row in the slides table with the storage path
#
# Supported formats: jpg, jpeg, png, webp, gif
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# Parse arguments
DIRECTORY="$1"
ENVIRONMENT="${2:---local}"

if [ -z "$DIRECTORY" ]; then
  echo "Usage: $0 <directory> [--local|--production]"
  echo ""
  echo "Examples:"
  echo "  $0 ./slides-to-upload --local"
  echo "  $0 ./slides-to-upload --production"
  exit 1
fi

if [ ! -d "$DIRECTORY" ]; then
  error "Directory not found: $DIRECTORY"
fi

# Set up environment
if [ "$ENVIRONMENT" == "--local" ]; then
  SUPABASE_URL="http://127.0.0.1:54321"
  # Local service role key (standard for all local Supabase instances)
  SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
  info "Using local Supabase instance"
elif [ "$ENVIRONMENT" == "--production" ]; then
  # Load from frontend/.env.local
  if [ -f "frontend/.env.local" ]; then
    source frontend/.env.local 2>/dev/null || true
  fi

  # Support both naming conventions
  SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$NEXT_PUBLIC_SUPABASE_URL_PRODUCTION}"
  SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SUPABASE_SERVICE_ROLE_KEY_PRODUCTION}"

  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    error "Production requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in frontend/.env.local"
  fi
  warn "Using PRODUCTION Supabase - be careful!"
else
  error "Unknown environment: $ENVIRONMENT (use --local or --production)"
fi

BUCKET="slides"
UPLOADED=0
FAILED=0

# Find all image files
shopt -s nullglob nocaseglob
FILES=("$DIRECTORY"/*.{jpg,jpeg,png,webp,gif})
shopt -u nullglob nocaseglob

if [ ${#FILES[@]} -eq 0 ]; then
  warn "No image files found in $DIRECTORY"
  exit 0
fi

echo ""
echo "Found ${#FILES[@]} image(s) to upload"
echo ""

for FILE in "${FILES[@]}"; do
  FILENAME=$(basename "$FILE")
  EXTENSION="${FILENAME##*.}"
  EXTENSION_LOWER=$(echo "$EXTENSION" | tr '[:upper:]' '[:lower:]')
  UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  STORAGE_PATH="${UUID}.${EXTENSION_LOWER}"

  # Determine content type
  case "$EXTENSION_LOWER" in
    jpg|jpeg) CONTENT_TYPE="image/jpeg" ;;
    png) CONTENT_TYPE="image/png" ;;
    webp) CONTENT_TYPE="image/webp" ;;
    gif) CONTENT_TYPE="image/gif" ;;
    *) warn "Skipping unknown format: $FILENAME"; continue ;;
  esac

  echo "Uploading: $FILENAME -> $STORAGE_PATH"

  # Upload to storage
  UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: $CONTENT_TYPE" \
    --data-binary "@$FILE" \
    "$SUPABASE_URL/storage/v1/object/$BUCKET/$STORAGE_PATH")

  HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" != "200" ]; then
    warn "Failed to upload $FILENAME (HTTP $HTTP_CODE)"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Insert into database
  INSERT_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"image_url\": \"$STORAGE_PATH\", \"metadata\": {\"original_filename\": \"$FILENAME\"}}" \
    "$SUPABASE_URL/rest/v1/slides")

  HTTP_CODE=$(echo "$INSERT_RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" != "201" ]; then
    warn "Uploaded but failed to create DB entry for $FILENAME (HTTP $HTTP_CODE)"
    FAILED=$((FAILED + 1))
    continue
  fi

  info "Uploaded: $FILENAME"
  UPLOADED=$((UPLOADED + 1))
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Upload complete: $UPLOADED succeeded, $FAILED failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
