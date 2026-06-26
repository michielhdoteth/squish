/**
 * LLM Entity Extractor
 *
 * Extracts named entities and relationships from memory content using
 * LLM-powered analysis. Falls back to regex extraction when LLM is unavailable.
 */
import { type ExtractedEntity } from '../memory/entity-extractor.js';
export type RelationType = 'works_on' | 'depends_on' | 'manages' | 'uses' | 'caused' | 'located_in' | 'belongs_to' | 'reports_to' | 'occurred_on' | 'affects' | 'contains' | 'implements' | 'extends' | 'related_to' | 'part_of' | 'owns' | 'created' | 'resolved' | 'blocks';
export interface ExtractedRelation {
    fromEntity: string;
    toEntity: string;
    relationType: RelationType;
    confidence: number;
    context: string;
}
export interface LLMExtractionResult {
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
    source: 'llm' | 'regex' | 'none';
}
/**
 * Extract entities and relationships from text using LLM.
 * Falls back to regex extraction when LLM is unavailable.
 */
export declare function extractEntitiesAndRelations(content: string, options?: {
    preferLLM?: boolean;
    maxContentLength?: number;
}): Promise<LLMExtractionResult>;
/**
 * Extract entities and relations from multiple memories in batch.
 * More efficient than calling extractEntitiesAndRelations for each memory.
 */
export declare function batchExtractEntitiesAndRelations(contents: string[], options?: {
    preferLLM?: boolean;
    maxContentLength?: number;
    batchSize?: number;
}): Promise<LLMExtractionResult[]>;
/**
 * Get the extraction prompt for testing/debugging purposes.
 */
export declare function getExtractionPrompt(): string;
/**
 * Parse an LLM response for testing/debugging purposes.
 */
export declare function testParseLLMResponse(response: string): {
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
} | null;
//# sourceMappingURL=llm-entity-extractor.d.ts.map