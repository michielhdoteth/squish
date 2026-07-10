/**
 * Beliefs table schema for migrations
 * Column definitions for ALTER TABLE migrations
 */

import type { TableSchema } from './generator.js';

export const beliefsSchema: TableSchema = {
  name: 'beliefs',
  columns: {
    id: { type: 'TEXT', primary: true },
    project_id: { type: 'TEXT' },
    belief_type: { type: 'TEXT' },
    statement: { type: 'TEXT' },
    normalized_key: { type: 'TEXT' },
    confidence: { type: 'REAL', default: '0.5' },
    belief_decay_rate: { type: 'INTEGER', default: '30' },
    last_confirmed_at: { type: 'INTEGER' },
    source_count: { type: 'INTEGER', default: '1' },
    status: { type: 'TEXT', default: "'active'" },
    reason: { type: 'TEXT' },
    context: { type: 'TEXT' },
    evidence_summary: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
    updated_at: { type: 'INTEGER' },
  },
};

export const beliefMemorySourcesSchema: TableSchema = {
  name: 'belief_memory_sources',
  columns: {
    id: { type: 'TEXT', primary: true },
    belief_id: { type: 'TEXT' },
    memory_id: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
  },
};

export const beliefEdgesSchema: TableSchema = {
  name: 'belief_edges',
  columns: {
    id: { type: 'TEXT', primary: true },
    from_belief_id: { type: 'TEXT' },
    to_belief_id: { type: 'TEXT' },
    edge_type: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
  },
};