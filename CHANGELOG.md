# Changelog

All notable changes to Squish will be documented in this file.

## [1.1.5] - 2026-04-11

### Added - Release Prep Enhancements
- **New environment variables**: SQUISH_ENCRYPTION_PASSPHRASE, SQUISH_DECAY_THRESHOLD, SQUISH_LIFECYCLE_DECAY_CRON, SUPABASE_URL, SUPABASE_SERVICE_KEY, NEON_PROJECT_ID, NEON_SERVICE_KEY, SQUISH_WEIGHT_GRAPH_BOOST
- **PostgreSQL schema**: Added memory_associations, namespaces, and maintenance_jobs tables for full parity with SQLite
- **Release workflow**: Fixed test step to skip when no tests configured

### Added - Wiki Storage
- **Wiki storage module**: New core/wiki/wiki-storage.ts for wiki-style memory organization
- **Memory hooks**: New core/memory/hooks.ts for memory lifecycle hooks

### Changed - Version Bump
- Updated all version references from 1.1.0 to 1.1.5

## [1.1.0] - 2026-03-28

### Changed - Launch Surface Cleanup
- Removed legacy CLI commands `observe` and `projects`
- Removed legacy MCP tools `squish_observe` and `squish_projects`
- `squish learn` is now the single capture path for `success`, `failure`, `fix`, and `observation`
- `squish context --list-projects` is now the single project discovery path
- Launch docs and help now reflect the final 18-tool MCP surface

## [1.1.0-enhanced] - 2026-03-27

### Added - Security & Encryption
- **Client-side encryption**: AES-256-GCM encryption for sensitive memories
- **Optional encryption**: Controlled via `SQUISH_ENCRYPTION_PASSPHRASE` env var
- **Encryption MCP tools**:
  - `squish_set_passphrase`: Set encryption passphrase (writes to `.squish/.env`)
  - `squish_rotate_key`: Rotate passphrase and re-encrypt all memories
- **New schema columns**: `encrypted_content`, `encryption_nonce`, `is_encrypted`, `status`

### Added - Graph-Boosted Retrieval
- **Graph associations**: Memories linked by coactivation count
- **Boost computation**: `weight * coactivationCount` per association
- **Hybrid search integration**: Graph boost added to RRF scoring
- **Configurable weight**: `SQUISH_WEIGHT_GRAPH_BOOST` (default: 1.5)

### Added - Memory Lifecycle
- **Decay scheduler**: Automatic tier promotion/demotion based on importance
- **Tier system**: hot → warm → cold → expired
- **Cron-based**: Configurable via `SQUISH_LIFECYCLE_DECAY_CRON`
- **New schema columns**: `status`, `decay_rate`, `last_decay_at`

### Added - Supabase Backend Support
- **PostgreSQL via Supabase**: New backend option
- **Auto-detection**: Uses Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set
- **Drizzle ORM**: Full compatibility with existing queries

### Changed - Memory Types
- Replaced `jot` type with `note`
- Added `reflection` type
- Updated categorizer, merge strategies, and two-stage detector

## [1.0.0] - 2026-03-17

### 🚀 Major Release - Universal Plugin Architecture

#### Added - Interactive Multi-Step Wizard Installer
- **Beautiful CLI Wizard** with 5-step installation flow using `@clack/prompts`
- Step 1: Component Selection (CLI, MCP Server, AI Agent Plugins)
- Step 2: Plugin Selection (Claude Code, OpenClaw, Cursor, etc.)
- Step 3: Configuration (Local/Remote mode, Embeddings provider)
- Step 4: Review Summary with visual confirmation
- Step 5: Automated installation with progress spinners
- **Quick Install Mode**: `bun run install:interactive --quick` for CLI + all plugins
- **Dry-run support**: Preview installations without making changes
- **Configuration persistence**: Saves settings to `~/.squish/config.json`

#### Added - Universal Plugin Architecture
- **Multi-client support**: Works with Claude Code, OpenClaw, OpenCode, Codex, Cursor, VS Code, Windsurf
- **Plugin types**: Hooks (Claude Code), Plugin-slot (OpenClaw), MCP (all others)
- **Auto-detection**: Detects which AI agents are already installed
- **Source indicators**: Shows which plugins have source code available (📦)

