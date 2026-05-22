#!/bin/bash
# SessionEnd hook - captures final session context before session terminates
# Receives JSON on stdin from Claude Code hooks system
# This fires when a session truly ends (idle timeout, daily reset, shutdown)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${PWD}}"

# Save session end marker with full context
squish remember "Session ended" --type context --place archive --project "$PROJECT_DIR" 2>/dev/null

exit 0
