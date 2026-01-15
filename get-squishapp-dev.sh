#!/bin/bash

# Squish v0.2.6 - One-line installer for Claude Code Plugin
# Usage: curl -fsSL https://get.squishapp.dev | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐙 Installing Squish Memory v0.2.6...${NC}"

# Detect platform and architecture
detect_platform() {
    case "$(uname -s)" in
        Linux*)     PLATFORM="linux" ;;
        Darwin*)    PLATFORM="macos" ;;
        CYGWIN*|MINGW*|MSYS*) PLATFORM="windows" ;;
        *)          echo -e "${RED}Unsupported platform: $(uname -s)${NC}"; exit 1 ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) ARCH="x64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)          echo -e "${RED}Unsupported architecture: $(uname -m)${NC}"; exit 1 ;;
    esac
}

# Download and extract Squish
install_squish() {
    echo -e "${BLUE}Downloading Squish for ${PLATFORM}-${ARCH}...${NC}"

    TMP_DIR=$(mktemp -d)
    cd "$TMP_DIR"

    DOWNLOAD_URL="https://github.com/michielhdoteth/squish-memory/releases/download/v0.2.6"

    if [ "$PLATFORM" = "windows" ]; then
        FILENAME="squish-v0.2.6-windows-${ARCH}.zip"
        curl -L -o "$FILENAME" "${DOWNLOAD_URL}/${FILENAME}"
        unzip -q "$FILENAME"
    else
        FILENAME="squish-v0.2.6-${PLATFORM}-${ARCH}.tar.gz"
        curl -L -o "$FILENAME" "${DOWNLOAD_URL}/${FILENAME}"
        tar -xzf "$FILENAME"
    fi

    # Install to ~/.squish
    INSTALL_DIR="$HOME/.squish"
    mkdir -p "$INSTALL_DIR"
    cp -r squish/* "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/bin/squish"

    cd - > /dev/null
    rm -rf "$TMP_DIR"

    echo -e "${GREEN}✓ Installed to: ${INSTALL_DIR}${NC}"
}

# Setup Claude Code configuration
setup_claude() {
    echo -e "${BLUE}Configuring Claude Code...${NC}"

    CLAUDE_CONFIG="$HOME/.claude/settings.json"
    mkdir -p "$HOME/.claude"

    # Backup existing config
    if [ -f "$CLAUDE_CONFIG" ]; then
        cp "$CLAUDE_CONFIG" "${CLAUDE_CONFIG}.backup.$(date +%s)"
    fi

    # Create or update config
    if [ -f "$CLAUDE_CONFIG" ] && command -v jq &> /dev/null; then
        jq --arg bin_path "$HOME/.squish/bin/squish" '.mcpServers.squish = {"command": "node", "args": [$bin_path]}' "$CLAUDE_CONFIG" > "${CLAUDE_CONFIG}.tmp" && mv "${CLAUDE_CONFIG}.tmp" "$CLAUDE_CONFIG"
    else
        cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "squish": {
      "command": "node",
      "args": ["$HOME/.squish/bin/squish"]
    }
  }
}
EOF
    fi

    echo -e "${GREEN}✓ Claude Code configured${NC}"
}

# Main installation
main() {
    detect_platform
    install_squish
    setup_claude

    echo ""
    echo -e "${GREEN}🎉 Squish v0.2.6 installed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Restart Claude Code"
    echo -e "  2. Visit http://localhost:37777 for web UI"
    echo ""
    echo -e "${BLUE}Documentation: https://github.com/michielhdoteth/squish-memory${NC}"
}

main "$@"
