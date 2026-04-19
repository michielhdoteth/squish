/**
 * Shared type definitions for Squish Memory system
 * Consolidated from core/memory/memories.ts and core/memory/normalization.ts
 */

// Valid memory type values
export type MemoryType = 'observation' | 'fact' | 'decision' | 'context' | 'preference' | 'note' | 'task';

/**
 * Confidence level for memory records
 * - certain: High confidence, verified information
 * - speculative: Low confidence, unverified or uncertain
 * - outdated: Information that may no longer be accurate
 */
export type ConfidenceLevel = 'certain' | 'speculative' | 'outdated';

/**
 * Unified MemoryRecord interface
 * Used across memories.ts and normalization.ts
 *
 * Note: type is string to avoid circular dependency with memories.ts
 * Use MemoryType for type checking when needed
 */
export interface MemoryRecord {
  id: string;
  projectId?: string | null;
  type: string; // Stored as string in DB (use MemoryType for valid values)
  content: string;
  summary?: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  recordedAt?: string | null;
  similarity?: number;
  importance?: number;
  confidenceLevel?: ConfidenceLevel | null;
}

/**
 * Result of a safety check
 * Used to determine if a merge action can proceed
 */
export interface SafetyCheckResult {
  passed: boolean;
  warnings: string[];
  blockers: string[]; // Hard failures
}