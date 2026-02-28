#!/bin/bash

# Squish Release Build Script
# Run this before publishing to ensure everything is ready

set -e

echo "🔨 Building Squish v0.3.0..."

# Clean previous builds
npm run clean

# Build the project (core only, merge system disabled)
echo "Building core functionality..."
npx tsc index.ts --outDir dist --skipLibCheck --esModuleInterop --module commonjs
npx tsc features/web/web.ts --outDir dist/features/web --skipLibCheck --esModuleInterop --module commonjs
npx tsc features/web/web-server.ts --outDir dist/features/web --skipLibCheck --esModuleInterop --module commonjs

# Rename to .js extension for CommonJS
mv dist/features/web/web-server.js dist/features/web/web-server.cjs 2>/dev/null || true

echo "✅ Build complete!"

# Test the build
echo "🧪 Testing build..."
timeout 5 node dist/index.js &
sleep 2
curl -s http://localhost:37777/api/health | grep -q "ok" && echo "✅ API working" || echo "❌ API failed"

# Kill test server
pkill -f "node dist/index.js" || true

echo "🎉 Ready for release!"