// Memory feature - Store and manage memories
export { normalizeMemory } from './normalization.js';
export { rememberMemory, getMemory, getMemoriesByIds, setConfidence, getRecent, search, findSimilarMemories, getOrCreateUser } from './memories.js';
export type { RememberInput, SearchInput, SearchResult } from './memories.js';
export { memoryManager } from './memory-manager.js';
export {
  normalizeTags,
  toSqliteJson,
  fromSqliteJson,
  toSqliteTags,
  fromSqliteTags,
  serializeTags,
  deserializeTags,
  serializeMetadata,
  deserializeMetadata,
} from './serialization.js';

// Advanced memory features
export {
  parseTemporalFacts,
  linkTemporalRelations,
} from './temporal-parser.js';
export type { TemporalExpressionType, TemporalFact, TemporalRelation } from './temporal-parser.js';
export {
  extractEntityNames,
  extractEntities,
  linkEntitiesToMemories,
  getMemoryEntities,
  getProjectEntities,
} from './entity-extractor.js';
export type { EntityType, ExtractedEntity } from './entity-extractor.js';
export {
  discoverBridges,
  getMemoryBridges,
  analyzeNetworkConnectivity,
} from './bridge-discovery.js';
export type { BridgePath, BridgeMemory, BridgeOptions } from './bridge-discovery.js';
