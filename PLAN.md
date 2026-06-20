---
name: Squish v1.7 - Strategy Layer + Memory Relationships + Team Memory
version: 1.7.0
status: in-progress
created: 2026-06-08
---

# Squish v1.7 Implementation Plan

## Vision

Transform Squish from a passive memory store into an **active learning system** with three new capabilities:

1. **Strategy Layer** (Active) - Agents read/write actionable knowledge that evolves
2. **Memory Relationship Types** (Structural) - Richer graph edges: updates, extends, derives
3. **Team Memory** (Social) - Shared workspaces with role-based access

## Beliefs vs Strategies Duality

- **Beliefs = PASSIVE layer**: Auto-extracted deductions from memories. Agents don't write to beliefs directly. Existing system.
- **Strategies = ACTIVE layer**: Actionable knowledge agents read before tasks, write to after tasks. Connected to beliefs via edges.
- Both coexist. A belief ("we prefer TypeScript") can inform a strategy ("Always use TypeScript for new files").

---

## Phase 1: Database Schema

### Task 1.1: Strategies Table (SQLite + PostgreSQL)

Add `strategies` table to `db/bootstrap.ts`:

```sql
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  agent_id TEXT,
  strategy_type TEXT NOT NULL,  -- 'procedure' | 'heuristic' | 'pattern' | 'constraint' | 'workaround'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  context TEXT,                  -- When to apply this strategy
  steps TEXT,                    -- JSON array of steps
  success_criteria TEXT,         -- How to know it worked
  failure_indicators TEXT,       -- How to know it failed
  confidence REAL DEFAULT 0.5,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  status TEXT DEFAULT 'active',  -- 'active' | 'superseded' | 'deprecated' | 'experimental'
  superseded_by TEXT,
  tags TEXT,
  metadata TEXT,
  visibility_scope TEXT DEFAULT 'private',
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
```

Add `strategy_edges` table:
```sql
CREATE TABLE IF NOT EXISTS strategy_edges (
  id TEXT PRIMARY KEY,
  from_strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
  to_strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,  -- 'supersedes' | 'extends' | 'conflicts' | 'depends_on' | 'related_to'
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(from_strategy_id, to_strategy_id, edge_type)
);
```

Add `strategy_belief_edges` table:
```sql
CREATE TABLE IF NOT EXISTS strategy_belief_edges (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
  belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,  -- 'informed_by' | 'contradicts' | 'supports'
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(strategy_id, belief_id, edge_type)
);
```

### Task 1.2: Team Members Table

Add `team_members` table:
```sql
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  agent_id TEXT,
  role TEXT DEFAULT 'member',  -- 'owner' | 'admin' | 'member' | 'viewer'
  joined_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  last_active_at INTEGER,
  metadata TEXT,
  UNIQUE(project_id, user_id)
);
```

### Files to modify:
- `db/bootstrap.ts` - Add SQL statements for both SQLite and PostgreSQL
- `db/schema/` - Create `strategies.ts` migration schema

---

## Phase 2: Strategy Layer Core

### Task 2.1: Strategy Types

Create `core/strategies/types.ts`:
- `StrategyType = 'procedure' | 'heuristic' | 'pattern' | 'constraint' | 'workaround'`
- `StrategyStatus = 'active' | 'superseded' | 'deprecated' | 'experimental'`
- `StrategyEdgeType = 'supersedes' | 'extends' | 'conflicts' | 'depends_on' | 'related_to'`
- `StrategyBeliefEdgeType = 'informed_by' | 'contradicts' | 'supports'`
- `Strategy` interface
- `ExtractedStrategy` interface

### Task 2.2: Strategy Store

Create `core/strategies/store.ts`:
- `createStrategy()` - Insert new strategy
- `getStrategy()` - Get by ID
- `listStrategies()` - List with filters (project, type, status, tags)
- `updateStrategy()` - Update fields
- `supersedeStrategy()` - Mark old as superseded, link to new
- `recordUsage()` - Increment usage, track success/failure
- `deleteStrategy()` - Soft delete (status = 'deprecated')
- `searchStrategies()` - Full-text search on title + description + context
- `getStrategiesByConfidence()` - Get high/low confidence strategies

### Task 2.3: Strategy Extractor

Create `core/strategies/extractor.ts`:
- `extractStrategiesFromTrace(conversation)` - Analyze conversation for actionable patterns
- `extractStrategiesFromLearning(learning)` - Convert learnings to strategies
- `extractStrategiesFromBelief(belief)` - Convert beliefs to strategies when actionable
- Pattern detection: "always do X", "never do Y", "when Z, do W"

### Task 2.4: Strategy Deduplicator

