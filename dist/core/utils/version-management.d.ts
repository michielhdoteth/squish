/**
 * Shared Version Management Utilities
 * Common patterns for versioning and updating records
 */
/**
 * Create a new version of a fact by expiring the old one
 */
export declare function createNewFactVersion(oldFactId: string, newContent: string, additionalFields?: Record<string, any>, reason?: string): Promise<string>;
//# sourceMappingURL=version-management.d.ts.map