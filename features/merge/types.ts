/**
 * TypeScript types and interfaces for memory merging
 */

import type { Memory, MemoryMergeProposal, MemoryMergeHistory } from '../../drizzle/schema';

/**
 * Merge proposal status
 */
export type MergeProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * Confidence level for merge suggestions
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Detection method used to find duplicates
 */
export type DetectionMethod = 'simhash' | 'minhash' | 'embedding';

/**
 * Merge strategy type per memory type
 */
export type MergeStrategyType = 'union' | 'latest' | 'voting' | 'custom';

/**
 * Memory pair candidate for merging
 */
export interface MemoryMergePair {
  memory1: Memory;
  memory2: Memory;
  similarityScore: number;
  detectionMethod: DetectionMethod;
  confidenceLevel: ConfidenceLevel;
  mergeReason: string;
}

/**
 * Merge proposal with all details
 */
export interface MergeProposalDetails {
  proposal: MemoryMergeProposal;
  sourceMemories: Memory[];
  previewMerged: {
    content: string;
    summary: string | null;
    tags: string[];
    metadata: Record<string, unknown>;
  };
  analysis: {
    savedTokens: number;
    savedPercentage: number;
    conflictWarnings: string[];
  };
}

/**
 * Merge result after approval
 */
export interface MergeResult {
  proposalId: string;
  canonicalMemoryId: string;
  mergedMemoryIds: string[];
  tokensSaved: number;
  mergedAt: Date;
  mergeHistoryId?: string;
}

/**
 * Merge reversal result
 */
export interface MergeReversal {
  mergeHistoryId: string;
  canonicalMemoryId: string;
  restoredMemoryIds: string[];
  reversedAt: Date;
}

/**
 * Detection statistics
 */
export interface DetectionStatistics {
  totalMemories: number;
  scannedMemories: number;
  candidatesFound: number;
  candidatesRanked: number;
  estimatedTokensSaved: number;
  timeMs: {
    stage1: number;
    stage2: number;
    total: number;
  };
}

/**
 * Project merge statistics
 */
export interface ProjectMergeStatistics {
  projectId: string;
  totalMemories: number;
  mergeableMemories: number;
  mergedMemories: number;
  canonicalMemories: number;
  pendingProposals: number;
  approvedMerges: number;
  rejectedProposals: number;
  reversedMerges: number;
  tokensSaved: {
    total: number;
    formatted: string;
    percentage: number;
  };
  averageMergeSize: number;
}

/**
 * Merge safety check result
 */
export interface SafetyCheckResult {
  passed: boolean;
  warnings: string[];
  blockers: string[];
}

/**
 * Hash cache entry for fast duplicate detection
 */
export interface HashCacheEntry {
  memoryId: string;
  simhash: string;
  minhash: number[];
  contentHash: string;
  lastUpdated: Date;
}

/**
 * Stage 1 candidate pair with hash distances
 */
export interface Stage1CandidatePair {
  memoryId1: string;
  memoryId2: string;
  simhashDistance: number;
  minhashSimilarity: number;
  matched: 'simhash' | 'minhash' | 'both';
}
