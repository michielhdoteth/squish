/**
 * Memory Merging Feature - Barrel Exports
 *
 * Provides a clean public API for memory merging functionality
 */
export * from './types.js';
export { detectDuplicates, analyzeMergePair, getDetectionStats } from './detection/two-stage-detector.js';
export { SimHashFilter, MinHashFilter, findCandidatePairs } from './detection/hash-filters.js';
export { rankCandidates, analyzePair } from './detection/semantic-ranker.js';
export { getMergeStrategy, mergeMemories, MERGE_STRATEGIES } from './strategies/merge-strategies.js';
export type { MergeStrategy, MergedMemory } from './strategies/merge-strategies.js';
export { runSafetyChecks, checkBlockers, formatSafetyResults, describeSafetyChecks } from './safety/safety-checks.js';
export { estimateTokensSaved, calculateProjectTokenSavings, estimateMergeSavingsPreview, getTokenStatistics, formatTokenCount, formatSavingsReport, } from './analytics/token-estimator.js';
export { handleDetectDuplicates } from './handlers/detect-duplicates.js';
export { handleListProposals } from './handlers/list-proposals.js';
export { handlePreviewMerge } from './handlers/preview-merge.js';
export { handleApproveMerge } from './handlers/approve-merge.js';
export { handleRejectMerge } from './handlers/reject-merge.js';
export { handleReverseMerge } from './handlers/reverse-merge.js';
export { handleGetMergeStats } from './handlers/get-stats.js';
//# sourceMappingURL=index.d.ts.map