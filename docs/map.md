# Squish Codebase Map (v1.6.0)

## 📁 **Project Structure Overview**

```
squish/
├── 📁 core/                          # Core business logic
├── 📁 db/                           # Database layer
├── 📁 docs/                         # Documentation
├── 📁 features/                     # Feature modules
│   ├── 📁 memory/                   # Memory management
│   ├── 📁 merge/                    # Memory deduplication
│   ├── 📁 plugin/                   # Claude Code integration
│   ├── 📁 search/                   # Search functionality
│   └── 📁 web/                      # Web dashboard
├── 📁 infra/                        # Infrastructure (Docker)
├── 📁 scripts/                      # Build/deployment scripts
├── 📁 tests/                        # Test files
├── 📄 index.ts                      # Main MCP server entry
├── 📄 plugin.json                   # Plugin configuration
├── 📄 package.json                  # Project configuration
└── 📄 tsconfig.json                 # TypeScript configuration
```

## 🏗️ **Architecture Layers**

### **1. Entry Point Layer**
```
📄 index.ts (644 lines)
├── MCP Server Setup (Model Context Protocol)
├── Tool Definitions (18+ tools)
├── Request Routing & Error Handling
└── Background Services (Web UI)
```

### **2. Plugin Integration Layer**
```
📁 features/plugin/
├── 📄 plugin-wrapper.ts     # Hook implementations
├── 📄 capture.ts           # Auto-capture logic
├── 📄 injection.ts         # Context injection
└── 📄 types.ts             # Type definitions
```

### **3. Feature Modules Layer**
```
📁 features/
├── 📁 memory/
│   ├── 📄 memories.ts              # CRUD operations
│   ├── 📄 memory-manager.ts        # Lifecycle management
│   ├── 📄 serialization.ts         # Data serialization
│   ├── 📄 bridge-discovery.ts      # Cross-context linking (v0.4.1)
│   ├── 📄 entity-extractor.ts      # Entity extraction (v0.4.1)
│   ├── 📄 hybrid-scorer.ts         # Hybrid relevance scoring (v0.4.1)
│   ├── 📄 temporal-parser.ts       # Temporal analysis (v0.4.1)
│   └── 📄 index.ts
├── 📁 search/
│   ├── 📄 conversations.ts     # Conversation search
│   ├── 📄 entities.ts          # Entity extraction
│   ├── 📄 folder-context.ts    # Project context
│   └── 📄 index.ts
├── 📁 merge/
│   ├── 📁 handlers/            # Merge operations
│   ├── 📁 detection/           # Duplicate detection
│   ├── 📁 strategies/          # Merge strategies
│   ├── 📁 analytics/           # Token estimation
│   └── 📁 safety/              # Safety checks
└── 📁 web/
    ├── 📄 web.ts              # Express server
    ├── 📄 web-server.ts       # Server bootstrap
    └── 📄 index.ts
```

### **4. Core Services Layer**
```
📁 core/
├── 📄 agent-memory.ts       # Agent-specific memory
├── 📄 associations.ts       # Memory relationships
├── 📄 cache.ts              # Redis/memory caching
├── 📄 consolidation.ts      # Memory consolidation
├── 📄 context.ts            # Project context
├── 📄 database.ts           # Database utilities
├── 📄 embeddings.ts         # Vector embeddings
├── 📄 governance.ts         # Memory protection/pinning
├── 📄 lifecycle.ts          # Memory lifecycle management
├── 📄 local-embeddings.ts   # TF-IDF embeddings
├── 📄 observations.ts       # Tool usage tracking
├── 📄 privacy.ts            # Data filtering
├── 📄 projects.ts           # Project management
├── 📄 redis.ts              # Redis client
├── 📄 requirements.ts       # Feature requirements
├── 📄 secret-detector.ts    # Security scanning
├── 📄 snapshots.ts          # Memory snapshots
├── 📄 summarization.ts      # Session summarization
├── 📄 temporal-facts.ts     # Time-based reasoning
├── 📄 utils.ts              # Utility functions
└── 📄 worker.ts             # Background processing
```

### **5. Database Layer**
```
📁 db/
├── 📄 index.ts              # Database client
├── 📄 bootstrap.ts          # Initialization
├── 📄 adapter.ts            # Query utilities
└── 📄 schema.ts             # Schema definitions

📁 drizzle/
├── 📄 schema.ts             # PostgreSQL schema
└── 📄 schema-sqlite.ts      # SQLite schema
```

## 🔄 **Data Flow Architecture**

### **Memory Creation Flow**
```
User Input
    ↓
Privacy Filter (core/privacy.ts)
    ↓
Embeddings Generation (core/embeddings.ts)
    ↓
Memory Storage (features/memory/memories.ts)
    ↓
Database (db/index.ts)
```

