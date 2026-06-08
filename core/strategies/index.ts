// Strategy Layer Core - v1.7
// Active layer for agent strategies: procedures, heuristics, patterns, constraints, workarounds

export type {
  StrategyType,
  StrategyStatus,
  StrategyEdgeType,
  StrategyBeliefEdgeType,
  Strategy,
  CreateStrategyInput,
  ExtractedStrategy,
} from './types.js';

export {
  createStrategy,
  getStrategy,
  listStrategies,
  updateStrategy,
  supersedeStrategy,
  recordUsage,
  deleteStrategy,
  searchStrategies,
  getStrategiesByConfidence,
  createStrategyEdge,
  createStrategyBeliefEdge,
  getStrategyStats,
} from './store.js';

export {
  extractStrategiesFromConversation,
  extractStrategiesFromLearning,
  extractStrategiesFromBelief,
} from './extractor.js';

export {
  findSimilarStrategies,
  mergeStrategies,
  deduplicateStrategies,
} from './deduplicator.js';

export {
  decayStrategyConfidence,
  autoDeprecateUnusedStrategies,
  boostConfidence,
} from './decay.js';
