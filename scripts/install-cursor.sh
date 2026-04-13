#!/bin/bash
# Install Squish hooks for Cursor
# Run from the squish project directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQUISH_DIR="${SQUISH_DIR:-$HOME/.squish}"
HOOKS_CONFIG="$SCRIPT_DIR/config/hooks/cursor-hooks.json"

echo "Installing Squish hooks for Cursor..."

# Create Squish config directory
mkdir -p "$SQUISH_DIR"

# Copy hook config
if [ -f "$HOOKS_CONFIG" ]; then
    cp "$HOOKS_CONFIG" "$SQUISH_DIR/hooks-cursor.json"
    echo "Copied hook config to $SQUISH_DIR/hooks-cursor.json"
else
    echo "ERROR: Hook config not found at $HOOKS_CONFIG"
    exit 1
fi

# Check for Cursor MCP config
MCP_FILE="$HOME/.cursor/mcp.json"

if [ -f "$MCP_FILE" ]; then
    echo ""
    echo "Found Cursor MCP config at $MCP_FILE"
    echo ""
    echo "To enable Squish, add squish to your MCP servers:"
else
    echo ""
    echo "Creating Cursor MCP config..."
    mkdir -p "$HOME/.cursor"
    cat > "$MCP_FILE" << 'DEFAULT_MCP'
{
  "mcpServers": {
    "squish": {
      "command": "squish",
      "args": ["run", "mcp"]
    }
  }
}
DEFAULT_MCP
    echo "Created $MCP_FILE"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Restart Cursor"
echo "2. Run 'squish health' to verify"
echo ""