/**
 * Memory Migration Module
 * Migrate memories between .squish directories/databases
 */
export interface MigrateOptions {
    dryRun?: boolean;
    deleteSource?: boolean;
}
export interface MigrateResult {
    memoriesCopied: number;
    observationsCopied: number;
    associationsCopied: number;
    projectsMapped: number;
    sourceDeleted?: boolean;
    message: string;
}
/**
 * Migrate memories from one .squish directory to another
 */
export declare function migrateMemories(sourceDir: string, targetDir: string, options?: MigrateOptions): Promise<MigrateResult>;
//# sourceMappingURL=migrate.d.ts.map