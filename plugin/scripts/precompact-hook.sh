#!/bin/bash
# PreCompact Hook - fires right before context compaction
# ALWAYS triggers save - we might lose context!

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_STATE_DIR="${HOOK_STATE_DIR:-$HOME/.squish/hook_state}"
mkdir -p "$HOOK_STATE_DIR"

STATE_FILE="$HOOK_STATE_DIR/save-hook-state.json"

# Log
echo "[$(date +'%H:%M:%S')] PRECOMPACT - triggering emergency save" >> "$HOOK_STATE_DIR/hook.log"

# Read last save time
if [ -f "$STATE_FILE" ]; then
  LAST_SAVE=$(grep "^LAST_SAVE=" "$STATE_FILE" 2>/dev/null | cut -d= -f2)
fi

# Always output save prompt - context compaction is critical!
echo "Before we compact context, please save key topics, decisions, and important information from this conversation to Squish memory using: squish remember \"<key insight>\" --place=<appropriate-place>"

# Reset counter after emergency save
echo "EXCHANGES=0" > "$STATE_FILE"
echo "LAST_SAVE=$(date +%s)" >> "$STATE_FILE"

# Exit 0 = AI sees output and saves, then compaction proceeds
exit 0