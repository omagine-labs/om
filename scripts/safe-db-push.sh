#!/bin/bash
# Safe database migration push script
# This script adds safety checks before pushing migrations to production

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔒 Safe Database Push - Production Protection"
echo "=============================================="

# Check 1: Verify we're running in CI
if [ -z "$CI" ]; then
    echo -e "${RED}❌ ERROR: This script should only run in CI/CD!${NC}"
    echo ""
    echo "You are trying to push migrations from a local machine."
    echo "Migrations should ONLY be deployed via GitHub Actions."
    echo ""
    echo "Correct workflow:"
    echo "  1. Create migration locally: supabase migration new <name>"
    echo "  2. Test locally: supabase stop && supabase start"
    echo "  3. Commit and push to GitHub"
    echo "  4. Create PR and merge to production branch"
    echo "  5. GitHub Actions will automatically deploy"
    echo ""
    exit 1
fi

# Check 2: Verify we're on production branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "production" ]; then
    echo -e "${RED}❌ ERROR: Migrations can only be deployed from 'production' branch!${NC}"
    echo "Current branch: $CURRENT_BRANCH"
    echo ""
    exit 1
fi

# Check 3: Verify required environment variables exist
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ ERROR: SUPABASE_ACCESS_TOKEN not set!${NC}"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ ERROR: PROJECT_ID not set!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All safety checks passed${NC}"
echo ""
echo "Branch: $CURRENT_BRANCH"
echo "Environment: CI/CD"
echo "Project: $PROJECT_ID"
echo ""

# Check if there are any new migrations
NEW_MIGRATIONS=$(supabase migration list | grep -v "│" | grep -v "──" | grep -v "Local.*Remote" | tail -n +2 | awk '{print $1}' | grep -v "^$" || echo "")

if [ -z "$NEW_MIGRATIONS" ]; then
    echo -e "${YELLOW}ℹ️  No new migrations to apply${NC}"
else
    echo "📦 New migrations to apply:"
    echo "$NEW_MIGRATIONS"
    echo ""
fi

# Run the actual migration
echo "🚀 Pushing migrations to production..."
supabase db push --include-all

echo -e "${GREEN}✅ Migrations deployed successfully!${NC}"
