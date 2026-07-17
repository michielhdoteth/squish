/**
 * Shared utility functions for the squish codebase
 */
export declare function normalizeTimestamp(value: any): string | null;
export declare function now(): string;
export declare function isDatabaseUnavailableError(error: any): boolean;
export declare function withDatabaseErrorHandling<T>(operation: () => Promise<T>, errorMessage: string): Promise<T>;
export declare function clampLimit(value: number | undefined, defaultValue: number, min?: number, max?: number): number;
export declare function prepareEmbedding(embedding: number[] | null): {
    embeddingJson?: string | null;
};
export declare function determineOverallStatus(dbStatus: string, redisOk: boolean): string;
export declare function parseDate(input: string): Date | null;
export declare function filterByDateRange<T extends {
    createdAt?: string | null;
}>(items: T[], since?: string, until?: string): T[];
export type VisibilityScope = 'private' | 'project';
export declare function normalizeVisibilityScopes(visibilityScope?: VisibilityScope | VisibilityScope[] | null): string[] | null;
//# sourceMappingURL=utils.d.ts.map