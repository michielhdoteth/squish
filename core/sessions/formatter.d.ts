/**
 * Pretty printers for chunks and session groups.
 *
 * No chalk / picocolors dep - plain text with indent. Caller is
 * expected to pipe to stdout / log.
 */
import type { Chunk, ChunkResult, SessionGroup } from './types.js';
export declare function formatChunkCard(chunk: Chunk, opts?: {
    score?: number;
    why?: string;
}): string;
export declare function formatChunkResults(results: ChunkResult[]): string;
export declare function formatSessionDetail(session: SessionGroup): string;
export declare function formatSessionList(sessions: SessionGroup[]): string;
//# sourceMappingURL=formatter.d.ts.map