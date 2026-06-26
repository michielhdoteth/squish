/**
 * Relationship Extractor
 *
 * Populates entity_relations table with typed relationships extracted
 * from memory content.
 */
import { type RelationType } from './llm-entity-extractor.js';
export interface StoredRelation {
    id: string;
    fromEntityId: string;
    toEntityId: string;
    fromEntityName: string;
    toEntityName: string;
    relationType: RelationType;
    weight: number;
    properties: Record<string, unknown> | null;
}
/**
 * Extract entities and relations from memory content and store them in the database.
 * Returns the stored entities and relations.
 */
export declare function extractAndStoreRelations(memoryId: string, content: string, projectId: string, options?: {
    preferLLM?: boolean;
    maxContentLength?: number;
}): Promise<{
    entities: number;
    relations: number;
    source: 'llm' | 'regex' | 'fallback';
}>;
/**
 * Get all relations for a set of entity IDs.
 * Used by graph traversal to find connected entities.
 */
export declare function getEntityRelations(entityIds: string[], relationTypes?: RelationType[]): Promise<StoredRelation[]>;
/**
 * Get all entities for a project.
 */
export declare function getProjectEntities(projectId: string, limit?: number): Promise<Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
}>>;
/**
 * Delete all entities and relations for a project (for graph rebuild).
 */
export declare function clearProjectGraph(projectId: string): Promise<void>;
//# sourceMappingURL=relationship-extractor.d.ts.map