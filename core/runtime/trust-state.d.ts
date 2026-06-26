import type { TeamAccessContext } from '../team/types.js';
import type { ContextReportInput, CurrentProjectSummary, HealthReportInput, InspectReportInput, StatsReportInput } from './trust-report.js';
export interface TrustProjectScope {
    currentProject: CurrentProjectSummary;
    otherProjects: CurrentProjectSummary[];
    nextStep: string | null;
}
export declare function resolveProjectScope(projectPath?: string): Promise<TrustProjectScope>;
export declare function buildContextState(projectPath?: string, limit?: number, actor?: TeamAccessContext): Promise<ContextReportInput>;
export declare function buildStatsState(projectPath?: string, actor?: TeamAccessContext): Promise<StatsReportInput>;
export declare function buildHealthState(projectPath?: string): Promise<HealthReportInput>;
export declare function buildInspectState(id: string): Promise<InspectReportInput | null>;
//# sourceMappingURL=trust-state.d.ts.map