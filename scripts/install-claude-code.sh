#!/bin/bash
# Install Squish hooks for Claude Code
# Run from the squish project directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQUISH_DIR="${SQUISH_DIR:-$HOME/.squish}"
HOOKS_CONFIG="$SCRIPT_DIR/config/hooks/claude-code-hooks.json"

echo "Installing Squish hooks for Claude Code..."

# Create Squish config directory
mkdir -p "$SQUISH_DIR"

# Copy hook config
if [ -f "$HOOKS_CONFIG" ]; then
    cp "$HOOKS_CONFIG" "$SQUISH_DIR/hooks-claude-code.json"
    echo "Copied hook config to $SQUISH_DIR/hooks-claude-code.json"
else
    echo "ERROR: Hook config not found at $HOOKS_CONFIG"
    exit 1
fi

# Create hooks directory
mkdir -p "$SQUISH_DIR/hooks"

# Check for Claude Code settings file
SETTINGS_FILE="$HOME/.claude/settings.json"
HOOKS_DIR="$HOME/.claude/hooks/squish"

if [ -f "$SETTINGS_FILE" ]; then
    echo ""
    echo "Found Claude Code settings at $SETTINGS_FILE"
    echo ""
    echo "To enable hooks, add this to your settings.json:"
    echo ""
    cat << 'SETTINGS_JSON'
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup", "hooks": [{ "type": "command", "command": "squish", "args": ["hooks", "session-start", "--agent", "claude-code", "--mode", "startup"], "matcher": "startup" }] },
      { "matcher": "resume", "hooks": [{ "type": "command", "command": "squish", "args": ["hooks", "session-start", "--agent", "claude-code", "--mode", "resume"], "matcher": "resume" }] },
      { "matcher": "compact", "hooks": [{ "type": "command", "command": "squish", "args": ["hooks", "session-start", "--agent", "claude-code", "--mode", "compact"], "matcher": "compact" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "squish", "args": ["hooks", "post-tool-use", "--agent", "claude-code"], "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "squish", "args": ["hooks", "session-end", "--agent", "claude-code"], "timeout": 10 }] }
    ],
    "PreCompact": [
      { "matcher": "auto", "hooks": [{ "type": "command", "command": "squish", "args": ["hooks", "pre-compact", "--agent", "claude-code"], "matcher": "auto" }] }
    ]
  }
}
SETTINGS_JSON

    echo ""
    echo "OR use the simplified approach - add MCP servers for memory:"
    echo ""
    cat << 'MCP_CONFIG'
{
  "mcpServers": {
    "squish-memory": {
      "command": "squish",
      "args": ["run", "mcp"]
    }
  }
}
MCP_CONFIG
else
    echo ""
    echo "WARNING: Claude Code settings file not found at $SETTINGS_FILE"
    echo "Install Claude Code first, then rerun this script"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Add MCP server config to your .claude.json or settings.json"
echo "2. Restart Claude Code"
echo "3. Run 'squish health' to verify"
echo ""