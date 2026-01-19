# Squish - Two-Tier Memory System for Claude Code

A persistent, context-aware memory plugin for Claude Code (v0.5.0) that provides intelligent memory management with a two-tier architecture: always-in-context core memory (2KB) plus context paging for selective memory loading.

## Features

### Memory Architecture

- **Core Memory (Tier 1)**: 2KB always-visible persistent memory divided into 4 sections
  - `persona`: AI assistant personality and role definition
  - `user_info`: Information about the user and their preferences
  - `project_context`: Current project architecture and patterns
  - `working_notes`: Transient notes during active work sessions

- **Context Paging (Tier 2)**: Agent-controlled memory loading with token budgeting
  - Dynamically load/evict memories based on relevance
  - Token-aware context management (8KB default budget)
  - Automatic memory decay and lifecycle management

### MCP Tools (11 Consolidated)

**Core Memory Management:**
- `/core_memory` - View, edit, or append to always-in-context memory sections

**Context & Search:**
- `/context_paging` - Load/evict/view loaded memories in current session
- `/context` - Get project context with semantically relevant memories
- `/search` - Hybrid full-text + semantic search across memories
- `/context_status` - Check context window usage and loaded memories

**Memory Operations:**
- `/remember` - Store new observations, facts, decisions, and preferences
- `/recall` - Retrieve specific memories by ID with metadata
- `/observe` - Record tool usage and patterns observed during execution

**Memory Consolidation:**
- `/merge` - Detect duplicates, preview/approve/reject merges, manage merge history

**System:**
- `/health` - Check MCP server and database connectivity

### Storage

- **SQLite** (local mode): Local-first, zero setup required
- **PostgreSQL** (team mode): Shared memory across users
- Smart embeddings: Local TF-IDF (offline) for SQLite, OpenAI/Ollama for PostgreSQL

## Installation

### For Local Development Testing

Load the plugin directly without installation:

```bash
claude --plugin-dir "C:\Users\michi\Desktop\squish-cc\squish"
```

Or on macOS/Linux:

```bash
claude --plugin-dir "/path/to/squish"
```

This loads the plugin from your development directory and allows immediate testing of changes.

### For Production Installation

1. Build the plugin:
```bash
npm install
npm run build
```

2. Package as npm module:
```bash
npm pack
```

3. Install the `.tgz` file:
```bash
npm install -g squish-0.5.0.tgz
```

## Configuration

### Environment Variables

**Required (SQLite mode - default):**
- None! Works out-of-the-box with local TF-IDF embeddings

**Optional (SQLite mode):**
- `SQUISH_DATA_DIR`: Custom data directory (default: `~/.squish`)
- `SQUISH_EMBEDDINGS_PROVIDER`: Force embedding provider (`none`, `local`, `openai`, `ollama`)

**Team Mode (PostgreSQL):**
- `DATABASE_URL`: PostgreSQL connection string (activates team mode)
- `SQUISH_OPENAI_API_KEY`: OpenAI API key for embeddings (optional in team mode)
- `SQUISH_OLLAMA_URL`: Ollama server URL for local LLM embeddings

**Advanced Options:**
```bash
# Lifecycle management
SQUISH_LIFECYCLE_ENABLED=true
SQUISH_LIFECYCLE_INTERVAL=3600000  # ms

# Session summarization
SQUISH_SUMMARIZATION_ENABLED=true
SQUISH_INCREMENTAL_THRESHOLD=10
SQUISH_ROLLING_WINDOW_SIZE=50

# Agent isolation
SQUISH_AGENT_ISOLATION_ENABLED=true
SQUISH_DEFAULT_VISIBILITY=private  # private|project|team|global

# Memory consolidation
SQUISH_CONSOLIDATION_ENABLED=false
SQUISH_CONSOLIDATION_THRESHOLD=0.8
```

## Quick Start

### 1. Initialize Core Memory

Store basic information that will always be available:

