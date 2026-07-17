// Re-export everything from SQLite schema (local-only OSS build)
export * from './schema-sqlite.js';

// Re-declare the MemoryType union that upstream modules expect
export type MemoryType = 'observation' | 'fact' | 'decision' | 'context' | 'preference' | 'reflection' | 'note';
