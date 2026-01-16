#!/bin/bash

# Squish GitHub Release Script
# Run after npm publish to create GitHub release

VERSION="0.3.0"
REPO="michielhdoteth/squish"

echo "🏷️ Creating GitHub release v$VERSION..."

# Build binaries for different platforms
echo "🔨 Building binaries..."

# Linux x64
echo "Building linux-x64..."
npx pkg dist/index.js --targets node18-linux-x64 --output bin/squish-linux-x64
tar -czf squish-v${VERSION}-linux-x64.tar.gz bin/ dist/ plugin.json README.md LICENSE

# Linux ARM64
echo "Building linux-arm64..."
npx pkg dist/index.js --targets node18-linux-arm64 --output bin/squish-linux-arm64
tar -czf squish-v${VERSION}-linux-arm64.tar.gz bin/ dist/ plugin.json README.md LICENSE

# macOS ARM64 (Apple Silicon)
echo "Building macos-arm64..."
npx pkg dist/index.js --targets node18-macos-arm64 --output bin/squish-macos-arm64
tar -czf squish-v${VERSION}-macos-arm64.tar.gz bin/ dist/ plugin.json README.md LICENSE

# Windows x64
echo "Building windows-x64..."
npx pkg dist/index.js --targets node18-win-x64 --output bin/squish-windows-x64.exe
zip squish-v${VERSION}-windows-x64.zip bin/ dist/ plugin.json README.md LICENSE

echo "📦 Binaries created!"

# Create GitHub release (requires gh CLI)
echo "🚀 Creating GitHub release..."
gh release create "v${VERSION}" \
  --title "Squish v${VERSION} - Memory Plugin for Claude Code" \
  --notes "Local-first persistent memory for Claude Code with code quality improvements and better maintainability.

## What's New in v0.3.0

### Code Quality Improvements
- Reduced complexity in core modules (summarization, temporal-facts, requirements)
- Split long files into focused submodules for better organization
- Eliminated ~200+ lines of duplicated code
- Created 9 shared utility modules in core/utils/

### Installation
\`\`\`bash
npx squish-install
\`\`\`

Or visit: https://github.com/michielhdoteth/squish" \
  squish-v${VERSION}-linux-x64.tar.gz \
  squish-v${VERSION}-linux-arm64.tar.gz \
  squish-v${VERSION}-macos-arm64.tar.gz \
  squish-v${VERSION}-windows-x64.zip

echo "🎉 Release v${VERSION} published!"