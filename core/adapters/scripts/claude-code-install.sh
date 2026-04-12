#!/bin/bash
# Install Squish MCP for Claude Code
# Run from squish project directory

SQUISH_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Installing Squish MCP for Claude Code..."
echo "Squish directory: $SQUISH_DIR"

# Create Claude Code settings directory
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

# Create or update settings.json
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Check if file exists
if [ -f "$SETTINGS_FILE" ]; then
    echo "Merging with existing settings..."
    # Note: This is a simple append, full JSON merge would need jq
    # For now, just document the merge needed
    echo "Please manually add the following to $SETTINGS_FILE:"
    echo ""
    cat << 'MANUAL_CONFIG'
{
  "mcpServers": {
    "squish": {
      "command": "node",
      "args": ["dist/core/commands/mcp-server.js"],
      "env": { "NODE_ENV": "production" }
    }
  }
}
MANUAL_CONFIG
else
    cat > "$SETTINGS_FILE" << 'EOF'
{
  "mcpServers": {
    "squish": {
      "command": "node",
      "args": ["dist/core/commands/mcp-server.js"],
      "env": { "NODE_ENV": "production" }
    }
  }
}
EOF
    echo "Created $SETTINGS_FILE"
fi

echo ""
echo "Installation complete!"
echo ""
echo "To activate:"
echo "  1. Restart Claude Code"
echo "  2. Or type: /restart"
echo ""
echo "Verify MCP is loaded:"
echo "  - In Claude Code, type: /mcp"
echo "  - You should see 'squish' listed"