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
CYAN='\033[0;36m'
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

###############################################################################
# Interactive Menu
###############################################################################

# Display interactive menu and get user selection
show_menu() {
    clear
    echo "========================================================"
    echo "  PR Quality Checks - Select Scope"
    echo "========================================================"
    echo ""
    echo "Use arrow keys to navigate, Enter to select:"
    echo ""
}

# Function to display menu with current selection highlighted
display_options() {
    local selected=$1
    local options=("All" "Frontend" "Python Backend" "Supabase" "Desktop App")

    for i in "${!options[@]}"; do
        if [ $i -eq $selected ]; then
            echo -e "  ${CYAN}❯ ${options[$i]}${NC}"
        else
            echo "    ${options[$i]}"
        fi
    done
}

# Interactive menu selection
selected=0
max_options=4

# Only show interactive menu if stdin is a terminal (not in CI)
if [ -t 0 ]; then
    # Save terminal settings
    old_stty_cfg=$(stty -g)

    while true; do
        show_menu
        display_options $selected

        # Read single key without waiting for Enter
        IFS= read -rsn1 key

        case "$key" in
            $'\x1b')  # ESC sequence
                # Read the next two characters to determine arrow key
                IFS= read -rsn2 key
                case "$key" in
                    '[A')  # Up arrow
                        ((selected--))
                        if [ $selected -lt 0 ]; then
                            selected=$max_options
                        fi
                        ;;
                    '[B')  # Down arrow
                        ((selected++))
                        if [ $selected -gt $max_options ]; then
                            selected=0
                        fi
                        ;;
                esac
                ;;
            '')  # Enter key
                break
                ;;
        esac
    done

    # Map selection to scope
    case $selected in
        0) CHECK_SCOPE="all" ;;
        1) CHECK_SCOPE="frontend" ;;
        2) CHECK_SCOPE="python" ;;
        3) CHECK_SCOPE="supabase" ;;
        4) CHECK_SCOPE="desktop" ;;
    esac
else
    # Non-interactive mode (CI or piped input) - default to all
    CHECK_SCOPE="all"
fi

clear
heading "PR Quality Checks"

case $CHECK_SCOPE in
    "all")
        info "Running all quality checks..."
        ;;
    "frontend")
        info "Running frontend checks only..."
        ;;
    "python")
        info "Running Python backend checks only..."
        ;;
    "supabase")
        info "Running Supabase checks only..."
        ;;
    "desktop")
        info "Running desktop app checks only..."
        ;;
esac

info "Project root: $PROJECT_ROOT"

# Function to run a check and track result
run_check() {
    local check_name="$1"
    shift
    local check_command="$@"

    echo ""
    step "$check_name"

    if eval "$check_command" > /dev/null 2>&1; then
        info "$check_name passed"
        PASSED_CHECKS+=("$check_name")
        return 0
    else
        error "$check_name failed"
        FAILED_CHECKS+=("$check_name")
        # Don't exit, continue with other checks
        return 1
    fi
}

###############################################################################
# Frontend Checks
###############################################################################

if [ "$CHECK_SCOPE" = "all" ] || [ "$CHECK_SCOPE" = "frontend" ]; then

heading "Frontend Checks"

step "Running Prettier format check on frontend..."
if npx prettier --check "frontend/**/*.{ts,tsx,js,jsx,json,css,scss,md}" 2>&1; then
    info "Prettier format check passed"
    PASSED_CHECKS+=("Frontend: Prettier")
else
    error "Prettier format check failed"
    echo ""
    read -p "  Auto-fix formatting issues? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        step "Fixing formatting with Prettier..."
        if npm run format:frontend; then
            info "Formatting fixed successfully"
            PASSED_CHECKS+=("Frontend: Prettier")
        else
            error "Failed to fix formatting"
            FAILED_CHECKS+=("Frontend: Prettier")
        fi
    else
        FAILED_CHECKS+=("Frontend: Prettier")
        echo "  Fix manually with: npm run format:frontend"
    fi
fi

step "Running ESLint on frontend..."
if npm run lint:frontend 2>&1; then
    info "ESLint passed"
    PASSED_CHECKS+=("Frontend: ESLint")
