/**
 * Shared Zod schemas for input validation across Squish
 * Provides consistent validation for common input types
 */

import { z } from 'zod';

/**
 * Limit schema: integer between 1 and 100, default 20
 */
export const limitSchema = z.number().int().min(1).max(100).default(20);

/**
 * Offset schema: integer >= 0, default 0
 */
export const offsetSchema = z.number().int().min(0).default(0);

/**
 * Project ID/path schema: non-empty string
 */
export const projectIdSchema = z.string().min(1);

/**
 * Memory ID schema: valid UUID
 */
export const memoryIdSchema = z.string().uuid();

/**
 * Pagination schema combining limit and offset
 */
export const paginationSchema = z.object({
  limit: limitSchema,
  offset: offsetSchema,
});

/**
 * Search query schema: non-empty string
 */
export const searchQuerySchema = z.string().min(1).trim();

/**
 * Memory type schema
 */
export const memoryTypeSchema = z.enum(['observation', 'fact', 'decision', 'context', 'preference', 'note']);

/**
 * Association type schema
 */
export const associationTypeSchema = z.enum(['relates_to', 'supports', 'contradicts', 'supersedes', 'duplicate']);

/**
 * Weight schema: number between 0 and 1
 */
export const weightSchema = z.number().min(0).max(1);

/**
 * Learning type schema
 */
export const learningTypeSchema = z.enum(['success', 'failure', 'fix', 'observation']);

/**
 * Observation type schema
 */
export const observationTypeSchema = z.enum(['tool_use', 'file_change', 'error', 'pattern', 'insight']);

/**
 * Confidence level schema
 */
export const confidenceLevelSchema = z.enum(['certain', 'speculative', 'outdated']);

/**
 * Search input schema (common for search operations)
 */
export const searchInputSchema = z.object({
  query: searchQuerySchema,
  limit: limitSchema.optional(),
  offset: offsetSchema.optional(),
  project: projectIdSchema.optional(),
  type: memoryTypeSchema.optional(),
});

/**
 * Memory recall schema
 */
export const recallInputSchema = z.object({
  memoryId: memoryIdSchema,
  limit: limitSchema.optional(),
  project: projectIdSchema.optional(),
});

/**
 * Tag operation schema
 */
export const tagOperationSchema = z.object({
  action: z.enum(['add', 'remove']),
  tag: z.string().min(1),
  search: z.string().optional(),
  olderThan: z.string().optional(),
  type: memoryTypeSchema.optional(),
  limit: limitSchema.optional(),
  project: projectIdSchema.optional(),
});
