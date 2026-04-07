/**
 * Memory normalization utilities
 * Shared between memories.ts and loader.ts to avoid circular dependencies
 */

import { deserializeTags, deserializeMetadata } from './serialization.js';
import { normalizeTimestamp } from '../utils.js';

export interface MemoryRecord {
  id: string;
  projectId?: string | null;
  type: string;
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
  confidenceLevel?: 'certain' | 'speculative' | 'outdated' | null;
}

export function normalizeMemory(row: any): MemoryRecord {
  const tags = deserializeTags(row.tags ?? null);
  const metadata = deserializeMetadata(row.metadata ?? null);

  const createdAtStr = normalizeTimestamp(row.createdAt ?? row.created_at);

  return {
    id: row.id,
    projectId: row.projectId ?? row.project_id ?? null,
    type: row.type,
    content: row.content,
    summary: row.summary ?? null,
    tags,
    metadata,
    createdAt: createdAtStr,
    validFrom: row.validFrom ?? row.valid_from ?? null,
    validTo: row.validTo ?? row.valid_to ?? null,
    recordedAt: row.recordedAt ?? row.recorded_at ?? null,
    confidenceLevel: row.confidenceLevel ?? row.confidence_level ?? null,
  };
}
