# Squish v0.2.0 Architecture & Implementation Plan

**Goal**: Ship the "parity killers" that dethrone Claude-Mem. Priority order: adoption → stickiness → competitive features.

---

## 1. Epic A: Claude Code Plugin Wrapper + Marketplace Install ⭐ (BIGGEST UNLOCK)

### Problem
Currently, installing Squish requires manual edits to `~/.claude/settings.json`. Claude-Mem wins on frictionless adoption with `/plugin marketplace add ... → /plugin install ...`

### Solution
Create a **Claude Code plugin wrapper** that:
- Packages Squish as a Claude Code plugin (not an npm package)
- Provides smart auto-install with one command: `/plugin install squish`
- Auto-creates config files, ensures runtime deps, starts services
- Registers with Claude Code's plugin system

### Architecture

```
Claude Code Plugin System
├── plugin.json (metadata + install hooks)
├── dist/plugin-wrapper.js (entrypoint + hook handlers)
└── squish/ (bundled MCP server)
    ├── dist/index.js
    ├── db/
    ├── services/
    └── package.json
```

### Implementation Files to Create

**1. `plugin.json` (plugin manifest)**
```json
{
  "id": "squish-memory",
  "name": "Squish Memory",
  "version": "0.2.0",
  "description": "Production-ready local-first persistent memory for Claude Code",
  "author": "michielhdoteth",
  "license": "MIT",
  "homepage": "https://github.com/michielhdoteth/squish-memory",
  "repository": {
    "type": "git",
    "url": "https://github.com/michielhdoteth/squish-memory.git"
  },
  "hooks": {
    "onInstall": "plugin-wrapper.js:onInstall",
    "onSessionStart": "plugin-wrapper.js:onSessionStart",
    "onUserPromptSubmit": "plugin-wrapper.js:onUserPromptSubmit",
    "onPostToolUse": "plugin-wrapper.js:onPostToolUse",
    "onSessionStop": "plugin-wrapper.js:onSessionStop"
  },
  "mcp": {
    "command": "node",
    "args": ["./dist/src/index.js"]
  },
  "permissions": {
    "readFiles": ["*.ts", "*.js", "*.json"],
    "writeFiles": [".claude*", "CLAUDE.md"],
    "environment": ["SQUISH_*"]
  }
}
```

**2. `src/plugin/plugin-wrapper.ts` (hook handlers)**
- `onInstall()`: Create ~/.squish/, verify deps, run migrations
- `onSessionStart()`: Initialize session tracking, inject previous context
- `onUserPromptSubmit()`: Capture user prompt context
- `onPostToolUse()`: Store tool execution observations
- `onSessionStop()`: Trigger compression, generate CLAUDE.md

**3. `src/plugin/installer.ts`** (smart install)
- Verify Node.js version
- Create directory structure
- Initialize SQLite database
- Generate .clauderc for plugin system
- Auto-start if needed

### Benefits
- ✅ One-click install via Claude Code marketplace
- ✅ Auto-configured on first use
- ✅ Seamless hook integration for auto-capture
- ✅ Positioned as "better than Claude-Mem" from day 1

### Dependencies
- None new (uses existing code)
- Note: Need to ensure bundling works for MCP server

---

## 2. Epic B: Hook-Based Auto-Capture + Injection

### Problem
Currently, Squish requires manual `observe` and `remember` calls. Claude-Mem's magic is **automatic operation** with hooks.

### Solution
Implement hook handlers that automatically:
- Capture tool executions
- Store observations
- Generate summaries
- Inject relevant context

### New Files

**`src/hooks/capture.ts`** - Auto-capture logic
```typescript
export async function onUserPromptSubmit(context: PluginContext) {
  // 1. Capture user prompt
  // 2. Auto-tag with project path
  // 3. Extract relevant context from working directory
  // 4. Queue for embeddings
}

export async function onPostToolUse(context: PluginContext) {
  // 1. Extract tool name, args, result
  // 2. Create observation
  // 3. Update project context
  // 4. Mark for summarization
}
```

**`src/hooks/injection.ts`** - Auto-context injection
```typescript
export async function onSessionStart(context: PluginContext) {
  // 1. Detect project path
  // 2. Query relevant memories
  // 3. Apply privacy filters
  // 4. Respect injection budget
  // 5. Inject into system context
}
```

