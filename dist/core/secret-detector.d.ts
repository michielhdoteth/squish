/**
 * Secret Detector
 * Pattern-based detection of API keys, tokens, and credentials
 */
export interface SecretMatch {
    type: string;
    pattern: string;
    value: string;
    start: number;
    end: number;
    confidence: 'high' | 'medium' | 'low';
}
type Confidence = SecretMatch['confidence'];
interface PatternConfig {
    pattern: RegExp;
    type: string;
    confidence: Confidence;
}
export declare function detectSecrets(text: string, minConfidence?: Confidence): SecretMatch[];
export declare function likelyContainsSecrets(text: string): boolean;
export declare function getSecretSummary(text: string): {
    count: number;
    types: string[];
};
export declare function redactSecrets(text: string, replacement?: string): string;
export declare const SECRET_PATTERNS: {
    high: PatternConfig[];
    medium: PatternConfig[];
    low: PatternConfig[];
};
export {};
//# sourceMappingURL=secret-detector.d.ts.map