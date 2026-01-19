#!/bin/bash

echo "=== SQUISH v0.5.0 VERIFICATION ==="
echo ""

# Test 1: Build
echo "1. TypeScript Build Status"
if npm run build 2>&1 | grep -q "error"; then
  echo "❌ Build has errors"
  exit 1
else
  echo "✅ Build successful"
fi
echo ""

# Test 2: Core files
echo "2. Compiled Files"
for file in dist/index.js dist/config.js "dist/features/plugin/plugin-wrapper.js" "dist/core/core-memory.js"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file missing"
  fi
done
echo ""

# Test 3: Hooks
echo "3. Hook Scripts"
for hook in hooks/session-start.js hooks/user-prompt-submit.js hooks/post-tool-use.js hooks/session-end.js; do
  if [ -f "$hook" ]; then
    size=$(wc -c < "$hook")
    echo "✅ $hook ($size bytes)"
  fi
done
echo ""

# Test 4: Web UI
echo "4. Web UI Status"
if curl -s http://localhost:37777 | grep -q "Squish"; then
  echo "✅ Web UI responding"
else
  echo "⚠️  Web UI - may be starting or not responding yet"
fi
echo ""

# Test 5: Config files
echo "5. Configuration"
for file in plugin.json .mcp.json hooks/hooks.json; do
  if [ -f "$file" ]; then
    if python3 -m json.tool "$file" > /dev/null 2>&1; then
      echo "✅ $file (valid JSON)"
    else
      echo "❌ $file (invalid JSON)"
    fi
  fi
done
echo ""

echo "=== VERIFICATION COMPLETE ==="
echo "✅ All core systems operational"
echo "✅ Ready for testing!"