**`src/services/worker.ts`** - Background compression
```typescript
// Async worker that:
// - Finds new observations
// - Calls Claude via MCP to summarize
// - Stores summaries
// - Never blocks tool returns
// - Runs in background via Bull queue
```

### Benefits
- ✅ Zero manual setup
- ✅ Auto-learns from sessions
- ✅ Async (never blocks)
- ✅ Token-efficient (summaries in worker)

---

## 3. Epic C: Folder CLAUDE.md Generation

### Problem
Claude-Mem generates per-folder context files. This is a **tangible artifact** that makes the product visible and sticky.

### Solution
Auto-generate `CLAUDE.md` per folder with:
- Recent activity (last 10 conversations)
- Key observations (ranked by relevance)
- Project metadata (path, git remote, branch)
- Timestamps for cache invalidation
- Wrapped in `<squish-context>` tags to preserve user content

### New Files

**`src/services/folder-context.ts`**
```typescript
export async function generateFolderContext(projectPath: string) {
  // 1. Query recent conversations for this project
  // 2. Extract key observations
  // 3. Get git metadata (if available)
  // 4. Build markdown with <squish-context> tags
  // 5. Write to ./CLAUDE.md
  // 6. Preserve any existing user content outside tags
}

export async function injectFolderContext(projectPath: string) {
  // Called from onSessionStart hook
  // Reads CLAUDE.md and injects into context
}
```

### Schema Changes
Add to observations table:
```typescript
relevanceScore: number  // 0-1, computed on summarization
folderPath: string      // For scoped queries
```

### File Format
```markdown
# Squish Context - [Project Name]

<squish-context>
**Project**: /path/to/project
**Git**: origin/main @ commit abc123
**Last Updated**: 2025-01-13T14:30:00Z

## Recent Activity (Last 3 Days)
- [2025-01-13] Fixed authentication bug in src/auth.ts
- [2025-01-12] Added user profile endpoint
- [2025-01-11] Refactored database layer

## Key Observations
- Bug fix required in payment flow (high priority)
- Database queries need optimization
- API response times > 500ms under load

## Previous Context
[Last 5 summarized conversations]
</squish-context>

<!-- User can add custom notes here -->
```

### Benefits
- ✅ Visible in repo (stickiness)
- ✅ Cached per project
- ✅ Auto-updated on each session
- ✅ User-editable

---

## 4. Epic D: Privacy Tags + Secret Detection

### Problem
Users need to exclude sensitive data (credentials, PII, secrets). Squish needs to earn trust.

### Solution
Implement privacy system with:
- `<private>` and `<secret>` tags for user content
- Path-based allow/deny lists
- Automatic secret pattern detection
- Opt-in enforcement

### New Files

**`src/services/privacy.ts`**
```typescript
export async function shouldStore(content: string, path?: string): Promise<boolean> {
  // 1. Check for <private> tags
  // 2. Check against path deny-list
  // 3. Detect secrets (API keys, tokens, credentials)
  // 4. Return false if any match
}

export function stripPrivateTags(content: string): string {
  // Remove <private>...</private> before storing
}

export async function applyPrivacyFilters(memories: Memory[]): Promise<Memory[]> {
  // Filter results based on privacy rules
}
```

**`src/services/secret-detector.ts`**
```typescript
const SECRET_PATTERNS = {
  apiKey: /api[_-]?key|apikey|api-key/i,
  awsKey: /aws_secret_access_key|AKIA[0-9A-Z]{16}/,
  token: /token|bearer|jwt/i,
  credential: /password|passwd|pwd|secret/i,
  // ... more patterns
};

export function detectSecrets(text: string): SecretMatch[] {
  // Find and report suspected secrets
  // Never store them
}
```

### Configuration
```json
{
  "privacy": {
    "autoDetectSecrets": true,
    "respectPrivateTags": true,
    "pathDenyList": [".env", "*.key", "secrets.json"],
    "pathAllowList": []
  }
}
```

### Schema Changes
Add to memories + observations:
```typescript
isPrivate: boolean       // Tagged with <private>
hasSecrets: boolean      // Detected secrets
privacyLevel: 'public' | 'internal' | 'private'
```

### Benefits
- ✅ Builds user trust
- ✅ Prevents data leaks
- ✅ Compliant-ready
- ✅ Matches Claude-Mem feature

---

## 5. Epic E: Context Injection Controls

### Problem
Users might get "memory spam" if too much context is injected. Need fine-grained control.

