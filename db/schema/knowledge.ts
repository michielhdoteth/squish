/**
 * Knowledge table schema for migrations
 * Column definitions for ALTER TABLE migrations
 * 
 * Replaces: memories, beliefs, strategies — unified into one table.
 * Entity and place tables remain separate but connect via knowledge_edges.
 */

import type { TableSchema } from './generator.js';

/**
 * Unified knowledge table — stores memories, beliefs, and strategies.
 * Fields are nullable based on knowledge_kind.
 */
export const knowledgeSchema: TableSchema = {
  name: 'knowledge',
  columns: {
    id: { type: 'TEXT', primary: true },
    project_id: { type: 'TEXT' },
    user_id: { type: 'TEXT' },
    agent_id: { type: 'TEXT' },
    session_id: { type: 'TEXT' },

    knowledge_kind: { type: 'TEXT NOT NULL' }, // 'memory' | 'belief' | 'strategy'
    knowledge_type: { type: 'TEXT NOT NULL' }, // subtype per kind

    content: { type: 'TEXT NOT NULL' },
    summary: { type: 'TEXT' },

    embedding_json: { type: 'TEXT' },
    embedding: { type: 'BLOB' },

    confidence: { type: 'REAL DEFAULT 0.5' },
    confidence_level: { type: 'TEXT DEFAULT "certain"' },
    importance_score: { type: 'REAL DEFAULT 0.5' },
    importance_decay_rate: { type: 'REAL DEFAULT 30' },
    last_importance_recalc: { type: 'INTEGER' },

    // Belief fields
    normalized_key: { type: 'TEXT' },
    reason: { type: 'TEXT' },
    evidence_summary: { type: 'TEXT' },
    last_confirmed_at: { type: 'INTEGER' },
    source_count: { type: 'INTEGER DEFAULT 1' },

    // Strategy fields
    title: { type: 'TEXT' },
    description: { type: 'TEXT' },
    steps: { type: 'TEXT' },           // JSON array of strings
    success_criteria: { type: 'TEXT' },
    failure_indicators: { type: 'TEXT' },
    usage_count: { type: 'INTEGER DEFAULT 0' },
    success_count: { type: 'INTEGER DEFAULT 0' },
    failure_count: { type: 'INTEGER DEFAULT 0' },
    last_used_at: { type: 'INTEGER' },
    last_success_at: { type: 'INTEGER' },
    last_failure_at: { type: 'INTEGER' },

    status: { type: 'TEXT DEFAULT "active"' },

    // Self-referencing relationships
    superseded_by: { type: 'TEXT' },
    contradicts_id: { type: 'TEXT' },
    informed_by_id: { type: 'TEXT' },

    tags: { type: 'TEXT' },             // JSON array
    metadata: { type: 'TEXT' },         // JSON object

    // Place routing
    place_id: { type: 'TEXT' },
    primary_place: { type: 'TEXT' },

    // Memory lifecycle
    sector: { type: 'TEXT DEFAULT "general"' },
    tier: { type: 'TEXT DEFAULT "episodic"' },
    is_active: { type: 'INTEGER DEFAULT 1' },

    created_at: { type: 'INTEGER DEFAULT (strftime(\'%s\',\'now\')) NOT NULL' },
    updated_at: { type: 'INTEGER DEFAULT (strftime(\'%s\',\'now\')) NOT NULL' },
  },
};

/**
 * Universal edge table — replaces belief_edges, strategy_edges,
 * strategy_belief_edges, entity_relations, and memory_places.
 * 
 * Supports: knowledge<->knowledge, knowledge<->entity, knowledge<->place,
 *           entity<->entity, entity<->place
 */
export const knowledgeEdgesSchema: TableSchema = {
  name: 'knowledge_edges',
  columns: {
    id: { type: 'TEXT', primary: true },
    from_id: { type: 'TEXT NOT NULL' },
    from_kind: { type: 'TEXT NOT NULL' },  // 'knowledge' | 'entity' | 'place'
    to_id: { type: 'TEXT NOT NULL' },
    to_kind: { type: 'TEXT NOT NULL' },    // 'knowledge' | 'entity' | 'place'
    edge_type: { type: 'TEXT NOT NULL' },
    weight: { type: 'REAL DEFAULT 1.0' },
    metadata: { type: 'TEXT' },            // JSON object
    created_at: { type: 'INTEGER DEFAULT (strftime(\'%s\',\'now\')) NOT NULL' },
  },
};
