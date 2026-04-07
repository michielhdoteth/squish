import { basename } from 'path';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { serializeMetadata, deserializeMetadata } from './memory/serialization.js';
import { config } from '../config.js';
import { createDatabaseClient } from './database.js';

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function getProjectByPath(path: string): Promise<ProjectRecord | null> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const rows = await db.select().from(schema.projects).where(eq(schema.projects.path, path)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return normalizeProject(row);
  } catch (error: any) {
    throw error;
  }
}

export async function ensureProject(path?: string): Promise<ProjectRecord | null> {
  if (!path) return null;
  const existing = await getProjectByPath(path);
  if (existing) return existing;

  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const id = randomUUID();
  const name = basename(path) || path;
  const metadata = { source: 'mcp' };

  await db.insert(schema.projects).values({
    id,
    name,
    path,
    metadata: serializeMetadata(metadata),
  });

  return { id, name, path, metadata };
}

export class ProjectNotFoundError extends Error {
  constructor(path: string) {
    super(`Project not found: ${path}`);
    this.name = 'ProjectNotFoundError';
  }
}

export async function requireProject(path: string): Promise<ProjectRecord> {
  const project = await getProjectByPath(path);
  if (!project) {
    throw new ProjectNotFoundError(path);
  }
  return project;
}

export async function getOrCreateProject(path?: string): Promise<ProjectRecord | null> {
  if (!path) return null;
  const existing = await getProjectByPath(path);
  if (existing) return existing;

  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const id = randomUUID();
  const name = basename(path) || path;
  const metadata = { source: 'mcp' };

  await db.insert(schema.projects).values({
    id,
    name,
    path,
    metadata: serializeMetadata(metadata),
  });

  return { id, name, path, metadata };
}

function normalizeProject(row: any): ProjectRecord {
  const metadata = deserializeMetadata(row.metadata ?? null);
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description ?? null,
    metadata,
  };
}

export async function getAllProjects(): Promise<ProjectRecord[]> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const rows = await db.select().from(schema.projects);
    return rows.map(normalizeProject);
  } catch (error: any) {
    throw error;
  }
}

export async function getProjectById(id: string): Promise<ProjectRecord | null> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const rows = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return normalizeProject(row);
  } catch (error: any) {
    throw error;
  }
}