# TODO - Squish Memory Enhancement Plan

## Phase 1: Core Memory Improvements (Completed)

### ✅ Bi-temporal Episodic Memory
- Added `recordedAt` field to distinguish when facts were valid vs. when learned
- Updated PostgreSQL schema (`drizzle/schema.ts`)
- Updated SQLite schema (`drizzle/schema-sqlite.ts`)
- Enhanced `MemoryRecord` interface in `core/memory/memories.ts`
- Updated `normalizeMemory()` to extract temporal fields
- Updated SQL queries in `searchMemoriesPostgres()` to fetch temporal fields
- Enhanced hybrid scorer to use bi-temporal logic for recency scoring

### ✅ Multi-stage Deduplication
- Implemented Stage 0 exact matching using MD5 content hashing
- Combined with existing Stage 1 (fuzzy/SimHash) and Stage 2 (semantic/embeddings)
- Updated `DetectionResult` interface to include `stage0Time`
- Updated `MemoryPair` interface to include `'exact'` detection method
- Fixed `crypto` import with `import * as crypto from 'crypto'`
- Enhanced `two-stage-detector.ts` to handle all three stages

### ✅ Progressive Disclosure System
- Created `lightweightMemoryIndices` table for memory previews
- Created `contextPagingSessions` table for tracking loaded/preloaded memories
- Implemented `progressive-disclosure.ts` with:
  - Lightweight index creation and management
  - Content preview generation (first 150 chars)
  - Key term extraction for quick matching
  - Token budget allocation system
  - Preload candidate selection based on importance and recency
  - Memory loading/unloading functions

### ✅ Enhanced Categorization & Tagging
- Created `categorizer.ts` with:
  - Automatic memory type classification (observation/fact/decision/context/preference)
  - Hierarchical tagging system (lang:, fw:, db:, tool:, etc.)
  - Concept extraction from content
  - File scope detection
  - Tag scoring and suggestion algorithms
  - Embedding-based tag similarity from related memories
  - Tag variant generation (snake_case, kebab_case, etc.)

### ✅ Enhanced Contradiction Resolution with Temporal Awareness
- Added `TEMPORAL_SENSITIVITY_PATTERNS` for detecting time-sensitive content
- Enhanced `UPDATE_PATTERNS` with temporal awareness
- Implemented `calculateTemporalRelationship()` function
- Implemented `checkTemporalPeriodConflict()` function
- Modified all 6 contradiction scenarios to factor temporal awareness
- Added new Scenario 6 for temporal inconsistency detection
- Removed duplicate function implementations
- Adjusted confidence scores based on temporal relationships

## Phase 2: Advanced Memory Features (Pending)
- Memory consolidation and knowledge distillation
- Cross-agent memory sharing with privacy controls
- Advanced retrieval with query expansion and reranking
- Memory editing workflow with conflict resolution
- Persistent working memory and scratchpad functionality

## Phase 3: Production Hardening (Pending)
- Performance optimization and benchmarking
- Comprehensive error handling and recovery
- Security audit and vulnerability assessment
- Documentation and user guides