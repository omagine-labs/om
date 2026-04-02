#!/bin/bash

# Test Auth Flow Script
# Simulates the desktop app auth flow for debugging

set -e

echo "🔐 Testing Desktop App Auth Flow"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if app is running
check_app_running() {
  if pgrep -f "Om" > /dev/null; then
    echo -e "${GREEN}✓${NC} Desktop app is running"
    return 0
  else
    echo -e "${RED}✗${NC} Desktop app is NOT running"
    echo "  Please start the app first with: npm start"
    return 1
  fi
}

# Test 1: Check if main process has session
test_main_process_session() {
  echo ""
  echo "Test 1: Checking main process session storage..."
  echo "  This requires the app to have debug endpoints enabled"
  echo "  ${YELLOW}Note: This test is informational only${NC}"
  echo ""
}

# Test 2: Simulate deep link callback
test_deep_link() {
  echo ""
  echo "Test 2: Testing deep link handler..."

  # Check if we have access token
  if [ -z "$ACCESS_TOKEN" ] || [ -z "$REFRESH_TOKEN" ]; then
    echo -e "${YELLOW}⚠${NC} ACCESS_TOKEN and REFRESH_TOKEN environment variables not set"
    echo "  To test deep link handling, set these environment variables:"
    echo ""
    echo "  export ACCESS_TOKEN=\"your_access_token\""
    echo "  export REFRESH_TOKEN=\"your_refresh_token\""
    echo ""
    echo "  Get these from your browser after logging in to the web app:"
    echo "  1. Open DevTools (F12)"
    echo "  2. Go to Application > Local Storage"
    echo "  3. Find sb-*-auth-token"
    echo ""
    return 1
  fi

  # Construct deep link URL
  DEEP_LINK="om://auth/callback#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&expires_in=3600&token_type=bearer"

  echo "  Opening deep link:"
  echo "  ${DEEP_LINK:0:50}..."
  echo ""

  # Open the deep link
  if open "$DEEP_LINK" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Deep link opened successfully"
    echo "  Check the app to see if authentication succeeded"
    return 0
  else
    echo -e "${RED}✗${NC} Failed to open deep link"
    return 1
  fi
}

# Test 3: Check auth state via window.__authDiagnostics (development only)
test_auth_diagnostics() {
  echo ""
  echo "Test 3: Auth diagnostics (development mode only)..."
  echo "  To view auth diagnostics in the running app:"
  echo ""
  echo "  1. Open DevTools in the desktop app (Cmd+Option+I)"
  echo "  2. Run in console: await window.__authDiagnostics.log()"
  echo "  3. Or: await window.__authDiagnostics.get() for JSON"
  echo ""
  echo "  Available commands:"
  echo "    window.__authDiagnostics.log()     - Pretty print diagnostics"
  echo "    window.__authDiagnostics.get()     - Get JSON diagnostics"
  echo "    window.__authDiagnostics.validate('context') - Validate auth state"
  echo ""
}

# Test 4: Test menu bar auth diagnostics
test_menu_diagnostics() {
  echo ""
  echo "Test 4: Menu bar auth diagnostics..."
  echo "  In development mode, the menu bar has a debug option:"
  echo ""
  echo "  1. Click the Om icon in the menu bar"
  echo "  2. Look for \"Debug: Show Auth State\" menu item"
  echo "  3. Click it to see full auth diagnostics"
  echo "  4. Option to copy diagnostics to clipboard"
  echo ""
}

# Manual test checklist
show_manual_checklist() {
  echo ""
  echo "📋 Manual Test Checklist"
  echo "========================"
  echo ""
  echo "Complete authentication flow test:"
  echo ""
  echo "  [ ] 1. Quit the desktop app completely"
  echo "  [ ] 2. Start the app: npm start"
  echo "  [ ] 3. Click menu bar icon > Sign In"
  echo "  [ ] 4. Complete sign in on web"
  echo "  [ ] 5. Verify redirect back to desktop app"
  echo "  [ ] 6. Click menu bar icon > Dashboard"
  echo "  [ ] 7. Dashboard loads without \"Not authenticated\" error"
  echo "  [ ] 8. Click \"Debug: Show Auth State\" in menu"
  echo "  [ ] 9. Verify all fields show valid data"
  echo "  [ ] 10. In DevTools: run window.__authDiagnostics.log()"
  echo ""
  echo "If any step fails, check:"
  echo "  - Console logs in DevTools (Cmd+Option+I)"
  echo "  - Sentry for captured errors"
  echo "  - Auth diagnostics output"
  echo ""
}

# Main execution
main() {
  echo "Prerequisites:"
  echo "  - Desktop app must be built: npm run build"
  echo "  - App should be running: npm start"
  echo ""

  # Run tests
  check_app_running || exit 1
  test_main_process_session
  test_deep_link
  test_auth_diagnostics
  test_menu_diagnostics
  show_manual_checklist

  echo ""
  echo "🎯 Quick Commands"
  echo "================="
  echo ""
  echo "Test with your own tokens:"
  echo "  export ACCESS_TOKEN=\"your_token\""
  echo "  export REFRESH_TOKEN=\"your_token\""
  echo "  ./scripts/test-auth-flow.sh"
  echo ""
  echo "View diagnostics in running app:"
  echo "  Open DevTools > Console"
  echo "  await window.__authDiagnostics.log()"
  echo ""
}

main
