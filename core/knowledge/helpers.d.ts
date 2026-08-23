/**
 * Shared helpers for knowledge modules.
 *
 * Serialization, deserialization, and DB-row → typed-object mappers.
 * These are consumed by knowledge-crud, knowledge-edges, and knowledge-beliefs.
 */
import type { Knowledge, KnowledgeEdge } from './types.js';
export declare function serializeJson(obj: Record<string, unknown> | null | undefined): string | null;
export declare function deserializeJson<T>(str: string | null | undefined): T | null;
export declare function toKnowledge(row: any): Knowledge;
export declare function toKnowledgeEdge(row: any): KnowledgeEdge;
//# sourceMappingURL=helpers.d.ts.map