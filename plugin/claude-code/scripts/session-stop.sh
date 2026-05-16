#!/bin/bash
# Stop hook - captures session context before ending
# Receives JSON on stdin from Claude Code hooks system

PROJECT_DIR="${PWD}"

# Save session end marker
squish remember "Session ended" --type context --place inbox --project "$PROJECT_DIR" 2>/dev/null

exit 0
