/**
 * Multimodal Ingest Pipeline
 *
 * Orchestrates: detect MIME → extract content → generate embedding → store as memory
 *
 * Design principles:
 * - LLM is ALWAYS optional - extraction works without it (just no descriptions)
 * - Every extractor returns empty textContent on failure, never placeholder text
 * - Pipeline is idempotent - re-ingesting the same file updates, not duplicates
 */
import type { IngestResult } from './types.js';
export interface IngestInput {
    filePath: string;
    projectId?: string;
    /** Optional override for MIME type (auto-detected if omitted) */
    mimeTypeOverride?: string;
    /** Optional tags to attach to the resulting memory */
    tags?: string[];
    /** Optional source label */
    source?: string;
}
/**
 * Ingest a single media file into the memory system.
 *
 * Flow:
 * 1. Detect MIME type and media category
 * 2. Find matching extractor
 * 3. Extract content (text, description, embedding)
 * 4. Store as memory with media metadata
 * 5. Return ingest result
 */
export declare function ingestMediaFile(input: IngestInput): Promise<IngestResult>;
/**
 * Batch ingest multiple files.
 */
export declare function ingestMediaFiles(inputs: IngestInput[]): Promise<IngestResult[]>;
//# sourceMappingURL=ingest-pipeline.d.ts.map