else
    error "ESLint failed"
    echo ""
    read -p "  Auto-fix ESLint issues? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        step "Fixing ESLint issues..."
        if (cd frontend && npx eslint . --fix); then
            info "ESLint issues fixed successfully"
            # Re-run to check if all issues were fixed
            if npm run lint:frontend 2>&1; then
                info "All ESLint issues resolved"
                PASSED_CHECKS+=("Frontend: ESLint")
            else
                warn "Some ESLint issues remain (may require manual fixes)"
                FAILED_CHECKS+=("Frontend: ESLint")
            fi
        else
            error "Failed to fix ESLint issues"
            FAILED_CHECKS+=("Frontend: ESLint")
        fi
    else
        FAILED_CHECKS+=("Frontend: ESLint")
        echo "  Fix manually with: npm run lint:frontend -- --fix"
    fi
fi

step "Running frontend tests..."
if npm run test:frontend 2>&1; then
    info "Frontend tests passed"
    PASSED_CHECKS+=("Frontend: Tests")
else
    error "Frontend tests failed"
    FAILED_CHECKS+=("Frontend: Tests")
    echo "  Debug with: npm run test:frontend"
fi

step "Building frontend..."
if npm run build:frontend 2>&1; then
    info "Frontend build passed"
    PASSED_CHECKS+=("Frontend: Build")
else
    error "Frontend build failed"
    FAILED_CHECKS+=("Frontend: Build")
    echo "  Debug with: npm run build:frontend"
fi

fi  # End Frontend Checks

###############################################################################
# Python Backend Checks
###############################################################################

if [ "$CHECK_SCOPE" = "all" ] || [ "$CHECK_SCOPE" = "python" ]; then

heading "Python Backend Checks"

# Check if Python venv exists
if [ ! -d "python-backend/venv" ]; then
    warn "Python venv not found at python-backend/venv"
    warn "Skipping Python checks. Run './scripts/setup.sh' to create venv."
else
    step "Running Black format check on Python backend..."
    if (cd python-backend && source venv/bin/activate && black --check .) 2>&1; then
        info "Black format check passed"
        PASSED_CHECKS+=("Python: Black")
    else
        error "Black format check failed"
        echo ""
        read -p "  Auto-fix Python formatting with Black? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            step "Fixing Python formatting with Black..."
            if (cd python-backend && source venv/bin/activate && black .); then
                info "Python formatting fixed successfully"
                PASSED_CHECKS+=("Python: Black")
            else
                error "Failed to fix Python formatting"
                FAILED_CHECKS+=("Python: Black")
            fi
        else
            FAILED_CHECKS+=("Python: Black")
            echo "  Fix manually with: cd python-backend && source venv/bin/activate && black ."
        fi
    fi

    step "Running Flake8 linting on Python backend..."
    if (cd python-backend && source venv/bin/activate && flake8 .) 2>&1; then
        info "Flake8 passed"
        PASSED_CHECKS+=("Python: Flake8")
    else
        error "Flake8 failed"
        FAILED_CHECKS+=("Python: Flake8")
        echo "  Fix linting errors manually"
    fi

    step "Running Python tests with pytest..."
    if (cd python-backend && source venv/bin/activate && pytest -v --cov=app --cov-report=term-missing) 2>&1; then
        info "Pytest passed"
        PASSED_CHECKS+=("Python: Pytest")
    else
        error "Pytest failed"
        FAILED_CHECKS+=("Python: Pytest")
        echo "  Debug with: cd python-backend && source venv/bin/activate && pytest -v"
    fi
fi

fi  # End Python Backend Checks

###############################################################################
# Supabase Backend Checks
###############################################################################

if [ "$CHECK_SCOPE" = "all" ] || [ "$CHECK_SCOPE" = "supabase" ]; then

heading "Supabase Backend Checks"

step "Running Prettier format check on Supabase backend..."
if npx prettier --check "supabase/**/*.{ts,js,json,md}" --ignore-path ".prettierignore" 2>&1 | grep -v "database.types.ts"; then
    info "Prettier format check passed"
    PASSED_CHECKS+=("Supabase: Prettier")
else
    error "Prettier format check failed"
    echo ""
    read -p "  Auto-fix Supabase formatting issues? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        step "Fixing Supabase formatting with Prettier..."
        if npm run format:backend; then
            info "Supabase formatting fixed successfully"
            PASSED_CHECKS+=("Supabase: Prettier")
        else
            error "Failed to fix Supabase formatting"
            FAILED_CHECKS+=("Supabase: Prettier")
        fi
    else
        FAILED_CHECKS+=("Supabase: Prettier")
        echo "  Fix manually with: npm run format:backend"
    fi
