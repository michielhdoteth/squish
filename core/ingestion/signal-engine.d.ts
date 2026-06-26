export type SignalClassification = 'discard' | 'session-only' | 'durable-distilled' | 'durable-raw+distilled';
export interface SignalEventInput {
    toolName: string;
    toolInput?: Record<string, unknown>;
    toolResult?: unknown;
    sessionId?: string | null;
}
export interface SignalDecision {
    classification: SignalClassification;
    reasons: string[];
    storeRaw: boolean;
    importance: 'low' | 'medium' | 'high';
    wakeUpPriority: 'low' | 'medium' | 'high';
    placeHint: {
        placeType: 'inbox' | 'ref' | 'wip' | 'sandbox' | 'board' | 'sparks' | 'archive' | null;
        confidence: number;
    };
    graphHint: {
        shouldEnrich: boolean;
        entityTerms: string[];
        reason?: string;
    };
    content: string;
    contentHash: string;
    estimatedSavings: number;
}
export interface DistillInput {
    toolName: string;
    command?: string;
    content: string;
    classification: SignalClassification;
}
/**
 * Async version of inferPlaceHint with LLM fallback.
 * First applies regex-based classification, then falls back to LLM if:
 * - No regex match was found (placeType is null)
 * - LLM classification is enabled via config
 */
export declare function inferPlaceHintWithLLM(toolName: string, normalized: string, originalContent?: string): Promise<SignalDecision['placeHint']>;
export declare function hashSignalContent(content: string): string;
export declare function classifySignalEvent(input: SignalEventInput): SignalDecision;
export declare function distillSignalEvent(input: DistillInput): string;
export declare function shouldReturnRawFallback(input: {
    query: string;
    hasRawFallback: boolean;
    nuanceSuppressed: boolean;
}): boolean;
//# sourceMappingURL=signal-engine.d.ts.map