Create `core/strategies/deduplicator.ts`:
- `findSimilarStrategies(strategy)` - Embedding + text similarity
- `mergeStrategies()` - Combine similar strategies
- `deduplicateStrategies(projectId)` - Batch dedup

### Task 2.5: Strategy Decay

Create `core/strategies/decay.ts`:
- Confidence decay based on usage recency
- Auto-deprecate strategies with 0 usage after N days
- Boost confidence on successful usage

---

## Phase 3: Memory Relationship Types

### Task 3.1: Extend Association Types

Update `core/associations.ts`:
- Add `'updates'` | `'extends'` | `'derives'` to `AssociationType`
- These map to Supermemory-style relationships:
  - `updates`: New memory supersedes old (like `supersedes` but explicit)
  - `extends`: New memory enriches existing (adds detail)
  - `derives`: New memory inferred from existing

### Task 3.2: Update Contradiction Resolver

Update `core/memory/contradiction-resolver.ts`:
- Use `updates` instead of `supersedes` when memory explicitly replaces another
- Keep `supersedes` for temporal contradictions

### Task 3.3: Update Fact Deriver

Update `core/memory/fact-deriver.ts`:
- Use `derives` for transitivity-derived facts
- Use `extends` for enriched facts

---

## Phase 4: Team Memory

### Task 4.1: Team Workspace

Create `core/team/workspace.ts`:
- `createTeam(projectId, userId)` - Initialize team
- `addMember(projectId, userId, role)` - Add member
- `removeMember(projectId, userId)` - Remove member
- `getMembers(projectId)` - List members
- `updateRole(projectId, userId, role)` - Change role

### Task 4.2: ACL

Create `core/team/acl.ts`:
- `canRead(memory, user)` - Check read access
- `canWrite(memory, user)` - Check write access
- `getTeamMemories(projectId)` - Get all team-visible memories
- Scope filtering: private < project < team < global

### Task 4.3: Scope Filtering

Update existing tools to respect team scope:
- `squish_recall` - Filter by visibility_scope
- `squish_context` - Include team memories when in team mode
- `squish_remember` - Set scope based on team membership

---

## Phase 5: MCP Tools

### Strategy Tools (6 new)

1. **squish_strategy_read** - Read strategies before starting a task
   - Input: `{ projectId?, tags?, type?, limit? }`
   - Returns: Ranked strategies by confidence + recency

2. **squish_strategy_write** - Write a strategy after completing a task
   - Input: `{ title, description, type, context?, steps?, successCriteria?, tags? }`
   - Returns: Created strategy with ID

3. **squish_strategy_list** - List all strategies
   - Input: `{ projectId?, type?, status?, tags?, limit? }`
   - Returns: Paginated strategy list

4. **squish_strategy_search** - Search strategies by content
   - Input: `{ query, projectId?, limit? }`
   - Returns: Matching strategies with relevance scores

5. **squish_strategy_supersede** - Mark strategy as superseded by newer one
   - Input: `{ oldStrategyId, newStrategyId?, reason? }`
   - Returns: Updated strategies with edges

6. **squish_strategy_stats** - Strategy usage statistics
   - Input: `{ projectId? }`
   - Returns: Counts by type/status, avg confidence, usage metrics

### Team Tools (5 new)

7. **squish_team_create** - Create team workspace
   - Input: `{ name?, description? }`
   - Returns: Team info

8. **squish_team_join** - Join a team
   - Input: `{ projectId?, role? }`
   - Returns: Membership confirmation

9. **squish_team_leave** - Leave a team
   - Input: `{ projectId? }`
   - Returns: Confirmation

10. **squish_team_list** - List team members
    - Input: `{ projectId? }`
    - Returns: Member list with roles

11. **squish_team_memory** - Store memory with team scope
    - Input: `{ content, type?, tags? }`
    - Returns: Memory with team visibility

---

## Phase 6: Integration

### Task 6.1: Wire Strategy Extraction

Update `core/session/self-iteration-job.ts`:
- After extracting facts/decisions/preferences, also extract strategies
- Use `extractStrategiesFromTrace()` on conversation content
- Auto-create strategies from successful patterns

### Task 6.2: Beliefs-Strategies Edges

- When a strategy is created from a belief, create `informed_by` edge
- When a strategy contradicts a belief, create `contradicts` edge
- Query both beliefs and strategies for context assembly

### Task 6.3: Testing

- Unit tests for strategy store, extractor, deduplicator
- Integration tests for MCP tools
- Team memory access control tests

---

## Success Metrics

- [ ] Strategies table created with indexes
- [ ] 6 strategy MCP tools working
- [ ] 5 team MCP tools working
- [ ] Memory relationships extended with updates/extends/derives
- [ ] Strategy extraction wired into self-iteration
- [ ] Beliefs-strategies edges functional
- [ ] All existing tests pass
- [ ] No version bump until explicitly requested
