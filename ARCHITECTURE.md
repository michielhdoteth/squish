# Squish Architecture Documentation

## Overview

Squish v0.6.0 is a two-tier persistent memory system for Claude Code with intelligent context management, memory lifecycle management, and dual storage support (SQLite for local, PostgreSQL for team).

## Folder Structure

```
squish/
├── adapters/                    # External integrations (v0.6.0)
│   └── claude-code/            # Claude Code plugin integration
│       ├── capture.ts          # Auto-capture system
│       ├── injection.ts        # Context injection system
│       ├── plugin-wrapper.ts   # Hook handlers
│       ├── types.ts            # Plugin types
│       └── index.ts
│
├── algorithms/                  # Complex algorithms (v0.6.0)
│   └── merge/                  # Duplicate detection & merging
│       ├── analytics/          # Token estimation
│       ├── detection/          # Semantic ranking
│       ├── handlers/           # Merge operation handlers
│       ├── operations/         # Merge operations
│       ├── safety/             # Safety checks
│       ├── strategies/         # Merge strategies
│       ├── types.ts
│       └── index.ts
│
├── api/                         # External APIs (v0.6.0)
│   └── web/                    # Web server
│       ├── web-server.ts
│       ├── web.ts
│       └── index.ts
│
├── core/                        # Core business logic
│   ├── memory/                 # Memory operations (v0.6.0)
│   │   ├── memories.ts         # Main memory service
│   │   ├── serialization.ts    # JSON serialization
│   │   ├── entity-extractor.ts
│   │   ├── temporal-parser.ts
│   │   ├── hybrid-scorer.ts
│   │   ├── bridge-discovery.ts
│   │   ├── memory-manager.ts
│   │   └── index.ts
│   │
│   ├── search/                 # Search functionality (v0.6.0)
│   │   ├── conversations.ts    # Conversation search
│   │   ├── entities.ts         # Entity search
│   │   ├── folder-context.ts   # Folder context generation
│   │   └── index.ts
│   │
│   ├── associations.ts         # Memory associations
│   ├── cache.ts                # Redis caching
│   ├── context.ts              # Project context retrieval
│   ├── context-paging.ts       # Memory loading/eviction (Tier 2)
│   ├── core-memory.ts          # Core memory (Tier 1)
│   ├── database.ts             # Database abstraction
│   ├── embeddings.ts           # Embedding providers
│   ├── governance.ts           # Memory governance (pin/protect)
│   ├── lifecycle.ts            # Memory lifecycle management
│   ├── logger.ts               # Logging
│   ├── observations.ts         # Observation recording
│   ├── privacy.ts              # Privacy filtering
│   ├── projects.ts             # Project management
│   ├── secret-detector.ts      # Secret detection
│   ├── summarization.ts        # Session summarization
│   ├── utils.ts                # Utilities
│   └── worker.ts               # Background worker
│
├── db/                          # Database layer
│   ├── bootstrap.ts            # Schema initialization
│   ├── adapter.ts              # Database factory
│   ├── schema.ts               # Drizzle schema exports
│   └── index.ts
│
├── hooks/                       # Claude Code lifecycle hooks
│   ├── session-start.js
│   ├── user-prompt-submit.js
│   ├── post-tool-use.js
│   ├── session-end.js
│   ├── hooks.json
│   └── hooks.md
│
├── dist/                        # Compiled TypeScript output
├── .squish/                     # Runtime data (gitignored, v0.6.0)
│   └── squish.db               # SQLite database
│
├── config.ts                    # Configuration
├── index.ts                     # MCP server entry point
└── [other files]
```

## Architecture Layers

### Layer 1: Database
- **File**: `db/adapter.ts`, `db/bootstrap.ts`
- **Purpose**: Abstraction over SQLite (local) and PostgreSQL (team)
- **Key Functions**: `createDb()`, `ensureSqliteSchema()`, `ensureDataDirectory()`

### Layer 2: Core Services
- **Files**: `core/*.ts`
- **Purpose**: Business logic independent of storage/adapter
- **Key Services**:
  - **Memory**: `memories.ts` - CRUD operations
  - **Context Paging**: `context-paging.ts` - Load/evict memories
  - **Core Memory**: `core-memory.ts` - Always-visible 2KB memory
  - **Embeddings**: `embeddings.ts` - Multi-provider embeddings
  - **Observations**: `observations.ts` - Tool usage tracking

### Layer 3: Adapters
- **Files**: `adapters/claude-code/*.ts`
- **Purpose**: Integration with specific platforms
- **Components**:
  - **Capture**: Records tool usage and prompts
  - **Injection**: Injects context into sessions
  - **Plugin Wrapper**: Implements Claude Code hooks

### Layer 4: Algorithms
- **Files**: `algorithms/merge/*.ts`
- **Purpose**: Complex domain logic
- **Components**: Duplicate detection, merge strategies, safety checks

### Layer 5: APIs
- **Files**: `api/web/*.ts`
- **Purpose**: External interfaces
- **Components**: Web server for UI access

## Memory Architecture (v0.6.0)

### Two-Tier Model

**Tier 1: Core Memory (Always-In-Context)**
- Size: 2KB max total
- Sections: persona, user_info, project_context, working_notes
- Access: Automatic injection at session start
- Lifetime: Persistent across sessions
- Update: Via `/core_memory` tool or hooks

