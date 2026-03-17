/** Namespace Management - Hierarchical folder-like namespaces for memories */

import { randomUUID } from 'crypto';
import { eq, and, like, or, isNull } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import { parseSquishURI, validateNamespacePath, buildSquishURI, getParentPath } from './uri-parser.js';

export type NamespaceType = 'root' | 'user' | 'agent' | 'project' | 'custom';

export interface Namespace {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  type: NamespaceType;
  description: string | null;
  path: string;  // Full path like 'user/preferences'
  children?: Namespace[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NamespaceCreateInput {
  projectId: string;
  name: string;
  type: NamespaceType;
  parentId?: string | null;
  description?: string;
}

export interface NamespaceTree {
  id: string;
  name: string;
  type: NamespaceType;
  description: string | null;
  path: string;
  children: NamespaceTree[];
}

/**
 * Create a new namespace
 */
export async function createNamespace(input: NamespaceCreateInput): Promise<Namespace> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database unavailable');
  }

  const schema = await getSchema();
  const id = randomUUID();

  // Check if namespace with same name exists under parent
  const existing = await db.select()
    .from(schema.namespaces)
    .where(and(
      eq(schema.namespaces.projectId, input.projectId),
      eq(schema.namespaces.name, input.name),
      input.parentId
        ? eq(schema.namespaces.parentId, input.parentId)
        : isNull(schema.namespaces.parentId)
    ))
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`Namespace "${input.name}" already exists under ${input.parentId || 'root'}`);
  }

  // Build namespace path
  const path = await buildNamespacePath(input.projectId, input.name, input.parentId);

  await db.insert(schema.namespaces).values({
    id,
    projectId: input.projectId,
    name: input.name,
    type: input.type,
    parentId: input.parentId || null,
    description: input.description || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  logger.info(`[Namespaces] Created namespace: ${path}`);

  return {
    id,
    projectId: input.projectId,
    name: input.name,
    type: input.type,
    parentId: input.parentId || null,
    description: input.description || null,
    path,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Build full namespace path from parent
 */
async function buildNamespacePath(
  projectId: string,
  name: string,
  parentId: string | null
): Promise<string> {
  if (!parentId) {
    return name;
  }

  const db = await getDb();
  const schema = await getSchema();

  const [parent] = await db.select()
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, parentId))
    .limit(1);

  if (!parent) {
    return name;
  }

  return `${parent.path}/${name}`;
}

/**
 * Get a namespace by ID
 */
export async function getNamespaceById(id: string): Promise<Namespace | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const [row] = await db.select()
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    description: row.description,
    path: row.path,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/**
 * Resolve a namespace path to a namespace ID
 * @example resolveNamespacePath('my-project', ['user', 'preferences']) -> namespaceId
 */
export async function resolveNamespacePath(
  projectId: string,
  path: string[]
): Promise<string | null> {
  if (path.length === 0) return null;

  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();

  let parentId: string | null = null;
  let targetNamespace: any = null;

  // Traverse path segments
  for (const segment of path) {
    const [result] = await db.select()
      .from(schema.namespaces)
      .where(and(
        eq(schema.namespaces.projectId, projectId),
        eq(schema.namespaces.name, segment),
        parentId
          ? eq(schema.namespaces.parentId, parentId)
          : isNull(schema.namespaces.parentId)
      ))
      .limit(1);

    if (!result) return null;

    targetNamespace = result;
    parentId = result.id;
  }

  return targetNamespace?.id || null;
}

/**
 * Get namespace tree for a project
 */
export async function getNamespaceTree(projectId: string): Promise<NamespaceTree[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();

  // Get all namespaces for project
  const all = await db.select()
    .from(schema.namespaces)
    .where(eq(schema.namespaces.projectId, projectId))
    .orderBy(schema.namespaces.name);

  // Build tree structure
  const map = new Map<string, NamespaceTree>();
  const roots: NamespaceTree[] = [];

  for (const row of all) {
    const node: NamespaceTree = {
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      path: row.path,
      children: [],
    };
    map.set(row.id, node);

    if (!row.parentId) {
      roots.push(node);
    } else {
      const parent = map.get(row.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  return roots;
}

/**
 * Get or create default namespaces for a project
 */
export async function getDefaultNamespaces(projectId: string): Promise<Namespace[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const created: Namespace[] = [];

  const defaults: Omit<NamespaceCreateInput, 'projectId'>[] = [
    { name: 'user', type: 'user', description: 'User-specific memories and preferences' },
    { name: 'agent', type: 'agent', description: 'Agent-specific knowledge and state' },
    { name: 'project', type: 'project', description: 'Project-specific decisions and context' },
  ];

  const defaultNames = ['user', 'agent', 'project'];

  // Check all default namespaces at once with IN clause
  const existing = await db.select()
    .from(schema.namespaces)
    .where(and(
      eq(schema.namespaces.projectId, projectId),
      eq(schema.namespaces.name, defaultNames[0]),
      eq(schema.namespaces.type, 'user'),
      isNull(schema.namespaces.parentId)
    ));

  if (existing.length > 0) {
    const ns = await createNamespace({
      projectId,
      name: defaultNames[0],
      type: 'user',
      parentId: null,
    });
    created.push({
      id: ns.id,
      projectId: ns.projectId,
      name: ns.name,
      type: ns.type,
      parentId: ns.parentId,
      description: ns.description,
      path: ns.path,
      createdAt: new Date(ns.createdAt),
      updatedAt: new Date(ns.updatedAt),
    });
  }

  // Check remaining defaults sequentially (agent and project)
  for (const defName of defaultNames.slice(1)) {
    const existing = await db.select()
      .from(schema.namespaces)
      .where(and(
        eq(schema.namespaces.projectId, projectId),
        eq(schema.namespaces.name, defName),
        eq(schema.namespaces.type, defName),
        isNull(schema.namespaces.parentId)
      ))
      .limit(1);

    if (existing.length === 0) {
      const ns = await createNamespace({
        projectId,
        name: defName,
        type: defName === 'agent' ? 'agent' : 'project',
        parentId: null,
      });
      created.push(ns);
    } else {
      created.push({
        id: existing[0].id,
        projectId: existing[0].projectId,
        name: existing[0].name,
        type: existing[0].type,
        parentId: existing[0].parentId,
        description: existing[0].description,
        path: existing[0].path,
        createdAt: new Date(existing[0].createdAt),
        updatedAt: new Date(existing[0].updatedAt),
      });
    }
  }

  logger.info(`[Namespaces] Default namespaces ready for project: ${projectId}`);
  return created;
}

/**
 * List namespaces with optional filtering
 */
export async function listNamespaces(options: {
  projectId?: string;
  type?: NamespaceType;
  parentId?: string;
  recursive?: boolean;
} = {}): Promise<Namespace[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const conditions = [];

  if (options.projectId) {
    conditions.push(eq(schema.namespaces.projectId, options.projectId));
  }
  if (options.type) {
    conditions.push(eq(schema.namespaces.type, options.type));
  }
  if (options.parentId !== undefined) {
    if (options.parentId === null) {
      conditions.push(isNull(schema.namespaces.parentId));
    } else {
      conditions.push(eq(schema.namespaces.parentId, options.parentId));
    }
  }

  const rows = await db.select()
    .from(schema.namespaces)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(schema.namespaces.name);

  return rows.map((row): Namespace => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    description: row.description,
    path: row.path,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

/**
 * Delete a namespace (cascades to child namespaces)
 */
export async function deleteNamespace(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  await db.delete(schema.namespaces).where(eq(schema.namespaces.id, id));

  logger.info(`[Namespaces] Deleted namespace: ${id}`);
}

/**
 * Update namespace
 */
export async function updateNamespace(id: string, updates: Partial<{
  name: string;
  description: string;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  await db.update(schema.namespaces).set({
    ...updates,
    updatedAt: new Date(),
  }).where(eq(schema.namespaces.id, id));

  logger.info(`[Namespaces] Updated namespace: ${id}`);
}
