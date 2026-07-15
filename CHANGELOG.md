# Changelog

All notable changes to Squish will be documented in this file.

## [2.0.0] - 2026-07-15

### Summary

Multimodal ingestion, LLM cross-connection consolidation, and enhanced 7-tool MCP surface.

### Added

- Multimodal ingestion pipeline with 27+ file types across images, audio, video, and documents
- File watcher for automatic inbox directory monitoring and ingestion
- LLM consolidation engine for cross-connection finding between memory clusters
- Supported image types: JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, ICO, HEIC, HEIF
- Supported audio types: MP3, WAV, OGG, FLAC, M4A, AAC, WMA, Opus
- Supported video types: MP4, WebM, AVI, MOV, MKV, WMV, FLV
- Supported document types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MD, CSV, TSV, JSON, JSONL, XML, YAML, YML, TOML, HTML, RTF
- New config options: `multimodal.*` and `consolidation.*` sections in settings.json
- 8 new environment variables for multimodal and consolidation configuration

### Changed

- Enhanced `squish_remember` with `filePath` parameter for multimodal file ingestion (27+ file types) and optional `content` (was required)
- Enhanced `squish_stats` with `action` parameter for watcher control (`start_watcher`, `stop_watcher`) and LLM consolidation (`consolidate`)
- Server version: 2.0.0

## [1.6.0] - 2026-06-08

### Summary

Session search across Claude Code and Codex. Agents can now search previous session history as evidence, not just recall durable memory.

Squish 1.5 made memory adaptive. Squish 1.6 makes agent history searchable.

### Added

- **Claude Code session search** (`squish sessions list/search/show --source claude-code`):
  - Reads `~/.claude/history.jsonl` and per-session JSONL files
  - Full text search across session messages
  - Related session discovery by project path overlap
- **Codex session search** (`squish sessions list/search/show --source codex`):
  - Reads `~/.codex/state_5.sqlite` threads table
  - Deep search via rollout JSON files
  - Related session discovery by cwd and git remote

### Improved

- **CLI `squish sessions status`** now shows status for all available agent stores (OpenCode, Claude Code, Codex)

## [Landing Site] - 2026-07-13

### Summary

SEO, AI search optimization (AEO/GEO/GSO), structured data, and pricing accuracy improvements across the squishplugin.dev landing site.

### Added

- **Structured data (JSON-LD)**: `aggregateRating` + `review` schema on SoftwareApplication markup in `index.html`
- **BreadcrumbList schema**: JSON-LD breadcrumbs (Home > Documentation > Privacy Policy > Terms of Service) for richer search results
- **Per-route SEO hooks**: `hooks/useSEO.ts` provides unique `<title>`, `<meta description>`, and canonical URLs for Documentation (`/docs`), Privacy Policy (`/privacy`), and Terms of Service (`/terms`) pages
- **Competitor comparison section**: New `CompetitorComparison` component on the marketing page (placed between Differentiator and Pricing sections)
- **Twitter/X metadata**: Added `twitter:site` handle (`@4mlabs_io`) and fixed `twitter:*` tags to use `name` attribute instead of `property` for compliance with Twitter card spec
- **Cache-Control header**: Added to `vercel.json` for root page to improve page load performance

### Changed

- **Open Graph image**: Switched `og:image` from SVG to PNG (`og-image.png`) for broader platform compatibility
- **Sitemap updated**: Added `/privacy` and `/terms` URLs; updated `lastmod` dates across all entries
- **Pricing consistency**: Fixed pricing across 4 documentation/manifest files (`llms.txt`, `llms-full.txt`, `.well-known/ucp`, `.well-known/acp.json`) to match actual site pricing: Free/$0, Solo/$9/mo, Pro/$29/mo, Team/$99/mo

### Files Modified

- `index.html` -- aggregateRating/review schema, BreadcrumbList schema, Twitter metadata, og:image
- `hooks/useSEO.ts` -- new file for per-route meta tags
- `sitemap.xml` -- added /privacy, /terms URLs; updated lastmod
- `vercel.json` -- Cache-Control header for root page
- `llms.txt` -- pricing correction
- `llms-full.txt` -- pricing correction
- `.well-known/ucp` -- pricing correction
- `.well-known/acp.json` -- pricing correction

