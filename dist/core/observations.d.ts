export type ObservationType = 'tool_use' | 'file_change' | 'error' | 'pattern' | 'insight';
export interface ObservationInput {
    type: ObservationType;
    action: string;
    target?: string;
    summary: string;
    details?: Record<string, unknown>;
    session?: string;
    project?: string;
}
export interface ObservationRecord {
    id: string;
    projectId?: string | null;
    conversationId?: string | null;
    type: ObservationType;
    action: string;
    target?: string | null;
    summary: string;
    details?: Record<string, unknown> | null;
    createdAt?: string | null;
}
export declare function createObservation(input: ObservationInput): Promise<ObservationRecord>;
export declare function getObservationsForProject(projectPath: string, limit: number): Promise<ObservationRecord[]>;
export declare function getRecentObservations(projectPath: string, limit?: number): Promise<ObservationRecord[]>;
export declare function getObservationById(observationId: string): Promise<ObservationRecord | null>;
//# sourceMappingURL=observations.d.ts.map