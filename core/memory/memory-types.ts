/**
 * Memory type definitions.
 *
 * Interfaces and re-exports for the memory system. Extracted from
 * memories.ts to keep type definitions in a single, dependency-free module.
 */

import type { MemoryRecord, MemoryType } from '../lib/types.js';
export type { MemoryRecord, MemoryType };

import type { VisibilityScope } from '../lib/utils.js';
export type { VisibilityScope };

export interface RememberInput {
  content: string;
  type?: MemoryType;
  tags?: string[];
  project?: string;
  user?: string;            // Optional user identifier (name or email)
  metadata?: Record<string, unknown>;
  source?: string;
  // Rich context fields (Agent 4 feedback)
  reasoning?: string;    // Why it's true/important
  memoryContext?: string; // What triggered this memory
  examples?: string;      // When to apply this knowledge
  exceptions?: string;    // When NOT to apply
  // Hot/Cold tier (replaces isHighRes)
  // Namespace for grouping
  namespaceId?: string;   // Assign to namespace
  // Session metadata for temporal queries (Task 1)
  sessionId?: string;        // Session identifier for linking memories
  sessionStartTime?: string; // When this session started
  toolName?: string;     // Tool that generated this memory
  // Place routing (Method of Loci / MemPalace wings)
  placeType?: string;    // Place type to route memory (inbox, ref, wip, etc.)
}

export interface SearchInput {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  project?: string;
  user?: string;           // Optional user filter (name or email)
  // Place and session filters for unified search (Task 2, Task 3)
  placeId?: string;        // Filter by place
  placeType?: string;     // Filter by place type (inbox, wip, archive, etc.)
  sessionId?: string;     // Filter by session
  sessionStartTime?: string; // Session start for temporal queries
  /** Enable retrieval trace for debugging (Phase 8) */
  trace?: boolean;
  /** ACL context for read-path visibility gating (P5) - omit for no ACL checks */
  acl?: import('../acl/read-gate.js').AclContext;
}

// SearchResult extends the shared MemoryRecord from normalization.ts
export interface SearchResult extends MemoryRecord {
  similarity: number;
  /** Retrieval trace for debugging (Phase 8) - populated when trace: true */
  _trace?: import('../retrieval/config.js').RetrievalTrace;
}