```bash
/core_memory action=edit projectId=my-project section=persona content="I am a helpful assistant specialized in cloud infrastructure and DevOps."
```

### 2. Store Session Observations

Record what you learn during work:

```bash
/remember projectId=my-project type=observation action=discovered target=kubernetes_pattern summary="Found the team uses GitOps with ArgoCD" tags=["kubernetes","gitops","devops"]
```

### 3. Search Your Memory

Find relevant past learnings:

```bash
/search projectId=my-project query="kubernetes deployment" limit=5
```

### 4. Load Context for an Agent

Load relevant memories for agent use:

```bash
/context_paging action=load sessionId=session-123 projectId=my-project memoryId=mem-456
```

## Architecture

### Database Schema

**Core Tables:**
- `core_memory` - Always-in-context 2KB persistent memory
- `memories` - Main memory storage with lifecycle tracking
- `context_sessions` - Per-session context window tracking
- `conversations` - Chat session records
- `messages` - Message history with embeddings

**Lifecycle Tables:**
- `memory_associations` - Semantic relationships between memories
- `memory_merge_proposals` - Duplicate detection proposals
- `memory_merge_history` - Audit trail of merges
- `memory_snapshots` - Before/after diffs for auditability
- `session_summaries` - Incremental and rolling summaries

**Search & Discovery:**
- `entities` - Named entities (functions, files, patterns, people)
- `entity_relations` - Relationships between entities
- `memory_hash_cache` - Hash signatures for duplicate detection

### Memory Lifecycle States

Each memory has:
- **Sector**: episodic, semantic, procedural, autobiographical, working
- **Tier**: hot (recent/relevant), warm (accessible), cold (archived)
- **Status**: active, merged, superseded, expired
- **Visibility**: private (user), project, team, global

### Hooks

4 lifecycle hooks automatically trigger:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `SessionStart` | Session begins | Initialize session memory, load core memory |
| `UserPromptSubmit` | User sends message | Enhance prompt with relevant memories |
| `PostToolUse` | Tool completes | Record tool usage observations |
| `SessionEnd` | Session closes | Persist discoveries, summarize session |

## API Reference

### Core Memory Operations

```bash
# View all sections
/core_memory action=view projectId=PROJECT_ID

# Edit a section
/core_memory action=edit projectId=PROJECT_ID section=persona content="..."

# Append to a section
/core_memory action=append projectId=PROJECT_ID section=working_notes content="New observation"
```

### Memory Management

```bash
# Store a memory
/remember projectId=PROJECT_ID type=fact content="..." tags=["tag1","tag2"]

# Search memories
/search projectId=PROJECT_ID query="search term" type=fact limit=10

# Retrieve by ID
/recall memoryId=MEMORY_ID

# Get merged view
/context projectId=PROJECT_ID include=memories include=observations limit=20
```

### Context Paging

```bash
# Load memory into session context
/context_paging action=load sessionId=SESSION_ID projectId=PROJECT_ID memoryId=MEMORY_ID

# Unload memory from session
/context_paging action=evict sessionId=SESSION_ID memoryId=MEMORY_ID

# View loaded memories
/context_paging action=view sessionId=SESSION_ID

# Check context usage
/context_status projectId=PROJECT_ID sessionId=SESSION_ID
```

### Memory Merging

```bash
# Detect duplicate memories
/merge projectId=PROJECT_ID action=detect

# List merge proposals
/merge projectId=PROJECT_ID action=list status=pending

# Preview a merge
/merge projectId=PROJECT_ID action=preview proposalId=PROPOSAL_ID

# Approve merge
/merge projectId=PROJECT_ID action=approve proposalId=PROPOSAL_ID reviewNotes="Approved because..."

# Reject merge
/merge projectId=PROJECT_ID action=reject proposalId=PROPOSAL_ID reviewNotes="Keep separate because..."

# Get merge statistics
/merge projectId=PROJECT_ID action=stats
```

## Database Modes

### SQLite Mode (Default - Local Development)

