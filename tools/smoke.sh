#!/usr/bin/env bash
# Unix shell script to run smoke tests
# Validates basic functionality

set -e

echo ""
echo "========================================"
echo "  AutoMessager - Smoke Test Suite"
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Determine if we're using binary or source
if [ -f "$PROJECT_DIR/automessager-mac" ]; then
    BINARY="$PROJECT_DIR/automessager-mac"
    echo "Using binary: automessager-mac"
elif [ -f "$PROJECT_DIR/build/bin/automessager-mac" ]; then
    BINARY="$PROJECT_DIR/build/bin/automessager-mac"
    echo "Using binary: build/bin/automessager-mac"
else
    echo "ERROR: AutoMessager binary not found!"
    echo ""
    echo "Expected locations:"
    echo "  - automessager-mac"
    echo "  - build/bin/automessager-mac"
    echo ""
    echo "Please build the binary first:"
    echo "  npm run package:mac"
    echo ""
    exit 1
fi

echo ""
echo "[1/4] Version Check..."
echo "---------------------------------------"
"$BINARY" version
echo "PASS"
echo ""

echo "[2/4] Doctor (Diagnostics)..."
echo "---------------------------------------"
if "$BINARY" doctor; then
    echo "PASS"
else
    echo "WARNING: Doctor found issues"
fi
echo ""

echo "[3/4] Verify (Quick Check)..."
echo "---------------------------------------"
if "$BINARY" verify; then
    echo "PASS"
else
    echo "WARNING: Verify found issues"
fi
echo ""

echo "[4/4] Mapping Validation..."
echo "---------------------------------------"
if "$BINARY" verify:mapping; then
    echo "PASS"
else
    echo "WARNING: Mapping validation failed"
fi
echo ""

echo "========================================"
echo "  Smoke Tests Complete"
echo "========================================"
echo ""