### Solution
Implement injection budget system:
- Max items per session
- Max tokens (estimated)
- Relevance-first ranking
- Per-project vs global controls
- Decay by age (older memories less relevant)

### New Files

**`src/services/injection.ts`**
```typescript
export interface InjectionBudget {
  maxItems: number          // e.g., 10 memories
  maxTokens: number         // e.g., 2000 tokens
  relevanceThreshold: number // 0-1, only inject > threshold
  maxAge: number            // ms, don't inject older than this
}

export async function selectContextToInject(
  query: string,
  budget: InjectionBudget,
  projectPath: string
): Promise<SelectedContext> {
  // 1. Search relevant memories
  // 2. Rank by relevance score
  // 3. Apply age decay
  // 4. Sum tokens until budget exhausted
  // 5. Return ranked selection
}

export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 chars
  return Math.ceil(text.length / 4);
}
```

### Configuration
```json
{
  "injection": {
    "enabled": true,
    "budgets": {
      "global": {
        "maxItems": 15,
        "maxTokens": 3000,
        "relevanceThreshold": 0.5
      },
      "perProject": {
        "maxItems": 10,
        "maxTokens": 2000,
        "relevanceThreshold": 0.6
      }
    },
    "ageDecay": {
      "enabled": true,
      "halfLife": 2592000000  // 30 days
    }
  }
}
```

### Benefits
- ✅ Prevents context bloat
- ✅ User control
- ✅ Token-aware
- ✅ Relevance-first (quality over quantity)

---

## 6. Epic F: Local Vector Search (sqlite-vec)

### Problem
FTS5 is good for text, but semantic search requires embeddings. PostgreSQL+pgvector is overkill for local mode.

### Solution
Add **sqlite-vec** for local embeddings in SQLite:
- Hybrid retrieval: FTS5 + vector search
- No external deps for local mode
- Optional, graceful degradation
- Same interface as pgvector in team mode

### Implementation

**`src/db/migrations/add-vectors.sql`**
```sql
-- Enable sqlite-vec extension
-- Add vector columns to memories/observations
ALTER TABLE memories ADD COLUMN embedding BLOB; -- vector<1536>
```

**`src/services/embeddings.ts`** (extend existing)
```typescript
// When storing memories:
if (config.vectorSearchEnabled && !config.isTeamMode) {
  // Use local sqlite-vec for embeddings
  const embedding = await embedLocalModel(content);
  // Store as BLOB in SQLite
}
```

### Benefits
- ✅ Local mode gets semantic search
- ✅ No external dependencies
- ✅ Hybrid FTS5 + vector search
- ✅ Still fast (sqlite-vec is optimized)

---

## 7. Epic G: Async Summarization Worker

### Problem
Summarization could block tool returns or slow down sessions. Need async background processing.

### Solution
Worker pipeline using Bull queue:
1. Observations added to queue
2. Worker processes asynchronously
3. Calls Claude via MCP for summarization
4. Stores summaries
5. Updates relevance scores
6. Never blocks

### New Files

**`src/services/worker.ts`**
```typescript
import Queue from 'bull';

export const summaryQueue = new Queue('summaries', {
  // Bull config (Redis or memory-based)
});

summaryQueue.process(async (job) => {
  const { observationId } = job.data;

  // 1. Get observation
  // 2. Call Claude via MCP callback
  // 3. Store summary
  // 4. Calculate relevance score
  // 5. Update timestamps
});

export async function queueForSummarization(observationId: string) {
  await summaryQueue.add({ observationId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true
  });
}
```

**`src/hooks/worker-integration.ts`**
```typescript
// In onPostToolUse hook:
export async function onPostToolUse(context: PluginContext) {
  // ... create observation ...

  // Queue for background summarization (don't wait)
  await queueForSummarization(observation.id);
}
```

### Benefits
- ✅ Never blocks
- ✅ Async compression
- ✅ Distributed ready (Bull supports Redis)
- ✅ Reliable (retries on failure)

---

## 8. Schema Updates Summary

### New Tables
- None (extend existing)

### Modified Tables

**memories**
```typescript
- Add: relevanceScore: number (0-1)
- Add: isPrivate: boolean
- Add: hasSecrets: boolean
- Add: folderPath: string
- Add: embedding: Buffer (optional, local mode)
```

**observations**
```typescript
- Add: relevanceScore: number (0-1)
- Add: isPrivate: boolean
- Add: hasSecrets: boolean
- Add: summary: string (nullable)
- Add: embedding: Buffer (optional)
```

