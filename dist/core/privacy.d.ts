/**
 * Privacy System
 * Handles private tag filtering, secret detection, and path-based exclusions
 */
type PrivacyMode = 'strict' | 'moderate' | 'off';
export declare function hasPrivateTags(content: string): boolean;
export declare function stripPrivateTags(content: string): string;
export declare function shouldStore(content: string, filePath?: string, privacyMode?: PrivacyMode): Promise<boolean>;
export declare function applyPrivacyFilters<T extends {
    content?: string;
    details?: Record<string, unknown>;
}>(items: T[]): Promise<T[]>;
export declare function sanitizeForStorage(content: string, privacyMode: PrivacyMode): string;
export interface PrivacyReport {
    isPrivate: boolean;
    hasSecrets: boolean;
    secretCount: number;
    secretTypes: string[];
    shouldStore: boolean;
}
export declare function analyzePrivacy(content: string, filePath?: string): Promise<PrivacyReport>;
export {};
//# sourceMappingURL=privacy.d.ts.map