#!/bin/bash

###############################################################################
# Run All PR Quality Checks Locally
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
}

step() {
    echo -e "\n${BLUE}▶${NC} $1"
}

heading() {
    echo ""
    echo "========================================================"
    echo "  $1"
    echo "========================================================"
    echo ""
}

# Get the script's directory and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Track failures
FAILED_CHECKS=()
PASSED_CHECKS=()

heading "PR Quality Checks"

info "Running all quality checks locally..."
info "Project root: $PROJECT_ROOT"

###############################################################################
# Code Quality Checks
###############################################################################

heading "Code Quality"

step "Running Prettier format check..."
if npm run format:check 2>&1; then
    info "Prettier format check passed"
    PASSED_CHECKS+=("Prettier")
else
    error "Prettier format check failed"
    echo ""
    read -p "  Auto-fix formatting issues? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        step "Fixing formatting with Prettier..."
        if npm run format; then
            info "Formatting fixed successfully"
            PASSED_CHECKS+=("Prettier")
        else
            error "Failed to fix formatting"
            FAILED_CHECKS+=("Prettier")
        fi
    else
        FAILED_CHECKS+=("Prettier")
        echo "  Fix manually with: npm run format"
    fi
fi

step "Running ESLint..."
if npm run lint 2>&1; then
    info "ESLint passed"
    PASSED_CHECKS+=("ESLint")
else
    error "ESLint failed"
    echo ""
    read -p "  Auto-fix ESLint issues? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        step "Fixing ESLint issues..."
        if npm run lint -- --fix; then
            info "ESLint issues fixed successfully"
            # Re-run to check if all issues were fixed
            if npm run lint 2>&1; then
                info "All ESLint issues resolved"
                PASSED_CHECKS+=("ESLint")
            else
                warn "Some ESLint issues remain (may require manual fixes)"
                FAILED_CHECKS+=("ESLint")
            fi
        else
            error "Failed to fix ESLint issues"
            FAILED_CHECKS+=("ESLint")
        fi
    else
        FAILED_CHECKS+=("ESLint")
        echo "  Fix manually with: npm run lint -- --fix"
    fi
fi

###############################################################################
# Tests
###############################################################################

heading "Tests"

step "Running tests with Vitest..."
if npm test 2>&1; then
    info "Tests passed"
    PASSED_CHECKS+=("Tests")
else
    error "Tests failed"
    FAILED_CHECKS+=("Tests")
    echo "  Debug with: npm test"
fi

###############################################################################
# Build Checks
###############################################################################

heading "Build Checks"

step "Checking native addons..."
if [ -f "build/Release/screen_recorder.node" ] && [ -f "build/Release/window_detector.node" ]; then
    info "Native addons found"
    PASSED_CHECKS+=("Native Addons")
else
    warn "Native addons not found - attempting rebuild..."
    if npm run rebuild 2>&1; then
        info "Native addons rebuilt successfully"
        PASSED_CHECKS+=("Native Addons")
    else
        error "Failed to rebuild native addons"
        FAILED_CHECKS+=("Native Addons")
        echo "  Fix with: npm run rebuild"
    fi
fi

step "Running TypeScript type check..."
if npx tsc --noEmit 2>&1; then
    info "TypeScript type check passed"
    PASSED_CHECKS+=("TypeScript")
else
    error "TypeScript type check failed"
    FAILED_CHECKS+=("TypeScript")
    echo "  Fix TypeScript errors manually"
fi

###############################################################################
# Summary
###############################################################################

heading "Check Summary"

echo "Passed: ${#PASSED_CHECKS[@]}"
for check in "${PASSED_CHECKS[@]}"; do
    info "$check"
done

echo ""
echo "Failed: ${#FAILED_CHECKS[@]}"
for check in "${FAILED_CHECKS[@]}"; do
    error "$check"
done

echo ""
if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  ✓ All checks passed!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Ready to push to GitHub! 🚀"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  ✗ ${#FAILED_CHECKS[@]} check(s) failed${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Please fix the failed checks before pushing."
    exit 1
fi
