# Squish v0.3.0 Release

## What's Fixed in This Release

### TypeScript Compilation Errors
- Resolved circular type references in Drizzle schemas (both SQLite and PostgreSQL variants)
- Added missing `update()` and `delete()` methods to the DatabaseClient interface
- Fixed type annotations for parameters in merge strategies
- Corrected detection method type mappings in the two-stage detector
- Fixed similarity score type conversions in proposal listing

### Plugin Ready for Release
- Plugin manifest updated and validated for Claude Code plugin format
- Clean TypeScript compilation with zero errors
- Web server running on port 37777 with health endpoint
- All database operations functional

## Installation

### From npm
```bash
npm install -g squish
squish
```

### From source
```bash
git clone https://github.com/michielhdoteth/squish.git
cd squish
npm install
npm run build
npm start
```

## Quick Start

The Squish service starts with:
```bash
squish
# or
npm start
# or
./start.sh (Linux/macOS)
# or
start.bat (Windows)
```

Web UI available at: http://localhost:37777

API Health check: 
```bash
curl http://localhost:37777/api/health
```

## Features Ready

✓ Local-first persistent memory with SQLite
✓ Semantic and full-text search
✓ Memory lifecycle management
✓ Agent-aware memory isolation
✓ Memory governance and permissions
✓ Web UI for browsing memories
✓ MCP server for Claude Code integration

## System Requirements

- Node.js 18.0.0 or higher
- Port 37777 available for web UI
- 100MB disk space for local database

## Known Limitations

- Team mode (PostgreSQL) requires external database setup
- Local embeddings use TF-IDF by default (OpenAI API for better quality)

---

Ready to release! Service is running and all systems operational.
