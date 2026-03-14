# Changelog

All notable changes to Squish will be documented in this file.

## [0.9.1] - 2026-03-14

### Fixed - CLI & Database
- Fixed `core_memory` CLI command to properly create/resolve projects
- Fixed SQLite schema initialization (was missing core_memory, observations, users tables)
- Fixed database health check SQL syntax error
- Fixed missing database migrations (recorded_at, retrieval_priority, etc.)

### Fixed - MCP Integration
- MCP verification now passes all checks
- All 14 MCP tools properly registered and tested

### Added - New Components
- MCP client, server, standalone-server implementations
- Memory modules: categorizer, conflict-detector, edit-workflow, progressive-disclosure
- MCP config files for Claude Desktop, OpenClaw, OpenCode

### Known Issues
- `memory_associations` table not yet created (optional feature for graph traversal)
- QMD optional (works without it)

## [0.9.0] - 2026-02-28

### Added - OpenClaw Self-Install

#### Self-Install Command
- `npx squish-memory install` - One-command OpenClaw setup
- `squish install` - CLI command for self-installation
- `squish health` - Service health check with JSON output option
- `squish stats` - Memory statistics by project
- Automatic mcporter.json configuration for MCP
- Creates ~/.squish data directory automatically
- Smart binary detection across platforms

#### Updated Skill Files
- `skills/squish-memory/SKILL.md` - v0.9.0 with self-install docs
- `skills/squish-memory/install.mjs` - Node.js installer script
- `skills/squish-memory/install.sh` - Bash fallback installer
- `skills/squish-memory/mcp-config.json` - MCP config template

### Added - Competitive Core Features

#### Trigger Detection (`core/memory/trigger-detector.ts`)
- Automatic detection of explicit memory triggers ("remember", "important", "don't forget")
- Implicit signal detection (decisions, corrections, preferences, workflow rules, lessons)
- Priority classification (high/normal) based on signal strength
- Type inference for automatic memory classification

#### Contradiction Resolution (`core/memory/contradiction-resolver.ts`)
- Auto-detection of contradictions when writing new memories
- Supersession logic for outdated information
- Temporal contradiction detection (facts that are no longer valid)
- Automatic archiving of superseded memories with traceability

#### Write Gate Enforcement (`core/memory/write-gate.ts`)
- Content validation before memory storage
- Secret detection and sanitization integration
- Quality scoring (0-100) for memory content
- Contradiction pre-check integration

#### Hybrid Scorer (`core/memory/hybrid-scorer.ts`)
- Multi-factor relevance scoring (semantic, recency, coactivation, importance, confidence)
- Trigger-aware confidence scoring
- Customizable weight configuration
- Score distribution analytics

#### Retrieval Quality Telemetry (`core/memory/telemetry.ts`)
- Echo/fizzle tracking for memory usage patterns
- Telemetry-based retrieval boosting (0.5-2.0 factor)
- Memory quality analytics
- Automatic flush to database

#### Temporal Facts Lifecycle (`core/memory/temporal-facts.ts`)
- Temporal validity checking
- Auto-supersession of outdated temporal facts
- Expired fact cleanup job
- Temporal fact statistics

### Improved

- **Memory Pipeline**: Integrated trigger detection and contradiction resolution in write path
- **Hybrid Retrieval**: Entity-aware reranking with boost factors
- **Worker Jobs**: Strengthened decay/dedup automation
- **Test Coverage**: Added 24 new tests (145 total, up from 121)

### Fixed

- Worker.ts syntax errors (duplicate method declarations, missing braces)
- AssociationType now includes 'duplicate' and 'merged' types
- Logger calls properly typed in telemetry module
- Memory metadata type definition for contradiction resolution

## [0.8.2] - 2026-01-30

### Added
- Hybrid Search: BM25 + vector search with Reciprocal Rank Fusion
- Importance Scoring: Auto-score memories with temporal decay
- Consolidation: Summarize old, low-importance memory clusters
- Core Memory: 2KB always-visible 4-section memory
- Context Paging: Token budgeting (8KB budget)
- CLI fallback mode when MCP fails
- 16 MCP tools for Claude Code integration

### Technical
- SQLite with FTS5 for local mode
- PostgreSQL + pgvector for team mode
- Drizzle ORM for database abstraction
