export interface CurrentProjectSummary {
    id: string;
    name: string;
    path: string;
    resolution: 'explicit' | 'inferred' | 'auto-created' | 'legacy-placeholder';
}
export interface ContextReportInput {
    currentProject: CurrentProjectSummary;
    otherProjects: CurrentProjectSummary[];
    runtime: {
        sessionSummary: string;
        activePlaces: string[];
        signalSummary: {
            captured: number;
            suppressed: number;
            sessionOnly: number;
            durable: number;
            durableWithRaw: number;
        };
        graphSummary: string;
    };
    durableMemories: Array<{
        id: string;
        type: string;
        content: string;
        place?: string | null;
    }>;
    beliefs?: Array<{
        type: string;
        statement: string;
        status: string;
    }>;
    nextStep: string | null;
}
export interface HealthReportInput {
    severity: 'ok' | 'degraded' | 'broken';
    currentProject: string;
    checks: Array<{
        name: string;
        status: 'ok' | 'degraded' | 'broken';
        detail: string;
    }>;
    diagnostics?: Array<{
        name: string;
        status: 'ok' | 'degraded' | 'broken';
        detail: string;
        fix?: string;
    }>;
    nextStep: string | null;
}
export interface StatsReportInput {
    currentProject: string;
    totals: {
        memories: number;
        durable: number;
        sessionLocal: number;
    };
    signal: {
        captured: number;
        suppressed: number;
        sessionOnly: number;
        durable: number;
        durableWithRaw: number;
        tokensSaved: number;
        placeRouted: number;
        graphEnriched: number;
    };
    places: {
        active: number;
        named: string[];
    };
    graph: {
        status: string;
        enrichments: number;
    };
    wakeUp: string;
    signalNote?: string | null;
}
export interface InspectReportInput {
    id: string;
    classification: string;
    storageReason: string;
    durability: 'session-only' | 'durable';
    place?: string | null;
    placeType?: string | null;
    graphStatus?: string | null;
    rawFallback?: string | null;
    wakeUpPriority?: string | null;
    metadataAvailability?: string | null;
    beliefs?: Array<{
        id: string;
        type: string;
        statement: string;
        status: string;
        confidence: number;
    }>;
}
export declare function formatContextReport(input: ContextReportInput): string;
export declare function formatHealthReport(input: HealthReportInput): string;
export declare function formatStatsReport(input: StatsReportInput): string;
export declare function formatInspectReport(input: InspectReportInput): string;
//# sourceMappingURL=trust-report.d.ts.map