---

## [1.9.0] - 2026-07-01

### Summary

Advanced retrieval pipeline, sleep-time consolidation, and repo security hardening. 18-tool MCP surface unchanged.

### Added

- **Advanced retrieval pipeline**: Query expansion, entity-aware reranking, contextual enrichment, MMR diversity, and cross-encoder reranking in a unified `hybridSearch` function
- **Sleep-time consolidation** (`squish_consolidate`): Background dedup, summarize, invalidate stale memories, and run decay on a schedule
- **Strategies table auto-creation**: Strategies layer schema created on first use if missing
- **Agent store type definitions**: Full TypeScript types for `AgentSessionStore` interface and `SessionGroup`/`Chunk` shapes

### Changed

- **Retrieval pipeline refactored**: `core/memory/hybrid-search.ts` rewritten from 800+ lines to clean modular pipeline with per-stage latency tracking
- **Cross-encoder defaults tuned**: Reduced `topK` from 100 to 30 for interactive use
- **Graph boost optimized**: Batch BFS traversal, parallelized association loading, cached DB results
- **Schema columns added**: `contextual_summary`, `entities`, `retrieval_priority`, `quality_score`, and `confidence` columns on memories table
- **MCP tool count**: Remains at 18 local-only tools

### Fixed

- **Scheduler**: Handle step cron expressions like `*/6` in `getNextRunTime`
- **Database bootstrap**: Added missing `maintenance_job_history` table
- **Places system**: Fixed N+1 queries, duplicate functions, adjacency-aware walking
- **Embeddings**: NaN guards, fixed swapped `rerankResults` args, dead import removal
- **Test suite**: Removed vitest imports, fixed `spawnSync` hang, fixed env cleanup, removed `mock.module` pollution

### Security

- **Removed internal files from git**: `PLAN.md` (297-line implementation plan), `.test-data-db-client/salt` (cryptographic test artifact), `docs/superpowers/plans/2026-06-20-launch-readiness.md` (internal launch plan)
- **Gitignore hardened**: Added rules for `.test-data*/`, `PLAN.md`, `plans/`, `wiki/`, `~/` directories
- **Deleted `~/` artifact**: Removed misplaced home directory artifact from repo root

## [1.8.0] - 2026-06-20

### Summary

Removed team tools and Kuzu backend from open-source distribution. Local-only MCP surface now at 18 tools.

### Removed

- **Team tools removed from OSS**: `squish_team_create_workspace`, `squish_team_invite`, `squish_team_list_members`, `squish_team_delete_workspace` no longer included in open-source builds
- **Kuzu backend removed**: Graph database dependency dropped; knowledge graph now uses SQLite-only adjacency lists

### Changed

- **MCP tool count**: 18 local-only tools (down from 22 with team tools)
- **Documentation updated**: All references now reflect 18-tool surface

## [1.7.0] - 2026-06-14

### Summary

MCP tool count updated to 17, mode switching improvements, team CLI commands added.

### Added

- **MCP tools**: `squish_consolidate` (background dedup/summarize)
- **Strategy integration**: Strategies now auto-extract during remember, auto-recall during recall, and auto-load in session context
- **Mode switching**: `squish mode` command to switch between local and cloud modes
- **Team CLI commands**: `squish team create`, `squish team invite`, `squish team list`, `squish team leave`

### Changed

- **MCP tool count**: 17 tools (was 18)
- **Documentation**: All tool count references updated across README, architecture docs, install guides

## [1.5.5] - 2026-06-01

### BREAKING

