#!/bin/bash

# Squish GitHub Release Script
# Run after npm publish to create GitHub release

# Auto-detect version from package.json
VERSION=$(node -p "require('./package.json').version")
REPO="michielhdoteth/squish"

echo "Creating GitHub release v$VERSION..."

# Build binaries for different platforms
echo "Building binaries..."

# Create temporary directory for release assets
mkdir -p release-assets
cd release-assets

# Linux x64
echo "Building linux-x64..."
npx pkg ../dist/index.js --targets node18-linux-x64 --output squish-linux-x64
tar -czf "../squish-v${VERSION}-linux-x64.tar.gz" squish-linux-x64 ../dist/ ../config/plugin.json ../README.md ../LICENSE

# Linux ARM64
echo "Building linux-arm64..."
npx pkg ../dist/index.js --targets node18-linux-arm64 --output squish-linux-arm64
tar -czf "../squish-v${VERSION}-linux-arm64.tar.gz" squish-linux-arm64 ../dist/ ../config/plugin.json ../README.md ../LICENSE

# macOS ARM64 (Apple Silicon)
echo "Building macos-arm64..."
npx pkg ../dist/index.js --targets node18-macos-arm64 --output squish-macos-arm64
tar -czf "../squish-v${VERSION}-macos-arm64.tar.gz" squish-macos-arm64 ../dist/ ../config/plugin.json ../README.md ../LICENSE

# Windows x64
echo "Building windows-x64..."
npx pkg ../dist/index.js --targets node18-win-x64 --output squish-windows-x64.exe
zip "../squish-v${VERSION}-windows-x64.zip" squish-windows-x64.exe ../dist/ ../config/plugin.json ../README.md ../LICENSE

cd ..
rm -rf release-assets

echo "Binaries created!"

# Check if gh CLI is available and user is authenticated
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not installed. Skipping release creation."
    echo "   Install gh CLI and run this script again to create GitHub release."
    echo "   Alternatively, create release manually at: https://github.com/$REPO/releases/new?tag=v$VERSION"
    exit 1
fi

# Create GitHub release
echo "Creating GitHub release..."
gh release create "v${VERSION}" \
  --title "Squish v${VERSION} - Universal Memory for AI Agents" \
  --notes "## What's New in v${VERSION}

Squish provides universal persistent memory for AI agents with support for MCP, CLI, and HTTP API.

### Key Features
- Two-tier memory architecture (QMD search + SQLite/PostgreSQL storage)
- Trigger detection, contradiction resolution, and temporal facts
- Universal API compatible with any AI agent framework
- MCP server integration for Claude Code, OpenClaw, and other MCP clients

### Installation
\`\`\`bash
npx squish-install
\`\`\`

Or visit: https://github.com/michielhdoteth/squish" \
  "squish-v${VERSION}-linux-x64.tar.gz" \
  "squish-v${VERSION}-linux-arm64.tar.gz" \
  "squish-v${VERSION}-macos-arm64.tar.gz" \
  "squish-v${VERSION}-windows-x64.zip"

echo "Release v${VERSION} published!"