- **Storage**: `~/.squish/squish.db` (local SQLite database)
- **Embeddings**: Local TF-IDF (no API calls, works offline)
- **Performance**: Fast, suitable for single-user development
- **Setup**: Zero configuration required
- **Data**: Stored locally on machine

### PostgreSQL Mode (Team - Enterprise)

- **Storage**: Shared PostgreSQL database
- **Embeddings**: Optional OpenAI or Ollama for better semantic search
- **Performance**: Optimized for multi-user teams
- **Setup**: Requires DATABASE_URL configuration
- **Data**: Shared across team members with access control

```bash
# Enable PostgreSQL mode
DATABASE_URL=postgresql://user:password@host/dbname
SQUISH_OPENAI_API_KEY=sk-... # optional
```

## Development

### Project Structure

```
squish/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace metadata
├── .mcp.json                # MCP server configuration
├── db/
│   ├── index.ts             # Database adapter
│   ├── bootstrap.ts         # Schema initialization
│   └── adapter.ts           # SQLite/PostgreSQL abstraction
├── core/
│   ├── core-memory.ts       # Core memory operations
│   ├── context-paging.ts    # Memory loading system
│   ├── local-embeddings.ts  # TF-IDF embeddings
│   └── logger.ts
├── drizzle/
│   ├── schema.ts            # PostgreSQL schema
│   └── schema-sqlite.ts     # SQLite schema
├── commands/                # Slash commands (10 total)
├── hooks/                   # Lifecycle hooks
├── index.ts                 # MCP server entry point
├── config.ts                # Configuration management
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm run test

# Pack for distribution
npm pack
```

### Testing

```bash
# Run comprehensive system test
node test-v0.5.0.mjs

# Start development with watch mode
npm run dev
```

## Troubleshooting

### Database Issues

**Error: "database disk image is malformed"**
- SQLite database corrupted - delete `~/.squish/squish.db` and restart

**Error: "Connection refused"** (PostgreSQL mode)
- Verify DATABASE_URL is correct: `postgresql://user:pass@host:5432/dbname`
- Ensure PostgreSQL server is running

### MCP Server Issues

**Error: "Hook error: ERR_UNSUPPORTED_ESM_URL_SCHEME"**
- Use relative paths in hooks.json instead of absolute Windows paths
- Use `./hooks/file.js` instead of `C:\path\to\hooks.js`

**Error: "Plugin not found in marketplace"**
- Using `--plugin-dir` flag? This is expected - not installed from marketplace
- For local development, this is normal behavior

### Performance Issues

**Memory is growing unbounded**
- Enable lifecycle management: `SQUISH_LIFECYCLE_ENABLED=true`
- Increase consolidation: `SQUISH_CONSOLIDATION_ENABLED=true`
- Review memory decay rates in configuration

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

MIT - See LICENSE file for details

## Support

- GitHub Issues: https://github.com/michielhdoteth/squish/issues
- Documentation: https://github.com/michielhdoteth/squish#readme

## Changelog

### v0.5.0 (Latest)
- Implemented smart embeddings strategy (local TF-IDF for SQLite, OpenAI/Ollama for PostgreSQL)
- Added missing core_memory and context_sessions tables to bootstrap
- Fixed plugin manifest validation for Claude Code compatibility
- Fixed hooks path resolution for Windows compatibility
- Consolidated 18 MCP tools to 11 with action-based API
- Core memory fully functional with 4-section architecture

### v0.4.1
- Consolidated 25 command files to 15
- Removed 4 phantom commands
- Fixed validation order in MCP request handlers

### v0.3.0
- Lifecycle management with memory decay
- Session summarization (incremental and rolling)
- Agent-aware memory isolation
- Memory governance and protection
- Memory associations and graph traversal

### v0.2.0
- Vector embeddings for semantic search
- Memory snapshots for auditability
- Folder-scoped observations

### v0.1.0
- Initial release with core memory and context paging
- Full-text search (FTS5)
- Two-tier architecture