### **Context Injection Flow**
```
Session Start
    ↓
Project Context Retrieval (core/context.ts)
    ↓
Memory Search & Ranking (features/search/)
    ↓
Context Injection (features/plugin/injection.ts)
    ↓
CLAUDE.md Generation
```

### **Search Flow**
```
Query Input
    ↓
Query Processing (features/search/conversations.ts)
    ↓
Full-Text Search (SQLite FTS5)
    ↓
Semantic Search (Embeddings)
    ↓
Result Ranking & Filtering
    ↓
Response Formatting
```

## 🛠️ **MCP Tools (18 Total)**

### **Memory Management**
- `remember` - Store new memories
- `recall` - Query memories or retrieve a specific memory
- `forget` - Delete memory by ID or bulk delete
- `link` - Manage memory associations

### **Timeline & Retrieval (3 tools)**
- `timeline` - Progressive disclosure over retrieved memory
- `recent` - Get recent memories by period
- `stale` - Show stale memories

### **Observation Tracking (1 tool)**
- `on_tool_use` - Record tool usage patterns and work observations

### **Context & Project (1 tool)**
- `context` - Retrieve project context

### **Inspection & Governance (4 tools)**
- `inspect` - Explain why a memory was retained
- `pin` - Pin or unpin a memory
- `list_pinned` - List all pinned memories
- `stats` - Get memory statistics

### **Session Lifecycle (2 tools)**
- `on_session_start` - Trigger session start and context injection
- `on_session_end` - Trigger session end and cleanup

### **System (3 tools)**
- `health` - Service status checks
- `strategy` - Manage actionable strategies (read, write, list, search, supersede)
- `consolidate` - Run background consolidation (dedup, summarize, invalidate stale memories)

## 🔐 **Security & Privacy Components**

```
📄 core/privacy.ts          # Content filtering
📄 core/secret-detector.ts  # Secret detection
📄 features/plugin/capture.ts # Auto-privacy filtering
📄 core/governance.ts       # Memory protection
```

## 📊 **Web Dashboard Components**

```
📁 features/web/
├── 📄 web.ts               # Express server + HTML
├── 📄 web-server.ts        # Server bootstrap
└── 📄 index.ts             # Module exports
```

**API Endpoints:**
- `GET /` - Main dashboard
- `GET /api/health` - Health status
- `GET /api/memories` - Memory list
- `GET /api/observations` - Observations
- `GET /api/context` - Combined data

## 🔄 **Background Processing**

```
📄 core/worker.ts           # Async job processing
├── Memory lifecycle management
├── Session summarization
├── Cache maintenance
└── Background cleanup
```

## 📈 **Key Metrics & Monitoring**

- **Database Health**: Connection status, query performance
- **Cache Performance**: Hit rates, Redis connectivity
- **Memory Lifecycle**: Eviction rates, consolidation stats
- **Web UI**: Real-time dashboard updates
- **Search Performance**: Query latency, result quality

## 🚀 **Deployment & Infrastructure**

```
📁 infra/
├── 📄 docker-compose.yml    # Remote mode setup
└── 📄 init.sql             # Database initialization

📁 scripts/
├── 📄 package-release.sh   # Build automation
└── 📄 install-web.sh       # Web installer
```

## 🧪 **Testing Structure**

```
📁 tests/
└── 📄 merge/integration.test.ts  # Merge system tests
```

## 📋 **State Machine Diagrams**

### **1. Memory Lifecycle State Machine**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CREATED   │────▶│   ACTIVE    │────▶│ CONSOLIDATE │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     │
       │                   │                     │
       ▼                   ▼                     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PINNED    │     │   DECAYED   │     │   MERGED    │
│ (protected) │     │ (tiered)    │     │ (combined)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     │
       │                   │                     │
       ▼                   ▼                     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   EVICTED   │◀────│   EXPIRED   │◀────│   ARCHIVED  │
│ (deleted)   │     │ (stale)     │     │ (cold)      │
└─────────────┘     └─────────────┘     └─────────────┘
```

**States:**
- **CREATED**: Fresh memory entry
- **ACTIVE**: In active use, accessible
- **PINNED**: Protected from eviction
- **DECAYED**: Moved to slower storage tier
- **CONSOLIDATE**: Combined with similar memories
- **MERGED**: Absorbed into another memory
- **EXPIRED**: Past retention period
- **ARCHIVED**: Moved to cold storage
- **EVICTED**: Permanently deleted

### **2. Plugin Hook State Machine**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  INSTALLED  │────▶│ SESSION     │────▶│   CAPTURE   │
│             │     │  STARTED    │     │   ACTIVE    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     │
       │                   │                     │
       ▼                   ▼                     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DISABLED  │     │   CONTEXT   │────▶│   FILTER    │
│             │     │  INJECTED   │     │   APPLIED   │
└─────────────┘     └─────────────┘     └─────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────┐
                                               │  SESSION    │
                                               │   STOPPED   │
                                               └─────────────┘
```

