/**
 * Input validation utilities for Squish
 * Consolidates scattered validation patterns into a unified module
 */
import { normalizeTags } from '../memory/serialization.js';
/**
 * Validate and normalize a limit value with bounds checking
 */
export declare function validateLimit(value: number | string | undefined, defaultValue?: number, min?: number, max?: number): number;
/**
 * Parse an integer with bounds checking
 */
export declare function parseIntBounded(value: number | string | undefined, defaultValue: number, min: number, max: number): number;
/**
 * Validate a project path
 */
export declare function validateProjectPath(path: string | undefined, options?: {
    createIfMissing?: boolean;
    require?: boolean;
}): Promise<string>;
/**
 * Validate a UUID
 */
export declare function validateUuid(id: string): boolean;
/**
 * Require a valid UUID, throws if invalid
 */
export declare function requireUuid(id: string): string;
/**
 * Validate a date value
 *
 * @param value - The date to validate (string, Date, number, or undefined)
 * @returns Date object if valid, null otherwise
 */
export declare function validateDate(value: string | Date | number | undefined): Date | null;
export { normalizeTags };
export { clampLimit } from './utils.js';
//# sourceMappingURL=validation.d.ts.map