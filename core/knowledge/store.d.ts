/**
 * Unified Knowledge Store — Re-export barrel.
 *
 * This module was split into focused sub-modules:
 *   - helpers.ts          — serialization & row mappers (internal)
 *   - knowledge-crud.ts   — table creation, CRUD, search
 *   - knowledge-edges.ts  — edge CRUD & graph traversal
 *   - knowledge-beliefs.ts — belief adapter functions
 *
 * All public symbols are re-exported here so existing imports from
 * '../knowledge/store.js' continue to work without changes.
 */
export { ensureKnowledgeTables, createKnowledge, getKnowledgeById, updateKnowledge, deleteKnowledge, searchKnowledge, listKnowledgeByKind, } from './knowledge-crud.js';
export { createKnowledgeEdge, getEdgesFrom, getEdgesTo, getEdgesForNode, deleteKnowledgeEdge, deleteEdgesForNode, getConnectedEntities, getConnectedPlaces, } from './knowledge-edges.js';
export { upsertBeliefsForMemory, getBeliefsForMemory, getActiveConstraints, getActiveDecisions, getRecentFailures, searchBeliefs, getAllBeliefs, getRelevantBeliefs, } from './knowledge-beliefs.js';
//# sourceMappingURL=store.d.ts.map