**States:**
- **INSTALLED**: Plugin ready for use
- **SESSION STARTED**: Claude session initiated
- **CONTEXT INJECTED**: Relevant memories added to prompt
- **CAPTURE ACTIVE**: Monitoring tool usage
- **FILTER APPLIED**: Privacy filtering active
- **SESSION STOPPED**: Session ended, cleanup initiated
- **DISABLED**: Plugin temporarily off

### **3. Merge Process State Machine**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DETECTED  │────▶│   ANALYZED  │────▶│   PROPOSED  │
│ (duplicates)│     │ (similarity)│     │  (pending)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────┐
                                               │  PREVIEWED  │
                                               │             │
                                               └─────────────┘
                                                       │
                                                     ┌─┴─┐
                                                     │   │
                                               ┌─────▼───▼─────┐
                                               │                │
                                               ▼                ▼
                                       ┌─────────────┐     ┌─────────────┐
                                       │  APPROVED   │     │  REJECTED   │
                                       │             │     │             │
                                       └─────────────┘     └─────────────┘
                                               │                │
                                               ▼                ▼
                                       ┌─────────────┐     ┌─────────────┐
                                       │   MERGED    │     │   EXPIRED   │
                                       │             │     │             │
                                       └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                       ┌─────────────┐
                                       │   REVERSED  │
                                       │             │
                                       └─────────────┘
```

**States:**
- **DETECTED**: Potential duplicates found
- **ANALYZED**: Similarity scoring completed
- **PROPOSED**: Merge proposal created
- **PREVIEWED**: User reviewed merge result
- **APPROVED**: User accepted merge
- **REJECTED**: User declined merge
- **MERGED**: Memories combined, history recorded
- **REVERSED**: Merge undone, originals restored
- **EXPIRED**: Proposal timed out without decision

### **4. Search Query State Machine**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   RECEIVED  │────▶│  PARSED     │────▶│  NORMALIZED │
│   (query)   │     │ (tokens)    │     │  (cleaned)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────┐
                                               │   ROUTED    │
                                               │             │
                                               └─────────────┘
                                                     ┌─┴─┐
                                                     │   │
                                               ┌─────▼───▼─────┐
                                               │                │
                                               ▼                ▼
                                       ┌─────────────┐     ┌─────────────┐
                                       │ FULL-TEXT   │     │  SEMANTIC   │
                                       │  SEARCH     │     │   SEARCH    │
                                       └─────────────┘     └─────────────┘
                                               │                │
                                               ▼                ▼
                                       ┌─────────────┐     ┌─────────────┐
                                       │   RANKED    │     │   RANKED    │
                                       │             │     │             │
                                       └─────────────┘     └─────────────┘
                                               │                │
                                               ▼                ▼
                                       ┌─────────────────────────────┐
                                       │        COMBINED              │
                                       │        RESULTS               │
                                       └─────────────────────────────┘
                                               │
                                               ▼
                                       ┌─────────────┐
                                       │  FILTERED   │
                                       │             │
                                       └─────────────┘
                                               │
                                               ▼
                                       ┌─────────────┐
                                       │  FORMATTED  │
                                       │             │
                                       └─────────────┘
```

**States:**
- **RECEIVED**: Raw query input
- **PARSED**: Tokenized and structured
- **NORMALIZED**: Cleaned and standardized
- **ROUTED**: Split between search types
- **FULL-TEXT SEARCH**: FTS5/SQL queries
- **SEMANTIC SEARCH**: Vector similarity search
- **RANKED**: Results scored by relevance
- **COMBINED**: Multiple result sets merged
- **FILTERED**: Privacy/access filtering applied
- **FORMATTED**: Response formatted for output

---

*This codemap provides a comprehensive view of the Squish v1.6.0 codebase architecture, showing how all 50+ files work together to create a sophisticated memory management system for Claude Code.*

## 🆕 **v1.6.0 Enhancements (New Features)**

### **Advanced Memory Features**
- **Bridge Discovery** (`features/memory/bridge-discovery.ts`): Cross-context relationship detection
- **Entity Extractor** (`features/memory/entity-extractor.ts`): Named entity recognition and extraction
- **Hybrid Scorer** (`features/memory/hybrid-scorer.ts`): Multi-algorithm relevance scoring (30-100x faster)
- **Temporal Parser** (`features/memory/temporal-parser.ts`): Time-based memory analysis

### **Performance Improvements**
- 30-100x faster coactivation tracking with LRU cache
- Composite database indexes for 10-100x query speedup
- Batch tier updates for 100-300x faster lifecycle maintenance
- Parallel embedding generation

### **Security & Stability**
- Enhanced privacy filtering for secrets
- Production-ready v0.4.1 hardening
- Improved merge feature with two-stage duplicate detection