#### Added - Core Infrastructure
- **Search Tracing System**: Debug and performance analysis for searches
  - `core/tracing/collector.ts` - Collects search traces
  - `core/tracing/visualizer.ts` - Visualizes trace data
  - New MCP tools: `squish_get_search_traces`, `squish_get_trace_by_id`
- **Namespace Support**: Hierarchical memory organization
  - `core/namespaces/index.ts` - Namespace management
  - `core/namespaces/uri-parser.ts` - URI parsing for namespaces
- **Memory Layers (L0/L1/L2)**: Token-efficient retrieval
  - `core/layers/generator.ts` - Generates memory layers
- **Self-Iteration Job**: Conversation memory extraction
  - `core/session-hooks/self-iteration-job.ts` - Extracts memories from conversations
  - `core/session-hooks/session-hooks.ts` - Session lifecycle hooks
- **Database Schema Updates**:
  - Added `namespaces` table
  - Added `memory_layers` table
  - Added `search_traces` table

#### Fixed - Dependencies
- **qmd package**: Fixed from non-existent `qmd@0.15.1` to `@tobilu/qmd@2.0.1`
- **mcporter version**: Updated from `1.2.0` to `0.7.3` (matches installed version)
- **Scoped package support**: Dependency manager now handles `@scope/package` names
- **Binary detection**: Properly maps scoped packages to their binary names

#### Changed - Code Organization
- **Refactored CLI**: Improved imports and removed duplicates in `index.ts`
- **Safety Checks**: Better helper functions for algorithm validation
- **Response Builder**: Unified response builder for algorithm handlers
- **Config Validation**: Fixed provider validation logic
- **Association SQL**: Fixed placeholder issues in SQL queries
- **Directory Reorganization**: Renamed `core/sessions/` to `core/session-hooks/` for clarity
  - Session lifecycle hooks now in dedicated directory
  - Separates session auto-load (`core/session/`) from hooks/jobs (`core/session-hooks/`)

#### Documentation
- **Interactive Installer Guide**: Complete docs for wizard usage
- **Plugin Architecture**: Documentation for universal plugin system
- **Installation Guide**: Quick-start for all supported AI agents

### Breaking Changes
None - fully backward compatible with 0.9.x

### Migration Notes
- Run `bun run install:interactive` to use the new wizard
- Existing installations continue to work without changes
- Configuration automatically migrated on first run

## [0.9.3] - 2026-03-14

### Added - Core Memory & Embeddings Improvements (v0.9.2+)

#### Expanded Core Memory
- Increased default core memory limit from 2KB to 16KB total (4KB per section)
- Configurable limits via `SQUISH_CORE_MEMORY_TOTAL_BYTES` and `SQUISH_CORE_MEMORY_SECTION_BYTES`
- Added token estimation for better LLM context budgeting
- Core memory stats now show both byte and token usage

#### Robust Embeddings System
- Fixed hybrid fallback order: Google Multimodal → OpenAI → Ollama → Local (removed QMD from embedding chain)
- Added retry logic with exponential backoff (3 retries default)
- Added configurable timeouts (default 30s) with per-provider overrides
- New `checkEmbeddingProviderHealth()` function for monitoring
- Improved error handling and graceful degradation

#### Enhanced Configuration
- New environment variables for fine-tuning:
  - `SQUISH_EMBEDDINGS_TIMEOUT_MS`, `SQUISH_EMBEDDINGS_MAX_RETRIES`, `SQUISH_EMBEDDINGS_RETRY_DELAY_MS`
  - `SQUISH_OPENAI_TIMEOUT_MS`, `SQUISH_OLLAMA_TIMEOUT_MS`, `SQUISH_GOOGLE_MULTIMODAL_TIMEOUT_MS`
- Better connection handling for all embedding providers

### Changed - Infrastructure
- Updated CI/CD workflows (`.github/workflows/ci.yml`, `release.yml`)
- Removed old `mcp-launch-checks.yml` workflow
- Updated release scripts (auto-detect version, better binary packaging)
- Database schema: added `tokens_estimate` column to `core_memory` table (auto-migrated)

### Security & developer experience
- Renamed `.env.mcp` to `.env.mcp.example` (template) - added to `.gitignore`
- Updated all documentation with new configuration options
- Improved TypeScript type safety across codebase

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
