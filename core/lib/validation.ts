/**
 * Input validation utilities for Squish
 * Consolidates scattered validation patterns into a unified module
 */

import { clampLimit as originalClampLimit } from './utils.js';
import { normalizeTags } from './memory/serialization.js';

/**
 * Validate and normalize a limit value with bounds checking
 *
 * @param value - The limit value to validate (number, string, or undefined)
 * @param defaultValue - Default value if input is undefined/null/empty (default: 20)
 * @param min - Minimum allowed value (default: 1)
 * @param max - Maximum allowed value (default: 100)
 * @returns Validated number within bounds, or NaN if input is invalid non-numeric string
 */
export function validateLimit(
  value: number | string | undefined,
  defaultValue: number = 20,
  min: number = 1,
  max: number = 100
): number {
  // Handle undefined, null, empty string
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  // Convert string to number, truncate decimals
  let num: number;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      return NaN;
    }
    num = parsed;
  } else {
    // Truncate decimals for numbers
    num = Math.trunc(value);
  }

  // Handle NaN
  if (isNaN(num)) {
    return NaN;
  }

  // Clamp to bounds
  return Math.min(Math.max(num, min), max);
}

/**
 * Parse an integer with bounds checking
 * Similar to validateLimit but explicitly for integer parsing
 *
 * @param value - The value to parse (number, string, or undefined)
 * @param defaultValue - Default value if input is undefined/null/empty
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Parsed and bounded integer, or NaN if input is invalid non-numeric string
 */
export function parseIntBounded(
  value: number | string | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  return validateLimit(value, defaultValue, min, max);
}

/**
 * Validate a project path
 *
 * @param path - The project path to validate
 * @param options - Validation options
 * @param options.createIfMissing - Create the project if it doesn't exist (default: false)
 * @param options.require - Throw error if project doesn't exist (default: false)
 * @returns The validated project path (absolute path)
 * @throws Error if project doesn't exist and require=true
 */
export async function validateProjectPath(
  path: string | undefined,
  options?: { createIfMissing?: boolean; require?: boolean }
): Promise<string> {
  const { createIfMissing = false, require: requireProject = false } = options || {};

  // If path is undefined, throw if required or return current directory
  if (path === undefined || path === '') {
    if (requireProject) {
      throw new Error('Project path is required');
    }
    return process.cwd();
  }

  // Resolve to absolute path
  const absolutePath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)
    ? path
    : path.startsWith('~')
    ? path.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
    : path.startsWith('.')
    ? path
    : path;

  // Check if project exists in database
  const { getProjectByPath } = await import('./projects.js');
  const existingProject = await getProjectByPath(absolutePath);

  if (existingProject) {
    return absolutePath;
  }

  // Project doesn't exist
  if (requireProject) {
    throw new Error(`Project not found: ${absolutePath}`);
  }

  if (createIfMissing) {
    const { ensureProject } = await import('./projects.js');
    await ensureProject(absolutePath);
    return absolutePath;
  }

  // Return the path even if it doesn't exist in database (for non-db validation)
  return absolutePath;
}

/**
 * Validate a UUID
 *
 * @param id - The UUID to validate
 * @returns true if valid UUID, false otherwise
 */
export function validateUuid(id: string): boolean {
  if (typeof id !== 'string' || !id) {
    return false;
  }

  // UUID v4/v5 regex pattern (8-4-4-4-12 hex digits)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Require a valid UUID, throws if invalid
 *
 * @param id - The UUID to validate
 * @returns The UUID if valid
 * @throws Error if UUID is invalid
 */
export function requireUuid(id: string): string {
  if (!validateUuid(id)) {
    throw new Error('Invalid UUID');
  }
  return id;
}

/**
 * Validate a date value
 *
 * @param value - The date to validate (string, Date, number, or undefined)
 * @returns Date object if valid, null otherwise
 */
export function validateDate(value: string | Date | number | undefined): Date | null {
  if (!value) {
    return null;
  }

  try {
    let date: Date;

    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number') {
      // Handle both milliseconds and seconds timestamps
      if (value > 100000000000000) {
        // Microseconds, convert to milliseconds
        date = new Date(value / 1000);
      } else if (value > 1000000000000) {
        // Milliseconds
        date = new Date(value);
      } else if (value >= 0) {
        // Seconds
        date = new Date(value * 1000);
      } else {
        return null;
      }
    } else if (typeof value === 'string') {
      date = new Date(value);
    } else {
      return null;
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  } catch {
    return null;
  }
}

// Re-export normalizeTags for tag validation
export { normalizeTags };

// Re-export clampLimit for backward compatibility
export { clampLimit } from './utils.js';