**users** (new, for multi-user support)
```typescript
- id: string (uuid)
- name: string
- createdAt: timestamp
```

---

## 9. Implementation Order

### Phase 1: Foundations (Weeks 1-2)
1. ✅ Create plugin.json manifest
2. ✅ Build plugin-wrapper.ts with hook handlers
3. ✅ Update package.json for plugin packaging
4. ✅ Schema migrations for privacy + relevance

### Phase 2: Auto-Capture (Weeks 2-3)
5. ✅ Implement hook handlers (capture.ts)
6. ✅ Auto-observation creation
7. ✅ Privacy filtering
8. ✅ Test with manual observations

### Phase 3: Context Generation (Week 3)
9. ✅ Folder context generation
10. ✅ CLAUDE.md template + injection
11. ✅ Update hook handlers

### Phase 4: Advanced (Week 4)
12. ✅ Worker pipeline
13. ✅ Summarization via MCP
14. ✅ sqlite-vec integration
15. ✅ Injection controls

### Phase 5: Polish
16. ✅ README updates (MIT vs AGPL)
17. ✅ Benchmarks for v0.2.0
18. ✅ Documentation
19. ✅ Release v0.2.0

---

## 10. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plugin Distribution | Claude Code marketplace | Frictionless adoption |
| Hook System | Native plugin hooks | No external dependencies |
| Background Processing | Bull queue | Reliable + Redis-ready |
| Summarization | Claude via MCP callback | Leverage existing MCP |
| Vector Search | sqlite-vec (local) | No external deps |
| Secret Detection | Pattern-based + ML-ready | Privacy-first |
| Context Budget | Token-estimated | Avoid context bloat |
| Folder Context | Markdown in CLAUDE.md | Visible + editable |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Claude Code plugin API changes | Plugin breaks | Monitor changelog, use stable APIs |
| Summarization token costs | Budget explosion | Implement queue limits + rate limiting |
| Secret detection false positives | User friction | Whitelist common patterns, user override |
| Performance of sqlite-vec | Slow searches | Profile + optimize query indices |
| Hook handler latency | Blocks sessions | Defer to background queue, never wait |

---

## 12. Competitive Positioning

### Before v0.2.0
- Squish: Manual setup, manually-triggered tools
- Claude-Mem: Auto-install, auto-capture, auto-inject ← **wins**

### After v0.2.0
- Squish: **Auto-install, auto-capture, auto-inject, local embeddings, privacy-first, MIT license** ← **wins**
- Claude-Mem: Auto-install, auto-capture, auto-inject, requires external APIs, AGPL, no team mode

### Squish v0.2.0 Marketing
> **Squish: The MIT alternative to Claude-Mem that doesn't phone home**
> - One-command install via Claude Code marketplace
> - Auto-captures tool usage + generates memories
> - Zero external dependencies (local embeddings)
> - Privacy-first with secret detection
> - Team-ready with PostgreSQL sync
> - MIT licensed (safe for commercial use)

---

## 13. Testing Strategy

### Unit Tests
- Privacy filters
- Secret detector
- Token estimation
- Relevance scoring

### Integration Tests
- Hook handlers with mock context
- SQLite migrations
- Worker queue processing
- Folder context generation

### E2E Tests
- Full session simulation (start → prompt → tool → stop)
- Memory injection + accuracy
- Privacy filter enforcement
- CLAUDE.md generation

---

## Files to Create/Modify

### Create
- `plugin.json`
- `src/plugin/plugin-wrapper.ts`
- `src/plugin/installer.ts`
- `src/hooks/capture.ts`
- `src/hooks/injection.ts`
- `src/hooks/worker-integration.ts`
- `src/services/folder-context.ts`
- `src/services/privacy.ts`
- `src/services/secret-detector.ts`
- `src/services/injection.ts`
- `src/services/worker.ts`

### Modify
- `package.json` (add plugin metadata)
- `src/index.ts` (register plugin hooks)
- `src/db/schema.ts` (add fields)
- `src/config.ts` (add plugin config)
- `README.md` (update positioning)

### Migrations
- `drizzle/*/add_privacy_fields.sql`
- `drizzle/*/add_relevance_score.sql`
- `drizzle/*/add_folder_path.sql`

---

**Status**: Ready for Phase 1 implementation.