- **Removed `squish sessions inject <id>` CLI subcommand and the `squish_session_inject` plugin tool.** Agents have `bash` / native code-exec; the inject step was a workaround for chat-only clients. Use `squish_session_search` (or `/squish search`) and the agent's own context to pull what it needs. The auto-inject-on-session-start behavior (`injectContextOnStart`) is unchanged — only the manual tool is gone.
- **`--source` semantics changed.** The previous values were `squish | opencode | all`. The new values are `opencode | claude-code | codex | all`. The `squish` source (the captured-memories path) is no longer in scope of `searchChunks` / `listSessions` / `getSessionChunks` / `findRelatedSessions` — that's the job of `squish_recall` / `squish_remember` (and the `squish` CLI's `recall` / `search` / `remember` subcommands). Passing `--source squish` now exits with a clear error: `unknown source 'squish'. Available: opencode, claude-code, codex, all`.
- **Sessions surface is now exclusively for past agent sessions** (read via the `agent-stores` adapter layer). The CLI / plugin no longer search the squish memories DB for session queries. Long-term memory stays accessible via `squish_recall` / `squish_remember` (and the CLI's `squish recall` / `squish search` / `squish remember`).

### Added

- **Three-tool model**: the sessions surface is now just `search` (past agent sessions) / `recall` (long-term memory) / `remember` (write to long-term memory). Each tool has a single, well-defined job.
- **`core/sessions/agent-stores/` adapter layer** (`AgentSessionStore` interface + registry). Each agent (opencode, claude-code, codex) implements the interface. The public `core/sessions/store.ts` iterates the registry instead of branching on source.
- **OpenCode-backed store** (full implementation): reads `~/.local/share/opencode/opencode.db` (or the user-overridden path) and returns `SessionGroup[]` / `Chunk[]` / related-session lists.
- **Persistent FTS5 sidecar** at `~/.squish/opencode-fts.db` for sub-100ms deep searches over 1.35M parts. Mtime-gated refresh; never rebuilt unless opencode.db changes.
- **Claude Code and Codex stores** as stubs that return `available: false` with a clear reason. To enable, implement the same `AgentSessionStore` interface in their respective files and add a registry entry.
- **Auto-capture**: OpenCode plugin auto-records every session — title, summary, files touched, decisions, commands, errors, todos. Zero config.
- **Search**: `squish sessions search "query"` returns the 3-10 most relevant CHUNKS (not whole sessions). Each chunk is a decision, command, file change, error, or summary tied to a session.
- **Killer feature `/squish related`**: One slash command auto-finds past sessions relevant to the current repo and recently-touched files.
- **CLI subcommands**: `squish sessions {list, show, search, capture, related, status}` — thin JSON wrappers over the storage module. (The previous `inject` subcommand is removed; see BREAKING above.)
- **Plugin sessions tools**: 5 LLM-invokable tools (`squish_session_list` / `_show` / `_search` / `_capture` / `_related`) — list/show use the OpenCode store, search/capture/related use the agent-stores registry.
- **Slash command**: ONE `squish.md` command that parses `$ARGUMENTS` as a subcommand. User: "no, dont make a ton of commands just 1 with args" — done.
- **Search scoring**: keyword + tag + file + decision matching, ranked. NO embeddings in MVP.
- **Cross-agent prep**: Chunk schema has `agent` and `agent_session_id` fields; the registry makes adding Claude Code / Codex a single-file change.

### Changed

- `squish sessions` command added to schema probe exempt list (it does not require a database).
- `core/sessions/opencode-store.ts` is now a thin re-export shim over `core/sessions/agent-stores/opencode.js`. The real implementation moved to the adapter layer.

### Fixed

- Plugin previously used a non-existent OpenCode plugin API (`api.registerTool`, `api.on("session.start")`). The OpenCode plugin now uses the real hook-based `@opencode-ai/plugin` API.

## [1.5.0] - 2026-05-31

- **Removed hot/cold tier system**: Memories no longer classified into tiers. Decay and eviction still run on importance scores. Tier column preserved in schema for backward compatibility.
- **Removed Obsidian integration**: No longer syncs memories to Obsidian vault.
- **Removed markdown storage**: No longer generates .md files for memories.

## [1.2.0] - 2026-04-19

### Added - QMD Integration

- **Dependency**: Add @tobilu/qmd@^2.1.0 as npm package
- **Wrapper**: New core/search/qmd-wrapper.ts with search, query, vsearch, embed functions
- **Usage as library**: Uses SDK library API (not CLI MCP wrapper)

### Added - Persistent Hot Cache (Karpathy-Style)

- **Persistent storage**: .squish/hot-cache.json survives restart
- **Deduplication**: SHA256 hash-based content deduplication
- **Stale prevention**: Entries flagged after 7 days without reference
- **Auto-clean**: Entries older than 14 days removed on load
- **Session integration**: Loaded on auto-load, saved on session end
- **Size limit**: ~500 words max with trim-to-recent policy

### Changed - Memory Runtime

- **Simplified lifecycle**: Removed deprecated warm tier (hot/cold only now)
- **Updated schemas**: Both SQLite and Postgres tier columns now hot|cold
- **Updated lifecycle**: TIER_THRESHOLDS only has hot and cold thresholds
- **Updated scorer**: Removed warm scoring bonuses
- **Updated CLI**: Descriptions reflect simplified tier system

## [1.3.0] - 2026-04-19

### Added - Belief System (Derived Semantic Layer)

- **Belief extraction from memories**: Automatically extracts beliefs from durable memories
- **Belief types**: decision, preference, constraint, failure_cause, state_change, dispute
- **Belief decay engine**: 30-day half-life, disputed beliefs decay 1.5x faster
- **Source tracking**: Each belief tracks source memories for provenance
- **Integration**: Beliefs extracted on both explicit and auto-capture durable writes

### Changed - Schema Integration

- **Canonical schema**: Belief tables now in SQLite and Postgres drizzle schemas
- **Bootstrap migration**: Belief table creation included in db/bootstrap.ts
- **Decay fields**: last_confirmed_at, belief_decay_rate, source_count, confidence

### Changed - Scheduler Resilience

- **Catch-up logic**: On scheduler init, checks for missed jobs and runs catch-up
- **Grace period**: Jobs with elapsed > 1.5x expected interval trigger catch-up
- **Handles sleep/wake**: No more missed jobs when machine is off/sleeping

### Added - Query Functions

- **getAllBeliefs()**: Query all beliefs for a project with filtering
- **searchBeliefs()**: Search beliefs by statement content
- **Provenance display**: Memory inspection shows source count, evidence preview

### Fixed - Trust Surfaces

- **Beliefs in context**: Context state now includes extracted beliefs
- **Beliefs in trust report**: Trust report surfaces belief summaries
- **Enhanced inspect**: Memory explain shows belief provenance

### Added - Signal-Aware Memory Runtime
- **Signal distillation engine**: Captured events are now classified as `discard`, `session-only`, `durable-distilled`, or `durable-raw+distilled`
- **Session working set**: Active files, recent commands, failures, hypotheses, active places, and graph cues are compacted for wake-up continuity
- **Raw fallback snapshots**: Nuance-sensitive durable events can keep linked raw artifacts without polluting normal retrieval
- **Incremental place + graph routing**: Durable writes now feed place assignment and graph enrichment as part of the same runtime loop

### Added - Trust-Oriented CLI And MCP Surfaces
- **`squish health`**: New health command for project scope, subsystem status, and next-step guidance
- **`squish inspect` / `squish_inspect`**: Explanation path for why a memory exists, whether raw fallback exists, and how legacy records should be read
- **Structured MCP trust outputs**: `squish_context`, `squish_health`, and `squish_stats` now expose current project, runtime state, and recovery guidance in a predictable shape

### Changed - Project Context And Wake-Up Semantics
- **Canonical current project**: Normal context output now prefers the real workspace path and suppresses legacy placeholder project noise
- **Wake-up order**: Session working set and active runtime state are surfaced before broad durable recall
- **Stats semantics**: Durable memory totals are now clearly separated from capture-era signal telemetry

### Fixed - Trust Consistency
- **`squish doctor` coherence**: Doctor now reads as one combined trust-and-diagnostics command instead of two stacked reports
- **Legacy inspection**: Older memories now report `legacy-durable` instead of `unknown`, with explicit provenance text
- **Release verification path**: Added `bun run verify:mcp` for packaged MCP health verification

### Docs
- README, CLI reference, install quickstart, architecture notes, and release notes updated to match the automatic memory runtime and current command surface

### Added - Unified Write Path (squish_remember)
- **New unified memory tool**: `squish_remember` auto-detects memory vs learning routing
- **Auto-type detection**: Detects `success`, `failure`, `fix`, `observation`, `decision`, `preference`, `note`, `reflection`
- **Hot/cold tier support**: Automatic routing to appropriate storage tier
- **Code pattern detection**: Recognizes code changes, errors, fixes in agent outputs
- **Place and pin flags**: Support for place-based and pinned memories

### Added - Graph Auto-Update
- **Auto-update graph on remember**: Knowledge graph updated automatically when memories are stored
- **Auto-update graph on link**: Graph updated when associations are created between memories
- **Integration**: Graph module now integrated into main write path (was previously standalone)

### Added - New CLI Commands
- **`squish run web`**: Start web UI on port 37777
- **`squish migrate`**: Unify multiple .squish folders into single location
- **Full CLI suite**: 10+ commands (remember, search, recall, recent, context, stats, forget, link, stale, clean)

### Added - Memory Decay System
- **Enabled by default**: Memory decay now runs automatically (was broken in 1.1.x)
- **Configurable intervals**: Sector decay intervals now configurable via env vars
- **Auto-clean enabled**: Automatic cleanup of expired memories (was dry-run only)
- **Fixed**: Removed dead code and consolidated decay logic

### Added - add-mcp Integration
- **Universal MCP installation**: Replaced manual config writing with `add-mcp`
- **Multi-client support**: Works with Zed, Goose, Gemini CLI, Claude Code, Cursor, OpenCode, Windsurf
- **Global flag**: `--global` flag for user-level installation
- **Simplified installer**: `bin/install-interactive.mjs` rewritten to use add-mcp

### Fixed - v1.1.5 Issues
- **bin/ tracked in git**: Removed from .gitignore, now included in npm package
- **CLI commands work**: Fixed npm publishing issue that broke CLI
- **Type safety**: Fixed LSP errors, obsidian-vault import path, cron types

### Refactored - Code Cleanup
- **Consolidated estimateTokens**: Moved from 5 files to single source (`core/context/context-window.ts`)
- **Consolidated MemoryDiff**: Moved from 2 files to `core/snapshots/comparison.ts`
- **Removed stubs**: Deleted `core/autosave.ts`, `core/external-folder/`, `core/config.js`
- **Implemented placeholders**: `readFromVault()` in obsidian-vault now functional

### Refactored - Legacy Removal
- **Removed hooks/**: No longer needed (add-mcp handles installation)
- **Removed install scripts**: `bin/install-claude-code.sh`, `bin/install-opencode.sh` deleted
- **Removed config/hooks/**: Hook config files for Claude Code, Cursor, OpenCode, Windsurf deleted
- **Removed unused config files**: 10+ unused JSON configs deleted (mcp.json, plugin.json, etc.)
- **Removed core/adapters/scripts/**: Legacy adapter install scripts deleted

### Refactored - MD Docs Cleanup
- **Removed from core/commands/**: 11 .md files deleted (docs belong in README/CHANGELOG)
- **Updated package.json**: Removed explicit .md file entries from files array

## [1.1.6] - 2026-04-13

### Fixed - MCP HTTP Transport Migration
- **Migrated MCP HTTP from SSE to Streamable HTTP**: The deprecated SSE transport wasn't working. Now uses `StreamableHTTPServerTransport` from the MCP SDK with proper session handling.

### Fixed - Database Schema Migrations
- Added `session_summaries` table
- Added `memory_associations.metadata` column
- Added `memories_fts.summary` column (recreates FTS table)

### Added - QMD Dependency
- Added `qmd` as bundled dependency

## [1.1.5] - 2026-04-11

### Added - Release Prep Enhancements
- **New environment variables**: SQUISH_ENCRYPTION_PASSPHRASE, SQUISH_DECAY_THRESHOLD, SQUISH_LIFECYCLE_DECAY_CRON, SUPABASE_URL, SUPABASE_SERVICE_KEY, NEON_PROJECT_ID, NEON_SERVICE_KEY, SQUISH_WEIGHT_GRAPH_BOOST
- **PostgreSQL schema**: Added memory_associations, namespaces, and maintenance_jobs tables for full parity with SQLite
- **Release workflow**: Fixed test step to skip when no tests configured

### Added - Wiki Storage
- **Memory storage module**: New core/memory/markdown/markdown-storage.ts for memory file storage
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
- 18 MCP tools for Claude Code integration

### Technical
- SQLite with FTS5 for local mode
- PostgreSQL + pgvector for team mode
- Drizzle ORM for database abstraction
