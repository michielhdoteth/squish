/**
 * Shared utility functions for the squish codebase
 */
export declare function normalizeTimestamp(value: any): string | null;
export declare function isDatabaseUnavailableError(error: any): boolean;
export declare function withDatabaseErrorHandling<T>(operation: () => Promise<T>, errorMessage: string): Promise<T>;
export declare function clampLimit(value: number | undefined, defaultValue: number, min?: number, max?: number): number;
export declare function prepareEmbedding(embedding: number[] | null): {
    embedding?: number[] | null;
    embeddingJson?: string | null;
};
export declare function determineOverallStatus(dbStatus: string, redisOk: boolean): string;
//# sourceMappingURL=utils.d.ts.map