/**
 * Entity Operations
 *
 * CRUD and lookup for graph entities via the storage layer.
 */
import type { EntityRecord, EntityRelation } from './types.js';
/**
 * Find entities by name across the graph.
 */
export declare function getEntities(name: string, projectId: string, options?: {
    limit?: number;
    fuzzy?: boolean;
}): Promise<EntityRecord[]>;
/**
 * Get a single entity by name with its relations and mention count.
 */
export declare function getEntity(entityName: string, projectId: string): Promise<{
    entity: EntityRecord | null;
    relations: EntityRelation[];
    mentionCount: number;
}>;
/**
 * Get all relations for an entity by name.
 */
export declare function getEntityRelationsByName(entityName: string, projectId: string): Promise<EntityRelation[]>;
/**
 * Get all entities for a project.
 */
export declare function getProjectEntityList(projectId: string, limit?: number): Promise<EntityRecord[]>;
//# sourceMappingURL=entity-ops.d.ts.map