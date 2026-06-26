export type SchemaProbeStatus = 'ok' | 'drifted' | 'unavailable';
export interface SchemaProbeResult {
    status: SchemaProbeStatus;
    backend: string;
    dataDir?: string;
    dbPath?: string;
    detail: string;
    remediation: string | null;
    missingTables: string[];
    missingColumns: Array<{
        table: string;
        column: string;
    }>;
}
export interface CheckResult {
    name: string;
    status: 'ok' | 'degraded' | 'broken';
    message: string;
}
export interface RepairAction {
    type: 'create_table' | 'create_index' | 'add_column' | 'repair_fts' | 'init_places' | 'create_entities_table' | 'run_migration' | 'rebuild_schema';
    detail: string;
    target?: string;
}
export interface FixOptions {
    fixMissingTables?: boolean;
    fixMissingIndexes?: boolean;
    fixFts?: boolean;
    fixPlaces?: boolean;
    fixGraphEntities?: boolean;
    fixAll?: boolean;
    verbose?: boolean;
}
export declare class SchemaDriftError extends Error {
    readonly probe: SchemaProbeResult;
    constructor(probe: SchemaProbeResult);
}
export declare function getSchemaRemediationCommand(): string;
export declare function formatSchemaProbeMessage(probe: SchemaProbeResult): string;
export declare function isSchemaDriftError(error: unknown): error is SchemaDriftError;
export declare function probeSchemaHealth(): Promise<SchemaProbeResult>;
export declare function assertSchemaReady(): Promise<void>;
/**
 * Check if the entity_relations table exists
 */
export declare function checkGraphEntitiesTable(): Promise<CheckResult>;
/**
 * Check if the 7 default places have been initialized
 */
export declare function checkPlacesInitialization(): Promise<CheckResult>;
/**
 * Check if consolidation state (geometry tables) are ready
 */
export declare function checkConsolidationState(result?: CheckResult): Promise<CheckResult>;
/**
 * Check if memory_versions table exists (if versioning is used)
 */
export declare function checkMemoryVersionsTable(): Promise<CheckResult>;
/**
 * Auto-repair detected schema issues.
 * Returns list of repair actions taken.
 */
export declare function fixSchemaIssues(options?: FixOptions): Promise<RepairAction[]>;
//# sourceMappingURL=schema-health.d.ts.map