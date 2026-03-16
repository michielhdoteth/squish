#!/bin/bash

# Squish Release Build Script
# Run this before publishing to ensure everything is ready

set -e

# Auto-detect version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Building Squish v$VERSION..."

# Clean previous builds
npm run clean

# Build the project using standard build script
echo "Building project..."
npm run build

# Verify MCP artifacts are generated
echo "🔨 Generating MCP artifacts..."
node scripts/generate-mcp.mjs

# Verify MCP artifacts
echo "🧪 Verifying MCP artifacts..."
node scripts/verify-mcp.mjs

echo "Build complete!"

# Optional: Test the build (uncomment if needed)
# echo "🧪 Testing build..."
# timeout 5 node dist/index.js &
# sleep 2
# curl -s http://localhost:37777/api/health | grep -q "ok" && echo "✅ API working" || echo "❌ API failed"
# pkill -f "node dist/index.js" || true

echo "Ready for release!"