import type { MemoryType } from '../memory/memories.js';
import type { ExtractedBelief } from './types.js';
export declare function extractBeliefsFromMemory(input: {
    memoryId: string;
    content: string;
    type: MemoryType | string;
    metadata?: Record<string, unknown> | null;
}): ExtractedBelief[];
//# sourceMappingURL=extractor.d.ts.map