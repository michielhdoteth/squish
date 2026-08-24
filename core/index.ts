// Shared services - Core utilities and services
export * from './storage/cache';
export * from './context/context';
export * from './storage/database';
export * from './storage/index';
export * from './embeddings';
export * from './ingestion/learnings';
export * from './security/privacy';
export * from './projects';
export * from './security/secret-detector';

// Skills system (v2.1.0)
export * from './skills/skills';

// Wiki system REMOVED in Batch 8 (db-only memory; see db/migrations/wiki-to-memory.ts)

// Agent loadout & visibility (v2.1.0)
export * from './loadout/loadout';

// Auto-extraction pipeline (v2.1.0)
export * from './extraction/extraction';
