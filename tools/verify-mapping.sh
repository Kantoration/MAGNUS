#!/usr/bin/env bash
# Unix shell script to verify Excel mapping file
# Runs automessager verify:mapping command

set -e

echo ""
echo "========================================"
echo "  AutoMessager - Mapping Verification"
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Determine if we're using binary or source
if [ -f "$PROJECT_DIR/automessager-mac" ]; then
    echo "Using binary: automessager-mac"
    echo ""
    "$PROJECT_DIR/automessager-mac" verify:mapping
elif [ -f "$PROJECT_DIR/build/bin/automessager-mac" ]; then
    echo "Using binary: build/bin/automessager-mac"
    echo ""
    "$PROJECT_DIR/build/bin/automessager-mac" verify:mapping
elif [ -f "$PROJECT_DIR/node_modules/.bin/automessager" ]; then
    echo "Using npm package"
    echo ""
    cd "$PROJECT_DIR"
    npm run verify:mapping
else
    echo "ERROR: AutoMessager binary not found!"
    echo ""
    echo "Expected locations:"
    echo "  - automessager-mac"
    echo "  - build/bin/automessager-mac"
    echo "  - npm package (node_modules)"
    echo ""
    echo "Please build the binary first:"
    echo "  npm run package:mac"
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo ""

