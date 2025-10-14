#!/usr/bin/env bash

# run-smoke.sh
# Smoke test script for AutoMessager (Unix)
# Runs doctor, verify, and dry-run to ensure system is working

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Parse arguments
WORKING_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --working-dir)
      WORKING_DIR="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      exit 1
      ;;
  esac
done

# Determine working directory
if [ -z "$WORKING_DIR" ]; then
  # Default: parent of parent of script directory
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  WORKING_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          AutoMessager Smoke Test                      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GRAY}Working Directory: $WORKING_DIR${NC}"
echo ""

# Change to working directory
cd "$WORKING_DIR"

# Create logs directory if it doesn't exist
LOGS_DIR="$WORKING_DIR/logs"
mkdir -p "$LOGS_DIR"

# Generate smoke log filename
TIMESTAMP=$(date +%Y%m%d-%H%M)
SMOKE_LOG_PATH="$LOGS_DIR/smoke-$TIMESTAMP.log"

echo -e "${GRAY}Log file: $SMOKE_LOG_PATH${NC}"
echo ""

# Start logging
exec > >(tee -a "$SMOKE_LOG_PATH") 2>&1

# Initialize results
declare -a TEST_RESULTS
OVERALL_SUCCESS=true

# Helper function to run a test step
run_test_step() {
  local name="$1"
  local command="$2"
  
  echo -e "${GRAY}───────────────────────────────────────────────────────${NC}"
  echo -e "${YELLOW}Running: $name${NC}"
  echo -e "${GRAY}Command: $command${NC}"
  echo ""
  
  set +e
  eval "$command"
  local exit_code=$?
  set -e
  
  echo ""
  
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ $name PASSED (exit code: $exit_code)${NC}"
    TEST_RESULTS+=("PASS|$name|$exit_code")
  elif [ $exit_code -eq 2 ]; then
    # Exit code 2 = warnings only
    echo -e "${YELLOW}⚠️  $name PASSED with warnings (exit code: $exit_code)${NC}"
    TEST_RESULTS+=("WARN|$name|$exit_code")
  else
    echo -e "${RED}❌ $name FAILED (exit code: $exit_code)${NC}"
    TEST_RESULTS+=("FAIL|$name|$exit_code")
    OVERALL_SUCCESS=false
  fi
  
  echo ""
}

# Determine CLI command based on availability
if [ -f "$WORKING_DIR/automessager-mac" ]; then
  CLI_CMD="./automessager-mac"
  echo -e "${CYAN}Using binary: $WORKING_DIR/automessager-mac${NC}"
elif [ -f "$WORKING_DIR/dist/bin/automessager.js" ]; then
  CLI_CMD="node dist/bin/automessager.js"
  echo -e "${CYAN}Using built CLI: $WORKING_DIR/dist/bin/automessager.js${NC}"
else
  echo -e "${RED}Neither binary nor built CLI found. Run 'npm run build' first.${NC}"
  exit 1
fi

echo ""

# Run smoke tests
run_test_step "Doctor Diagnostics" "$CLI_CMD doctor"
run_test_step "Verify Configuration" "$CLI_CMD verify"
run_test_step "Verify Excel Mapping" "$CLI_CMD verify:mapping"
run_test_step "Dry-Run Test" "$CLI_CMD dry-run --no-guard"

# Print summary
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}SMOKE TEST SUMMARY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

for result in "${TEST_RESULTS[@]}"; do
  IFS='|' read -r status name exit_code <<< "$result"
  
  case $status in
    PASS)
      echo -e "${GREEN}✅ $name: $status (exit code: $exit_code)${NC}"
      ;;
    WARN)
      echo -e "${YELLOW}⚠️  $name: $status (exit code: $exit_code)${NC}"
      ;;
    FAIL)
      echo -e "${RED}❌ $name: $status (exit code: $exit_code)${NC}"
      ;;
  esac
done

echo ""
echo -e "${GRAY}───────────────────────────────────────────────────────${NC}"

if [ "$OVERALL_SUCCESS" = true ]; then
  echo -e "${GREEN}🎉 SMOKE TEST: PASS${NC}"
  echo ""
  echo -e "${GREEN}All smoke tests passed successfully!${NC}"
  echo -e "${GREEN}System is ready for production use.${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}❌ SMOKE TEST: FAIL${NC}"
  echo ""
  echo -e "${RED}One or more smoke tests failed.${NC}"
  echo -e "${RED}Review the output above and fix issues before deployment.${NC}"
  EXIT_CODE=1
fi

echo ""
echo -e "${GRAY}Log saved to: $SMOKE_LOG_PATH${NC}"
echo ""

exit $EXIT_CODE

