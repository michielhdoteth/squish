import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { requireProject } from '../../core/projects.js';
import { deserializeMetadata } from '../../core/memory/serialization.js';
import { createDatabaseClient } from '../storage/database.js';
import { normalizeTimestamp } from '../lib/utils.js';

export interface EntityRecord {
  id: string;
  projectId?: string | null;
  name: string;
  type: string;
  description?: string | null;
  properties?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export async function getEntitiesForProject(projectPath: string, limit: number): Promise<EntityRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const project = await requireProject(projectPath);

  const rows = await db.select().from(schema.entities)
    .where(eq(schema.entities.projectId, project.id))
    .orderBy(desc(schema.entities.createdAt))
    .limit(limit);

  return rows.map((row: any) => normalizeEntity(row));
}

function normalizeEntity(row: any): EntityRecord {
  const properties = deserializeMetadata(row.properties ?? null);
  return {
    id: row.id,
    projectId: row.projectId ?? row.project_id ?? null,
    name: row.name,
    type: row.type,
    description: row.description ?? null,
    properties,
    createdAt: normalizeTimestamp(row.createdAt ?? row.created_at),
    updatedAt: normalizeTimestamp(row.updatedAt ?? row.updated_at),
  };
}
