import type { StoredBelief } from '../beliefs/types.js';
export interface MemoryInspection {
    id: string;
    type: string;
    classification: string;
    reasons: string[];
    rawFallbackSnapshotId?: string | null;
    nuanceSuppressed: boolean;
    place?: string | null;
    placeType?: string | null;
    graphStatus?: string | null;
    content: string;
    legacyMetadata: boolean;
    memoryPolicy?: Record<string, unknown> | null;
    beliefs?: StoredBelief[];
}
export declare function summarizeInspection(input: MemoryInspection): string;
export declare function explainMemory(id: string): Promise<MemoryInspection | null>;
//# sourceMappingURL=explain.d.ts.map