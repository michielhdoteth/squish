/**
 * Knowledge CRUD — Table creation, insert, read, update, delete, and search.
 *
 * Single responsibility: managing the `knowledge` table lifecycle and records.
 * Edge operations live in knowledge-edges.ts; belief adapters in knowledge-beliefs.ts.
 */
import type { Knowledge, KnowledgeKind, KnowledgeType, KnowledgeStatus, CreateKnowledgeInput } from './types.js';
/**
 * Ensure the knowledge and knowledge_edges tables exist.
 * Called lazily on first operation.
 */
export declare function ensureKnowledgeTables(): Promise<void>;
/**
 * Insert a new knowledge record.
 */
export declare function createKnowledge(input: CreateKnowledgeInput): Promise<Knowledge>;
/**
 * Get a knowledge record by ID.
 */
export declare function getKnowledgeById(id: string): Promise<Knowledge | null>;
/**
 * Update a knowledge record.
 */
export declare function updateKnowledge(id: string, updates: Partial<CreateKnowledgeInput>): Promise<Knowledge | null>;
/**
 * Delete a knowledge record by ID.
 */
export declare function deleteKnowledge(id: string): Promise<boolean>;
/**
 * Search knowledge by kind, status, and/or content.
 * Supports both vector and text search.
 */
export declare function searchKnowledge(options: {
    projectId?: string;
    kinds?: KnowledgeKind[];
    types?: KnowledgeType[];
    status?: KnowledgeStatus;
    minConfidence?: number;
    contentQuery?: string;
    limit?: number;
    offset?: number;
}): Promise<Knowledge[]>;
/**
 * Get all active knowledge for a project, grouped by kind.
 */
export declare function listKnowledgeByKind(projectId: string, kind: KnowledgeKind, options?: {
    status?: KnowledgeStatus;
    types?: KnowledgeType[];
    limit?: number;
}): Promise<Knowledge[]>;
//# sourceMappingURL=knowledge-crud.d.ts.map