fi

step "Running ESLint on Supabase backend..."
if (cd supabase && npx eslint .) 2>&1; then
    info "ESLint passed"
    PASSED_CHECKS+=("Supabase: ESLint")
else
    error "ESLint failed"
    echo ""
    read -p "  Auto-fix Supabase ESLint issues? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        step "Fixing Supabase ESLint issues..."
        if (cd supabase && npx eslint . --fix); then
            info "ESLint issues fixed successfully"
            # Re-run to check if all issues were fixed
            if (cd supabase && npx eslint .) 2>&1; then
                info "All Supabase ESLint issues resolved"
                PASSED_CHECKS+=("Supabase: ESLint")
            else
                warn "Some ESLint issues remain (may require manual fixes)"
                FAILED_CHECKS+=("Supabase: ESLint")
            fi
        else
            error "Failed to fix ESLint issues"
            FAILED_CHECKS+=("Supabase: ESLint")
        fi
    else
        FAILED_CHECKS+=("Supabase: ESLint")
        echo "  Fix manually with: cd supabase && npx eslint . --fix"
    fi
fi

step "Running TypeScript type check on Supabase backend..."
if (cd supabase && npx tsc --noEmit) 2>&1; then
    info "TypeScript type check passed"
    PASSED_CHECKS+=("Supabase: TypeScript")
else
    error "TypeScript type check failed"
    FAILED_CHECKS+=("Supabase: TypeScript")
    echo "  Debug with: cd supabase && npx tsc --noEmit"
fi

step "Running Supabase Edge Function tests..."
# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    warn "Deno not found, skipping Edge Function tests"
    warn "Install Deno: https://deno.land/#installation"
