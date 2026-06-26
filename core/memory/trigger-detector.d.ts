export interface MemorySignals {
    explicitTriggers: string[];
    implicit: {
        decision: boolean;
        correction: boolean;
        preference: boolean;
        workflowRule: boolean;
        lesson: boolean;
        note: boolean;
        important: boolean;
        hack: boolean;
        why: boolean;
        todo: boolean;
        fixme: boolean;
    };
    suggestedType: 'observation' | 'fact' | 'decision' | 'context' | 'preference' | 'task';
    priority: 'normal' | 'high';
    confidence: 'certain' | 'speculative' | 'inferred';
}
export declare function detectMemorySignals(content: string): MemorySignals;
//# sourceMappingURL=trigger-detector.d.ts.map