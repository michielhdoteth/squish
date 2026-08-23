/**
 * Memory system — barrel re-exports.
 *
 * This file re-exports the full public API from focused sub-modules so that
 * existing consumers (imports from './memories.js') continue to work unchanged.
 *
 * Sub-modules:
 *   memory-types.ts  — interfaces and type re-exports
 *   memory-crud.ts   — simple CRUD (get, getByIds, recent, confidence) + helpers
 *   memory-search.ts — search and similarity operations
 *   memory-write.ts  — complex write path (rememberMemory + place/geometry)
 */
export type { RememberInput, SearchInput, SearchResult, MemoryRecord, MemoryType, VisibilityScope } from './memory-types.js';
export { normalizeMemory, getOrCreateUser, getMemory, getMemoriesByIds, setConfidence, getRecent } from './memory-crud.js';
export { search, findSimilarMemories } from './memory-search.js';
export { rememberMemory } from './memory-write.js';
//# sourceMappingURL=memories.d.ts.map