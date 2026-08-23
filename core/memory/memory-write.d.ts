/**
 * Memory write operations.
 *
 * Handles the complex rememberMemory flow: embedding, importance scoring,
 * belief extraction, graph sync, contradiction resolution, place assignment,
 * and post-capture geometry checks.
 */
import type { RememberInput, MemoryRecord } from './memory-types.js';
export declare function rememberMemory(input: RememberInput): Promise<MemoryRecord>;
//# sourceMappingURL=memory-write.d.ts.map