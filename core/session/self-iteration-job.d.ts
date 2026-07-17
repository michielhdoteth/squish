/** Self-Iteration Job - Auto-extract key facts from ended conversations
 *
 * Processes conversations to extract memories and generate summaries
 */
import { type JobHandler } from '../scheduler/cron-scheduler.js';
import type { MemoryType } from '../lib/types.js';
export interface SelfIterationConfig {
    enabled: boolean;
    extractFacts: boolean;
    generateSummaries: boolean;
    consolidateMemories: boolean;
    minMessageCount: number;
    maxMessagesToProcess: number;
}
declare const DEFAULT_CONFIG: SelfIterationConfig;
export interface MessageRow {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    createdAt: Date;
}
interface ExtractedFact {
    content: string;
    type: ExtractableMemoryType;
    confidence: number;
}
type ExtractableMemoryType = Extract<MemoryType, 'fact' | 'decision' | 'preference'>;
export declare function extractDurableSelfIterationFacts(messages: MessageRow[]): ExtractedFact[];
/**
 * Register self-iteration job handler
 */
declare const selfIterationHandler: JobHandler;
export { selfIterationHandler, DEFAULT_CONFIG };
//# sourceMappingURL=self-iteration-job.d.ts.map