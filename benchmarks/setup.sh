#!/bin/bash

# MemoryBench Setup Script

echo "Setting up MemoryBench for Squish..."

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "Error: bun is required but not installed."
    echo "Install from: https://bun.sh"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
bun install

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "Creating .env.local..."
    cp .env.example .env.local
    echo "⚠️  Please edit .env.local and add your API keys"
fi

# Create data directories
mkdir -p data/benchmarks
mkdir -p data/runs

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your API keys to .env.local (OPENAI_API_KEY or ANTHROPIC_API_KEY)"
echo "2. Ensure Squish is running on http://localhost:3000"
echo "3. Run: bun run bench"
echo ""
echo "Commands:"
echo "  bun run bench         # Run LoCoMo benchmark"
echo "  bun run bench:longmem # Run LongMemEval benchmark"
echo "  bun run bench:all     # Compare all benchmarks"
echo "  bun run serve         # Start Web UI"
