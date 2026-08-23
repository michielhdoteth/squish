/**
 * Memory CRUD operations.
 *
 * Core read/write primitives: get, getByIds, recent, confidence updates.
 * Also exports internal helpers (normalizeMemory, getOrCreateUser) consumed
 * by the write and search sub-modules.
 */
import type { MemoryRecord } from './memory-types.js';
export declare function normalizeMemory(row: any): MemoryRecord;
export declare function getOrCreateUser(identifier: string, existingDb?: any, existingSchema?: any): Promise<{
    id: string;
} | null>;
export declare function getMemory(id: string, incrementAccess?: boolean): Promise<MemoryRecord | null>;
/**
 * Batch-fetch memories by IDs (fixes N+1 query in walking.ts)
 * Returns memories in the same order as the input IDs, skipping any that are not found.
 */
export declare function getMemoriesByIds(ids: string[], incrementAccess?: boolean): Promise<MemoryRecord[]>;
export declare function setConfidence(id: string, level: 'certain' | 'speculative' | 'outdated'): Promise<boolean>;
export declare function getRecent(projectPath: string, limit: number): Promise<MemoryRecord[]>;
//# sourceMappingURL=memory-crud.d.ts.map