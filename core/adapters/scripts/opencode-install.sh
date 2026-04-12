#!/bin/bash
# Install Squish MCP for OpenCode
# Run from squish project directory

SQUISH_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Installing Squish MCP for OpenCode..."
echo "Squish directory: $SQUISH_DIR"

# Create OpenCode settings directory
OPENCODE_DIR="$HOME/.opencode"
mkdir -p "$OPENCODE_DIR"

SETTINGS_FILE="$OPENCODE_DIR/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    echo "Please manually add mcpServers.squish to $SETTINGS_FILE"
    cat << 'MANUAL_CONFIG'
{
  "mcpServers": {
    "squish": {
      "command": "node",
      "args": ["dist/core/commands/mcp-server.js"]
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
      "args": ["dist/core/commands/mcp-server.js"]
    }
  }
}
EOF
    echo "Created $SETTINGS_FILE"
fi

echo "Installation complete!"