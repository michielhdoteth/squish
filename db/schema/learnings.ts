/**
 * Learnings table schema for migrations
 * Column definitions for ALTER TABLE migrations
 */

import type { TableSchema } from '../generator.js';

export const learningsSchema: TableSchema = {
  name: 'learnings',
  columns: {
    id: { type: 'TEXT', primary: true },
    project_id: { type: 'TEXT' },
    type: { type: 'TEXT' },
    content: { type: 'TEXT' },
    summary: { type: 'TEXT' },
    source: { type: 'TEXT' },
    confidence: { type: 'INTEGER', default: '50' },
    confidence_level: { type: 'TEXT', default: "'speculative'" },
    tags: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    embedding: { type: 'BLOB' },
    folder_path: { type: 'TEXT' },
    project_path: { type: 'TEXT' },
    is_private: { type: 'INTEGER', default: '0' },
    has_secrets: { type: 'INTEGER', default: '0' },
    relevance_score: { type: 'INTEGER', default: '50' },
    memory_id: { type: 'TEXT' },
    is_imported: { type: 'INTEGER', default: '0' },
    created_at: { type: 'INTEGER' },
    updated_at: { type: 'INTEGER' },
  },
};