else
    # Check if any test files exist
    if ls supabase/functions/**/*.test.ts 1> /dev/null 2>&1; then
        # Run from functions directory to pick up deno.json import map
        if (cd supabase/functions && deno test --no-lock --allow-env **/*.test.ts) 2>&1; then
            info "Supabase Edge Function tests passed"
            PASSED_CHECKS+=("Supabase: Edge Function Tests")
        else
            error "Supabase Edge Function tests failed"
            FAILED_CHECKS+=("Supabase: Edge Function Tests")
            echo "  Debug with: npm run test:supabase"
        fi
    else
        info "No Supabase Edge Function tests found (skipping)"
    fi
fi

fi  # End Supabase Backend Checks

###############################################################################
# Desktop App Checks
###############################################################################

if [ "$CHECK_SCOPE" = "all" ] || [ "$CHECK_SCOPE" = "desktop" ]; then

heading "Desktop App Checks"

# Check if desktop dependencies are installed
if [ ! -d "om-desktop/node_modules" ]; then
    warn "Desktop app dependencies not installed"
    warn "Skipping desktop checks. Run 'npm install' to install dependencies."
else
    step "Running Prettier format check on desktop app..."
    if npx prettier --check "om-desktop/src/**/*.{ts,tsx,js,jsx,json,css,md}" 2>&1; then
        info "Prettier format check passed"
        PASSED_CHECKS+=("Desktop: Prettier")
    else
        error "Prettier format check failed"
        echo ""
        read -p "  Auto-fix desktop formatting issues? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            step "Fixing desktop formatting with Prettier..."
            if npm run format:desktop; then
                info "Desktop formatting fixed successfully"
                PASSED_CHECKS+=("Desktop: Prettier")
            else
                error "Failed to fix desktop formatting"
                FAILED_CHECKS+=("Desktop: Prettier")
            fi
        else
            FAILED_CHECKS+=("Desktop: Prettier")
            echo "  Fix manually with: npm run format:desktop"
        fi
    fi

    step "Running ESLint on desktop app..."
    if npm run lint:desktop 2>&1; then
        info "ESLint passed"
        PASSED_CHECKS+=("Desktop: ESLint")
    else
        error "ESLint failed"
        echo ""
        read -p "  Auto-fix desktop ESLint issues? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            step "Fixing desktop ESLint issues..."
            if (cd om-desktop && npx eslint . --fix); then
                info "ESLint issues fixed successfully"
                # Re-run to check if all issues were fixed
                if npm run lint:desktop 2>&1; then
                    info "All desktop ESLint issues resolved"
                    PASSED_CHECKS+=("Desktop: ESLint")
                else
                    warn "Some ESLint issues remain (may require manual fixes)"
                    FAILED_CHECKS+=("Desktop: ESLint")
                fi
            else
                error "Failed to fix ESLint issues"
                FAILED_CHECKS+=("Desktop: ESLint")
            fi
        else
            FAILED_CHECKS+=("Desktop: ESLint")
            echo "  Fix manually with: cd om-desktop && npx eslint . --fix"
        fi
    fi

    step "Running desktop app tests..."
    if npm run test:desktop 2>&1; then
        info "Desktop tests passed"
        PASSED_CHECKS+=("Desktop: Tests")
    else
        error "Desktop tests failed"
        FAILED_CHECKS+=("Desktop: Tests")
        echo "  Debug with: npm run test:desktop"
    fi
fi

fi  # End Desktop App Checks

###############################################################################
# Database Migration Checks
###############################################################################

# Only run migration checks for "all" or "supabase" scope
if [ "$CHECK_SCOPE" = "all" ] || [ "$CHECK_SCOPE" = "supabase" ]; then

heading "Database Migration Checks"

# Check if there are any migration files
if [ ! -d "supabase/migrations" ] || [ -z "$(ls -A supabase/migrations/*.sql 2>/dev/null)" ]; then
    info "No migration files found, skipping migration checks"
else
    step "Check 1: Migration Syntax Validation"
    SYNTAX_VALID=true
    for file in supabase/migrations/*.sql; do
        if [ -f "$file" ]; then
            # Check for basic SQL syntax (has semicolons)
            if ! grep -q ";" "$file"; then
                error "Migration $file has no SQL statements (missing semicolons)"
                SYNTAX_VALID=false
            fi

            # Check for balanced BEGIN/COMMIT
            BEGIN_COUNT=$(grep -c "BEGIN" "$file" || echo 0)
            COMMIT_COUNT=$(grep -c "COMMIT" "$file" || echo 0)

            if [ "$BEGIN_COUNT" -ne "$COMMIT_COUNT" ]; then
                warn "Migration $file has unbalanced BEGIN ($BEGIN_COUNT) and COMMIT ($COMMIT_COUNT)"
            fi
        fi
    done

    if [ "$SYNTAX_VALID" = true ]; then
        info "Migration syntax validation passed"
        PASSED_CHECKS+=("Migrations: Syntax")
    else
        FAILED_CHECKS+=("Migrations: Syntax")
    fi

    step "Check 2: Destructive Operation Detection"
    DESTRUCTIVE_FOUND=false
    DESTRUCTIVE_FILES=()
    BYPASSED_FILES=0

    for file in supabase/migrations/*.sql; do
        if [ -f "$file" ]; then
            # Skip if file has CI-BYPASS annotation
            if grep -q "CI-BYPASS: destructive-operations" "$file"; then
                info "$(basename "$file") - Bypassed (CI-BYPASS annotation present)"
                BYPASSED_FILES=$((BYPASSED_FILES + 1))
                continue
            fi

            FILE_HAS_ISSUE=false

            # Check for DROP TABLE
            if grep -iE "DROP\s+TABLE" "$file" > /dev/null; then
                error "$(basename "$file") - Contains DROP TABLE"
                DESTRUCTIVE_FILES+=("$(basename "$file")")
                FILE_HAS_ISSUE=true
            fi

            # Check for DROP COLUMN
            if grep -iE "DROP\s+COLUMN" "$file" > /dev/null; then
                error "$(basename "$file") - Contains DROP COLUMN"
                if [ "$FILE_HAS_ISSUE" = false ]; then
                    DESTRUCTIVE_FILES+=("$(basename "$file")")
                    FILE_HAS_ISSUE=true
                fi
            fi

            # Check for TRUNCATE
            if grep -iE "TRUNCATE\s+TABLE" "$file" > /dev/null; then
                error "$(basename "$file") - Contains TRUNCATE"
                if [ "$FILE_HAS_ISSUE" = false ]; then
                    DESTRUCTIVE_FILES+=("$(basename "$file")")
                    FILE_HAS_ISSUE=true
                fi
            fi

            # Check for DELETE without WHERE
            if grep -iE "DELETE\s+FROM\s+\w+\s*;" "$file" > /dev/null; then
                error "$(basename "$file") - Contains DELETE without WHERE"
                if [ "$FILE_HAS_ISSUE" = false ]; then
                    DESTRUCTIVE_FILES+=("$(basename "$file")")
                    FILE_HAS_ISSUE=true
                fi
            fi

            # Check for ALTER COLUMN TYPE without USING
            if grep -iE "ALTER\s+COLUMN\s+\w+\s+TYPE" "$file" > /dev/null && ! grep -iE "USING" "$file" > /dev/null; then
                warn "$(basename "$file") - Contains ALTER COLUMN TYPE without USING"
                if [ "$FILE_HAS_ISSUE" = false ]; then
                    DESTRUCTIVE_FILES+=("$(basename "$file")")
                    FILE_HAS_ISSUE=true
                fi
            fi

            if [ "$FILE_HAS_ISSUE" = true ]; then
                DESTRUCTIVE_FOUND=true
            fi
        fi
    done

    if [ "$DESTRUCTIVE_FOUND" = false ]; then
        info "No destructive operations detected"
        if [ "$BYPASSED_FILES" -gt 0 ]; then
            info "($BYPASSED_FILES file(s) bypassed with CI-BYPASS annotation)"
        fi
        PASSED_CHECKS+=("Migrations: No Destructive Ops")
    else
        error "Destructive operations detected in ${#DESTRUCTIVE_FILES[@]} migration file(s)"
        FAILED_CHECKS+=("Migrations: No Destructive Ops")
        echo ""
        echo "  To bypass this check, add the following comment at the top of the migration file:"
        echo "  -- CI-BYPASS: destructive-operations"
        echo "  -- Reason: [Why this destructive operation is intentional]"
        echo "  -- Impact: [What data/schema will be affected]"
        echo "  -- Justification: [Why this is safe/necessary]"
    fi

    step "Check 3: RLS Policy Verification"
    MISSING_RLS=false
    for file in supabase/migrations/*.sql; do
        if [ -f "$file" ]; then
            # Find CREATE TABLE statements
            TABLES=$(grep -iE "CREATE\s+TABLE\s+(\w+)" "$file" | sed -E 's/.*CREATE\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/I' || echo "")

            for table in $TABLES; do
                # Check if RLS is enabled for this table
                if ! grep -iE "ALTER\s+TABLE\s+$table\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY" "$file" > /dev/null; then
                    warn "Table '$table' created without RLS policy in $file"
                    MISSING_RLS=true
                fi
            done
        fi
    done

    if [ "$MISSING_RLS" = false ]; then
        info "RLS policy check passed"
        PASSED_CHECKS+=("Migrations: RLS Policies")
    else
        warn "Some tables missing RLS policies (warning only)"
        PASSED_CHECKS+=("Migrations: RLS Policies (warnings)")
    fi

    step "Check 4: Type Generation Status"
    # Check if migrations changed and types were regenerated
    TYPES_CHANGED=$(git diff --name-only production...HEAD 2>/dev/null | grep -q "database.types.ts" && echo "true" || echo "false")
    MIGRATIONS_CHANGED=$(git diff --name-only production...HEAD 2>/dev/null | grep -q "migrations" && echo "true" || echo "false")

    if [ "$MIGRATIONS_CHANGED" = "true" ] && [ "$TYPES_CHANGED" != "true" ]; then
        error "Migrations changed but database.types.ts was not updated"
        FAILED_CHECKS+=("Migrations: Type Generation")
        echo "  Run: npm run db:types:sync"
    else
        info "Type generation status is correct"
        PASSED_CHECKS+=("Migrations: Type Generation")
    fi

    step "Check 5: Anti-pattern Detection"
    WARNINGS=false
    for file in supabase/migrations/*.sql; do
        if [ -f "$file" ]; then
            # Find CREATE TABLE statements
            TABLES=$(grep -iE "CREATE\s+TABLE\s+(\w+)" "$file" | sed -E 's/.*CREATE\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/I' || echo "")

            for table in $TABLES; do
                # Skip system tables
                if [[ "$table" =~ ^(auth|storage|pg_|information_schema) ]]; then
                    continue
                fi

                # Check if table has user_id column
                TABLE_BLOCK=$(sed -n "/CREATE\s\+TABLE\s\+$table/,/);/p" "$file")
                if ! echo "$TABLE_BLOCK" | grep -iE "user_id|owner_id|created_by" > /dev/null; then
                    warn "Table '$table' may be missing user scoping column (user_id)"
                    WARNINGS=true
                fi
            done

            # Check for indexes on foreign keys
            FKS=$(grep -iE "REFERENCES\s+\w+" "$file" | wc -l)
            INDEXES=$(grep -iE "CREATE\s+INDEX" "$file" | wc -l)

            if [ "$FKS" -gt 0 ] && [ "$INDEXES" -eq 0 ]; then
                info "Migration adds foreign keys but no indexes (may affect performance)"
            fi
        fi
    done

    if [ "$WARNINGS" = false ]; then
        info "Anti-pattern check passed"
        PASSED_CHECKS+=("Migrations: Anti-patterns")
    else
        warn "Anti-pattern warnings detected (not blocking)"
        PASSED_CHECKS+=("Migrations: Anti-patterns (warnings)")
    fi

    step "Check 6: Migration Timestamp Order"
    # Check if new migrations have timestamps earlier than production's latest migration
    # This prevents out-of-order migrations that would require --include-all flag

    # Fetch latest production branch state
    if git rev-parse --verify origin/production >/dev/null 2>&1; then
        git fetch origin production --quiet 2>/dev/null || true

        # Get the latest migration timestamp from production branch
        LATEST_PROD_MIGRATION=$(git ls-tree -r origin/production --name-only supabase/migrations/ 2>/dev/null | grep '\.sql$' | sort | tail -1)

        if [ -n "$LATEST_PROD_MIGRATION" ]; then
            LATEST_PROD_TIMESTAMP=$(basename "$LATEST_PROD_MIGRATION" | cut -d'_' -f1)
            echo "  Latest production migration timestamp: $LATEST_PROD_TIMESTAMP"

            # Check all local migrations
            OUT_OF_ORDER=false
            OUT_OF_ORDER_FILES=()

            for file in supabase/migrations/*.sql; do
                if [ -f "$file" ]; then
                    NEW_TIMESTAMP=$(basename "$file" | cut -d'_' -f1)

                    # Only check if this file doesn't exist in production
                    if ! git ls-tree -r origin/production --name-only supabase/migrations/ 2>/dev/null | grep -q "$(basename "$file")"; then
                        if [ "$NEW_TIMESTAMP" -lt "$LATEST_PROD_TIMESTAMP" ]; then
                            error "$(basename "$file") has timestamp $NEW_TIMESTAMP (earlier than production's $LATEST_PROD_TIMESTAMP)"
                            OUT_OF_ORDER=true
                            OUT_OF_ORDER_FILES+=("$(basename "$file")")
                        fi
                    fi
                fi
            done

            if [ "$OUT_OF_ORDER" = true ]; then
                error "Out-of-order migration timestamps detected"
                FAILED_CHECKS+=("Migrations: Timestamp Order")
                echo ""
                echo "  The following migrations have timestamps earlier than production:"
                for file in "${OUT_OF_ORDER_FILES[@]}"; do
                    echo "    - $file"
                done
                echo ""
                echo "  This happens when:"
                echo "    - Working on a feature branch while production advanced"
                echo "    - Local clock skew"
                echo "    - Cherry-picking or rebasing commits"
                echo ""
                echo "  To fix, regenerate the migration with a new timestamp:"
                echo "    1. Copy the migration content"
                echo "    2. Delete the old migration file"
                echo "    3. Run: supabase migration new <descriptive_name>"
                echo "    4. Paste the content into the new file"
                echo "    5. Run: npm run db:types:sync"
                echo ""
                echo "  Note: The deployment will use --include-all as a safety net,"
                echo "  but it's better to fix the timestamp order now for cleaner history."
            else
                info "All new migrations have timestamps after production's latest"
                PASSED_CHECKS+=("Migrations: Timestamp Order")
            fi
        else
            info "No production migrations found, skipping timestamp check"
            PASSED_CHECKS+=("Migrations: Timestamp Order (skipped)")
        fi
    else
        info "Production branch not found, skipping timestamp check"
        PASSED_CHECKS+=("Migrations: Timestamp Order (skipped)")
    fi
fi

fi  # End Database Migration Checks

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
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  ✗ ${#FAILED_CHECKS[@]} check(s) failed${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Please fix the failed checks before pushing."
    exit 1
fi
