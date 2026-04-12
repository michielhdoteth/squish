#!/bin/bash
# Install Squish hooks for Claude Code
# Run from the squish project directory

set -e

HOOKS_DIR="$HOME/.claude/hooks/squish"
SQUISH_DIR="${SQUISH_DIR:-$HOME/.squish}"

echo "Installing Squish Claude Code hooks..."

# Create hooks directory
mkdir -p "$HOOKS_DIR"

# Copy hook scripts
echo "Copying hook scripts..."
cp -r core/agent-adapters/claude-code/hooks/*.sh "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR"/*.sh

# Create config file if needed
if [ ! -f "$SQUISH_DIR/config.env" ]; then
    mkdir -p "$SQUISH_DIR"
    echo "SQUISH_DIR=$SQUISH_DIR" > "$SQUISH_DIR/config.env"
fi

# Check if squish is in PATH
if ! command -v squish &> /dev/null; then
    echo ""
    echo "WARNING: squish not found in PATH"
    echo "Add squish to your PATH or set SQUISH_DIR explicitly"
    echo ""
fi

# Add to settings.json (merge with existing)
SETTINGS_FILE="$HOME/.claude/settings.json"
HOOKS_JSON='{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup", "hooks": [{ "type": "command", "command": "'"$HOOKS_DIR"'/session-start.sh", "matcher": "startup" }] },
      { "matcher": "resume", "hooks": [{ "type": "command", "command": "'"$HOOKS_DIR"'/session-start.sh", "matcher": "resume" }] },
      { "matcher": "compact", "hooks": [{ "type": "command", "command": "'"$HOOKS_DIR"'/session-start.sh", "matcher": "compact" }] }
    ],
    "PreCompact": [
      { "matcher": "auto", "hooks": [{ "type": "command", "command": "'"$HOOKS_DIR"'/precompact-handover.sh", "matcher": "auto" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "'"$HOOKS_DIR"'/post-tool-use.sh", "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "'"$HOOKS_DIR"'/session-end.sh", "timeout": 10 }] }
    ]
  }
}'

if [ -f "$SETTINGS_FILE" ]; then
    # Backup existing settings
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
    echo "Backed up settings.json to settings.json.bak"
    # Note: Full merge would require jq, keeping it simple
    echo "Manual merge needed - see core/agent-adapters/claude-code/README.md"
else
    echo "$HOOKS_JSON" > "$SETTINGS_FILE"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Verify hooks directory: ls $HOOKS_DIR"
echo "2. Update ~/.claude/settings.json with the hooks config"
echo "3. Restart Claude Code"
echo ""
echo "For troubleshooting, see: core/agent-adapters/claude-code/README.md"