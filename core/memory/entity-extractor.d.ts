/**
 * Entity Extractor
 * Extracts named entities from memory content
 * Supports people, files, functions, dates, locations, concepts, tools, and patterns
 */
export type EntityType = 'person' | 'file' | 'function' | 'class' | 'concept' | 'tool' | 'date' | 'location' | 'pattern' | 'technique' | 'other';
export interface ExtractedEntity {
    name: string;
    type: EntityType;
    confidence: number;
    startIndex: number;
    endIndex: number;
    context: string;
    normalized?: string;
}
/**
 * Extract unique entity names for auto-linking
 */
export declare function extractEntityNames(content: string): string[];
/**
 * Extract entities from content
 */
export declare function extractEntities(content: string): Promise<ExtractedEntity[]>;
/**
 * Link extracted entities to memory records
 * Creates entity records in the knowledge graph
 */
export declare function linkEntitiesToMemories(memoryId: string, entities: ExtractedEntity[]): Promise<void>;
/**
 * Get entities extracted from a memory based on properties
 */
export declare function getMemoryEntities(memoryId: string): Promise<ExtractedEntity[]>;
/**
 * Get all entities for a project
 */
export declare function getProjectEntities(projectId: string, type?: EntityType): Promise<any[]>;
//# sourceMappingURL=entity-extractor.d.ts.map