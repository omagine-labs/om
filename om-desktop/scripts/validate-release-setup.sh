#!/bin/bash

# Validation script for GitHub Releases setup
# This script checks that everything is configured correctly before creating a release

set -e

echo "🔍 Validating GitHub Releases Setup"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: package.json version
echo -n "✓ Checking package.json version... "
PACKAGE_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}$PACKAGE_VERSION${NC}"

# Check 2: GitHub repository configuration
echo -n "✓ Checking GitHub repo config... "
REPO_URL=$(node -p "require('./package.json').repository.url")
echo -e "${GREEN}$REPO_URL${NC}"

# Check 3: electron-updater publish configuration
echo -n "✓ Checking electron-updater config... "
PUBLISH_PROVIDER=$(node -p "require('./package.json').build.publish[0].provider")
PUBLISH_OWNER=$(node -p "require('./package.json').build.publish[0].owner")
PUBLISH_REPO=$(node -p "require('./package.json').build.publish[0].repo")
echo -e "${GREEN}$PUBLISH_PROVIDER:$PUBLISH_OWNER/$PUBLISH_REPO${NC}"

# Check 4: Release type should be 'release' not 'draft'
echo -n "✓ Checking release type... "
RELEASE_TYPE=$(node -p "require('./package.json').build.publish[0].releaseType")
if [ "$RELEASE_TYPE" = "release" ]; then
  echo -e "${GREEN}$RELEASE_TYPE${NC}"
else
  echo -e "${YELLOW}$RELEASE_TYPE (should be 'release' for auto-updates)${NC}"
fi

# Check 5: dev-app-update.yml exists
echo -n "✓ Checking dev-app-update.yml... "
if [ -f "dev-app-update.yml" ]; then
  echo -e "${GREEN}exists${NC}"
else
  echo -e "${RED}missing${NC}"
  exit 1
fi

# Check 6: GitHub Actions workflow exists
echo -n "✓ Checking release workflow... "
if [ -f ".github/workflows/release.yml" ]; then
  echo -e "${GREEN}exists${NC}"
else
  echo -e "${RED}missing${NC}"
  exit 1
fi

# Check 7: Auto-updater service exists
echo -n "✓ Checking auto-updater service... "
if [ -f "src/lib/auto-updater.ts" ]; then
  echo -e "${GREEN}exists${NC}"
else
  echo -e "${RED}missing${NC}"
  exit 1
fi

# Check 8: Git status
echo -n "✓ Checking git status... "
if [ -z "$(git status --porcelain)" ]; then
  echo -e "${GREEN}clean${NC}"
else
  echo -e "${YELLOW}uncommitted changes${NC}"
  echo ""
  echo "  ${YELLOW}Warning: You have uncommitted changes. Commit them before creating a release.${NC}"
fi

# Check 9: Current branch
echo -n "✓ Checking current branch... "
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${GREEN}$CURRENT_BRANCH${NC}"

# Check 10: Remote tracking
echo -n "✓ Checking remote tracking... "
REMOTE_URL=$(git config --get remote.origin.url)
echo -e "${GREEN}$REMOTE_URL${NC}"

# Check 11: Latest tag
echo -n "✓ Checking latest git tag... "
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
if [ "$LATEST_TAG" = "none" ]; then
  echo -e "${YELLOW}no tags yet${NC}"
else
  echo -e "${GREEN}$LATEST_TAG${NC}"
fi

# Check 12: Tests pass
echo -n "✓ Running tests... "
if npm test > /dev/null 2>&1; then
  echo -e "${GREEN}passed${NC}"
else
  echo -e "${RED}failed${NC}"
  echo ""
  echo "  ${RED}Error: Tests must pass before creating a release.${NC}"
  exit 1
fi

# Check 13: Linter passes
echo -n "✓ Running linter... "
if npm run lint > /dev/null 2>&1; then
  echo -e "${GREEN}passed${NC}"
else
  echo -e "${RED}failed${NC}"
  echo ""
  echo "  ${RED}Error: Linter must pass before creating a release.${NC}"
  exit 1
fi

# Check 14: Build succeeds (optional, takes time)
if [ "$1" = "--build" ]; then
  echo -n "✓ Testing build... "
  if npm run make > /dev/null 2>&1; then
    echo -e "${GREEN}succeeded${NC}"
  else
    echo -e "${RED}failed${NC}"
    echo ""
    echo "  ${RED}Error: Build must succeed before creating a release.${NC}"
    exit 1
  fi
fi

echo ""
echo "===================================="
echo -e "${GREEN}✅ All checks passed!${NC}"
echo ""
echo "To create a release:"
echo "  1. npm version patch|minor|major"
echo "  2. git push && git push --tags"
echo ""
echo "Then monitor at:"
echo "  https://github.com/$PUBLISH_OWNER/$PUBLISH_REPO/actions"
echo ""
