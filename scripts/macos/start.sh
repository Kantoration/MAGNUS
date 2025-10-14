#!/usr/bin/env bash

# start.sh
# Runs AutoMessager with proper working directory and logging for macOS/Linux
# Can be executed directly or via cron

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=0
WORKING_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
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
  # Default: parent of parent of script directory (scripts/macos -> project root)
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  WORKING_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

echo -e "${CYAN}AutoMessager Launcher${NC}"
echo -e "${GRAY}Working Directory: $WORKING_DIR${NC}"
echo ""

# Change to working directory
cd "$WORKING_DIR"

# Check if node is available
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is not installed or not in PATH. Please install Node.js 20+ and try again.${NC}"
  exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GRAY}Node.js Version: $NODE_VERSION${NC}"

# Check if dist/bin/automessager.js exists
CLI_PATH="$WORKING_DIR/dist/bin/automessager.js"
if [ ! -f "$CLI_PATH" ]; then
  echo -e "${RED}AutoMessager CLI not found at: $CLI_PATH. Please run 'npm run build' first.${NC}"
  exit 1
fi

# Create logs directory if it doesn't exist
LOGS_DIR="$WORKING_DIR/logs"
mkdir -p "$LOGS_DIR"

# Set environment variables
export NODE_NO_WARNINGS=1

if [ $DRY_RUN -eq 1 ]; then
  export DRY_RUN=1
  echo -e "${YELLOW}Mode: DRY RUN (no messages will be sent)${NC}"
else
  export DRY_RUN=0
  echo -e "${GREEN}Mode: LIVE (messages will be sent)${NC}"
fi

echo ""

# Generate log file name with date
DATE_STR=$(date +%Y%m%d)
LOG_FILE="$LOGS_DIR/run-$DATE_STR.log"

echo -e "${GRAY}Log file: $LOG_FILE${NC}"
echo ""
echo -e "${CYAN}Starting AutoMessager...${NC}"
echo -e "${GRAY}----------------------------------------${NC}"

# Run AutoMessager and tee output to log file
if [ $DRY_RUN -eq 1 ]; then
  node "$CLI_PATH" dry-run 2>&1 | tee -a "$LOG_FILE"
else
  node "$CLI_PATH" run 2>&1 | tee -a "$LOG_FILE"
fi

EXIT_CODE=$?

echo ""
echo -e "${GRAY}----------------------------------------${NC}"

if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}AutoMessager completed successfully${NC}"
else
  echo -e "${YELLOW}AutoMessager completed with errors (exit code: $EXIT_CODE)${NC}"
fi

exit $EXIT_CODE