**Tier 2: Context Paging (On-Demand Loading)**
- Storage: External database
- Access: Agent-controlled via `/context_paging` tool
- Lifetime: Flexible lifecycle with decay
- Context Status: `in-context`, `out-of-context`, `archived`

### Memory Lifecycle

```
Created
  ↓
Hot (recent, actively used)
  ↓
Warm (relevant but not recent)
  ↓
Cold (archived, rarely accessed)
  ↓
Deleted (expired or manually removed)
```

### Context Status (v0.6.0)

Memories tracked by context availability:
- `in-context`: Currently loaded in session
- `out-of-context`: Available but not loaded
- `archived`: Inactive or expired

## Database Initialization (v0.6.0)

### Local Mode (SQLite)
1. User starts Claude Code session
2. `SessionStart` hook fires
3. `ensureDataDirectory()` creates `.squish/` in project root
4. `createDb()` initializes SQLite connection at `.squish/squish.db`
5. `ensureSqliteSchema()` creates tables if not exists
6. Core memory auto-injected into context

### Team Mode (PostgreSQL)
1. `DATABASE_URL` environment variable set
2. `createDb()` detects PostgreSQL connection string
3. `ensurePostgresSchema()` creates tables if not exists
4. All operations use shared database

## Data Directory (v0.6.0)

### Location Resolution
```typescript
const projectRoot = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
const dataDir = process.env.SQUISH_DATA_DIR || join(projectRoot, '.squish');
```

**Default Behavior:**
- Local: `./.squish/` in project working directory
- Override: `SQUISH_DATA_DIR` environment variable

**Directory Structure:**
```
.squish/
├── squish.db          # SQLite database
├── schema.sql         # Optional schema file
└── cache/             # Optional embedding cache
```

## Hook System (v0.6.0)

### Available Hooks

**SessionStart** (`hooks/session-start.js`)
- Triggers at session beginning
- Creates `.squish/` directory
- Initializes MCP server
- Injects core memory

**UserPromptSubmit** (`hooks/user-prompt-submit.js`)
- Triggers on user input
- Auto-captures prompt
- Smart search for relevant memories

**PostToolUse** (`hooks/post-tool-use.js`)
- Triggers after tool execution
- Records observation
- Queues for summarization

**SessionEnd** (`hooks/session-end.js`)
- Triggers on session stop
- Finalizes observations
- Runs lifecycle maintenance

## Configuration Resolution

### Priority Order
1. Environment variables (highest)
2. `.env` file
3. Default values (lowest)

### Key Variables
- `SQUISH_DATA_DIR` - Data directory location
- `DATABASE_URL` - PostgreSQL connection (enables team mode)
- `SQUISH_EMBEDDINGS_PROVIDER` - Embedding backend
- `SQUISH_OPENAI_API_KEY` - OpenAI embeddings
- `SQUISH_OLLAMA_URL` - Ollama embeddings

## Import Patterns (v0.6.0)

### From Adapter Files
```typescript
// From adapters/claude-code/plugin-wrapper.ts
import { searchMemories } from '../../core/memory/memories.js';
import { generateAndInjectFolderContext } from '../../core/search/folder-context.js';
```

### From Core Files
```typescript
// From core/context.ts
import { getRecentMemories } from './memory/memories.js';
import { getEntitiesForProject } from './search/entities.js';
```

### From Root Index
```typescript
// From index.ts
import { rememberMemory } from './core/memory/memories.js';
import { handleDetectDuplicates } from './algorithms/merge/handlers/detect-duplicates.js';
import { startWebServer } from './api/web/web.js';
```

## Storage Locations (v0.6.0)

### Project Root `.squish/` (Default)
- Scope: Project-local
- Persistence: Across sessions
- Sharing: Not shared with other projects
- Git: Gitignored (added to `.gitignore`)

### Custom Location (Via SQUISH_DATA_DIR)
- Scope: Configurable
- Persistence: Persistent
- Sharing: Shared if directory is shared
- Git: Must be manually gitignored if desired

### PostgreSQL (Team Mode)
- Scope: Shared across users
- Persistence: Persistent
- Sharing: Full team access
- Location: Remote database

## Best Practices

### Memory Management
- Keep core memory concise (under 2KB)
- Use `/remember` for facts that should be stored long-term
- Use `/observe` for transient tool usage
- Pin important memories with `/protect_memory`

### Performance
- Enable Redis caching for team mode
- Use embeddings provider matching your needs
- Batch memory operations when possible
- Monitor memory decay to maintain relevance

### Privacy
- Automatic secret detection via `core/secret-detector.ts`
- Private tags with `<private>` markup
- Manual privacy filtering via hooks
- PII detection for sensitive data

### Debugging
- Check logs in console output
- Inspect `.squish/squish.db` with SQLite tools
- Use `/health` tool to check system status
- Review hook execution with `--verbose` flag

## Version History

### v0.6.0 (Current)
- Reorganized folder structure by responsibility
- Database always creates `.squish/` in project root
- In-context vs out-of-context memory tracking
- Smart search in user prompt hook
- Improved tool descriptions for discoverability

### v0.5.0
- Consolidated MCP tools (18 → 11)
- Two-tier memory architecture
- Smart embeddings strategy

### Earlier Versions
- Single database per project
- Manual memory management
- Limited lifecycle features
