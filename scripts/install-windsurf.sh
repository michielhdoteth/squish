#!/bin/bash
# Install Squish hooks for Windsurf
# Run from the squish project directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQUISH_DIR="${SQUISH_DIR:-$HOME/.squish}"
HOOKS_CONFIG="$SCRIPT_DIR/config/hooks/windsurf-hooks.json"

echo "Installing Squish hooks for Windsurf..."

# Create Squish config directory
mkdir -p "$SQUISH_DIR"

# Copy hook config
if [ -f "$HOOKS_CONFIG" ]; then
    cp "$HOOKS_CONFIG" "$SQUISH_DIR/hooks-windsurf.json"
    echo "Copied hook config to $SQUISH_DIR/hooks-windsurf.json"
else
    echo "ERROR: Hook config not found at $HOOKS_CONFIG"
    exit 1
fi

# Check for Windsurf config
CONFIG_FILE="$HOME/.windsurf/config.json"

if [ -f "$CONFIG_FILE" ]; then
    echo ""
    echo "Found Windsurf config at $CONFIG_FILE"
    echo ""
    echo "To enable Squish memory, add to your config:"
    echo ""
    cat << 'CONFIG_JSON'
{
  "mcpServers": {
    "squish": {
      "command": "squish",
      "args": ["run", "mcp"]
    }
  }
}
CONFIG_JSON
else
    echo ""
    echo "Creating default Windsurf config..."
    mkdir -p "$HOME/.windsurf"
    cat > "$CONFIG_FILE" << 'DEFAULT_CONFIG'
{
  "mcpServers": {
    "squish": {
      "command": "squish",
      "args": ["run", "mcp"]
    }
  }
}
DEFAULT_CONFIG
    echo "Created $CONFIG_FILE"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Restart Windsurf"
echo "2. Run 'squish health' to verify"
echo ""