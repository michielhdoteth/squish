export interface WorkingSetCommand {
    command: string;
    outcome?: string;
    at: string;
}
export interface SessionWorkingSet {
    activeFiles: string[];
    activePlaces: string[];
    graphEntities: string[];
    recentCommands: WorkingSetCommand[];
    currentHypotheses: string[];
    recentFailures: string[];
    recentAttempts: string[];
    projectPath?: string;
    sessionId: string;
    /** 'memory-write' marks the remember-write pseudo-session (M-2). */
    kind?: string;
    signalStats: {
        captured: number;
        suppressed: number;
        sessionOnly: number;
        durable: number;
        durableWithRaw: number;
        tokensSaved: number;
        placeRouted: number;
        graphEnriched: number;
    };
    recentEvents: Array<{
        classification: string;
        content: string;
        target?: string;
        hash?: string;
        at: string;
    }>;
}
export declare function getSessionWorkingSet(sessionId: string, projectPath?: string): Promise<SessionWorkingSet>;
export declare function recordSessionSignal(input: {
    sessionId: string;
    projectPath: string;
    classification: 'discard' | 'session-only' | 'durable-distilled' | 'durable-raw+distilled';
    distilledContent: string;
    toolName: string;
    target?: string;
    metadata?: Record<string, unknown>;
}): Promise<SessionWorkingSet>;
export declare function compactSessionWorkingSet(sessionId: string, projectPath?: string): Promise<{
    summary: string;
    workingSet: SessionWorkingSet;
}>;
export declare function getProjectSignalStats(projectPath: string): Promise<any>;
export declare function getLatestProjectWorkingSetSummary(projectPath: string): Promise<string>;
export interface ParsedSessionChunkSignal {
    type?: string;
    content?: string;
    files?: string[];
}
export declare function deriveSignalsFromChunks(chunks: ParsedSessionChunkSignal[]): {
    activeFiles: string[];
    commands: string[];
    hypotheses: string[];
};
export declare function recordParsedSessionSignals(input: {
    sessionId: string;
    projectPath?: string;
    chunks: ParsedSessionChunkSignal[];
}): Promise<boolean>;
//# sourceMappingURL=working-set.d.ts.map