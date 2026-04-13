#!/bin/bash
# Install Squish hooks for OpenCode
# Run from the squish project directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQUISH_DIR="${SQUISH_DIR:-$HOME/.squish}"
HOOKS_CONFIG="$SCRIPT_DIR/config/hooks/opencode-hooks.json"

echo "Installing Squish hooks for OpenCode..."

# Create Squish config directory
mkdir -p "$SQUISH_DIR"

# Copy hook config
if [ -f "$HOOKS_CONFIG" ]; then
    cp "$HOOKS_CONFIG" "$SQUISH_DIR/hooks-opencode.json"
    echo "Copied hook config to $SQUISH_DIR/hooks-opencode.json"
else
    echo "ERROR: Hook config not found at $HOOKS_CONFIG"
    exit 1
fi

# Check for OpenCode settings file
SETTINGS_FILE="$HOME/.opencode/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    echo ""
    echo "Found OpenCode settings at $SETTINGS_FILE"
    echo ""
    echo "To enable Squish memory, add this to your settings.json:"
    echo ""
    cat << 'SETTINGS_JSON'
{
  "mcpServers": {
    "squish": {
      "command": "squish",
      "args": ["run", "mcp"]
    }
  },
  "memory": {
    "enabled": true,
    "autoCapture": true
  }
}
SETTINGS_JSON
else
    echo ""
    echo "Creating default OpenCode settings..."
    mkdir -p "$HOME/.opencode"
    cat > "$SETTINGS_FILE" << 'DEFAULT_SETTINGS'
{
  "mcpServers": {
    "squish": {
      "command": "squish",
      "args": ["run", "mcp"]
    }
  },
  "memory": {
    "enabled": true,
    "autoCapture": true
  }
}
DEFAULT_SETTINGS
    echo "Created $SETTINGS_FILE"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Restart OpenCode"
echo "2. Run 'squish health' to verify"
echo ""