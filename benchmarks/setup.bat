@echo off
REM MemoryBench Setup Script for Windows

echo Setting up MemoryBench for Squish...

REM Check for bun
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: bun is required but not installed.
    echo Install from: https://bun.sh
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
bun install

REM Create .env.local if it doesn't exist
if not exist .env.local (
    echo Creating .env.local...
    copy .env.example .env.local
    echo ⚠️  Please edit .env.local and add your API keys
)

REM Create data directories
if not exist data\benchmarks mkdir data\benchmarks
if not exist data\runs mkdir data\runs

echo.
echo ✅ Setup complete!
echo.
echo Next steps:
echo 1. Add your API keys to .env.local (OPENAI_API_KEY or ANTHROPIC_API_KEY)
echo 2. Ensure Squish is running on http://localhost:3000
echo 3. Run: bun run bench
echo.
echo Commands:
echo   bun run bench         # Run LoCoMo benchmark
echo   bun run bench:longmem # Run LongMemEval benchmark
echo   bun run bench:all     # Compare all benchmarks
echo   bun run serve         # Start Web UI
