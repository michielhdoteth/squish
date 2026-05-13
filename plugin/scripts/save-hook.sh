#!/bin/bash
# Save Hook - fires on Stop event
# Key insight: hook OUTPUT becomes new user input to AI
# If we output a prompt, AI continues and saves memories

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_STATE_DIR="${HOOK_STATE_DIR:-$HOME/.squish/hook_state}"
mkdir -p "$HOOK_STATE_DIR"

STATE_FILE="$HOOK_STATE_DIR/save-hook-state.json"

# Read or initialize state
if [ -f "$STATE_FILE" ]; then
  EXCHANGES_SINCE_SAVE=$(grep "^EXCHANGES=" "$STATE_FILE" 2>/dev/null | cut -d= -f2)
  EXCHANGES_SINCE_SAVE=${EXCHANGES_SINCE_SAVE:-0}
else
  EXCHANGES_SINCE_SAVE=0
fi

# Increment counter (each AI response = 1 exchange)
EXCHANGES_SINCE_SAVE=$((EXCHANGES_SINCE_SAVE + 1))

# Save state
echo "EXCHANGES=$EXCHANGES_SINCE_SAVE" > "$STATE_FILE"

THRESHOLD=15

# Log
echo "[$(date +'%H:%M:%S')] Save hook: $EXCHANGES_SINCE_SAVE since last save" >> "$HOOK_STATE_DIR/hook.log"

# If below threshold, just stop - AI stops normally
if [ "$EXCHANGES_SINCE_SAVE" -lt "$THRESHOLD" ]; then
  exit 0
fi

# === TRIGGER SAVE ===
# Output becomes new user input to AI - it will continue and save
echo "Time to save key memories! Please save important topics, decisions, and insights from this conversation to Squish memory. Use: squish remember \"your key insight\""

# Reset state
echo "EXCHANGES=0" > "$STATE_FILE"

# Exit 0 = let AI see our output as new input, it continues
exit 0