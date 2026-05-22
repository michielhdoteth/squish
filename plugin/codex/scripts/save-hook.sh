#!/bin/bash
# Stop hook - captures session context per-turn checkpoint
# Receives JSON on stdin from Codex hooks system

PROJECT_DIR="${CODEX_PROJECT_DIR:-${PWD}}"

# Save per-turn checkpoint
squish remember "Checkpoint saved" --type context --place inbox --project "$PROJECT_DIR" 2>/dev/null

exit 0
