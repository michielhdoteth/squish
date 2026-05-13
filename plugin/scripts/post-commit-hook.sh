#!/bin/bash
# Post-Commit Hook - Memory Checkpoint
# Saves each git commit as a Squish memory.
# Install with: squish hook install --git
# 
# This is inspired by Graphify's git hook that auto-rebuilds on commit.
# Instead of rebuilding a graph, we capture the commit as a durable memory.

SQUISH_BIN="${SQUISH_BIN:-squish}"
HOOK_STATE_DIR="${HOOK_STATE_DIR:-$HOME/.squish/hook_state}"
mkdir -p "$HOOK_STATE_DIR"

# Get commit info
COMMIT_MSG=$(git log -1 --pretty=%B 2>/dev/null | head -5)
COMMIT_HASH=$(git log -1 --pretty=%h 2>/dev/null)
COMMIT_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | head -10)
COMMIT_AUTHOR=$(git log -1 --pretty=%an 2>/dev/null)

# Skip merge commits and trivial messages
if echo "$COMMIT_MSG" | grep -qE "^(Merge |Merge branch|chore\(release|bump version)"; then
  exit 0
fi

# Skip if already captured (dedup by commit hash)
STATE_FILE="$HOOK_STATE_DIR/commit-hook-state.json"
if [ -f "$STATE_FILE" ]; then
  LAST_HASH=$(grep "^LAST_HASH=" "$STATE_FILE" 2>/dev/null | cut -d= -f2)
  if [ "$LAST_HASH" = "$COMMIT_HASH" ]; then
    exit 0
  fi
fi

# Build memory content
CONTENT="Git commit: $(echo "$COMMIT_MSG" | head -1)"
if [ -n "$COMMIT_FILES" ]; then
  CONTENT="$CONTENT
Files: $(echo "$COMMIT_FILES" | tr '\n' ' ')"
fi

# Save as cold memory via squish
$SQUISH_BIN remember "$CONTENT" --cold --type decision --source git 2>/dev/null || true

# Save state to prevent duplicates
echo "LAST_HASH=$COMMIT_HASH" > "$STATE_FILE"

exit 0
