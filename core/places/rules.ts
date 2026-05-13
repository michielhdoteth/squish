/**
 * Places Rules Engine - Auto-assignment logic
 * 
 * Evaluates which place a memory should be assigned to based on:
 * - Tool used (Write, Edit, Task, etc.)
 * - Content keywords
 * - Tags
 * - Memory type
 */

import { randomUUID } from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import type { PlaceType } from './places.js';
import { ensureGlobalProject } from './places.js';

export interface PlaceRule {
  id: string;
  projectId: string;
  name: string;
  placeType: PlaceType;
  matchTool: string | null;
  matchKeyword: string | null;
  matchTag: string | null;
  matchMemoryType: string | null;
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaceRuleCreateInput {
  projectId?: string;
  name: string;
  placeType: PlaceType;
  matchTool?: string;
  matchKeyword?: string;
  matchTag?: string;
  matchMemoryType?: string;
  priority?: number;
  enabled?: boolean;
}

export interface RuleMatchInput {
  toolName?: string;
  content?: string;
  tags?: string[];
  memoryType?: string;
}

/**
 * Default auto-assignment rules
 */
export const DEFAULT_RULES: Omit<PlaceRuleCreateInput, 'projectId'>[] = [
  // WIP - Implementation, code, fixes
  { name: 'Write to WIP', placeType: 'wip', matchTool: 'Write', priority: 100 },
  { name: 'Edit to WIP', placeType: 'wip', matchTool: 'Edit', priority: 100 },
  { name: 'MultiEdit to WIP', placeType: 'wip', matchTool: 'MultiEdit', priority: 100 },
  { name: 'Fix keyword to WIP', placeType: 'wip', matchKeyword: 'fix', priority: 80 },
  { name: 'Bug keyword to WIP', placeType: 'wip', matchKeyword: 'bug', priority: 80 },
  
  // Sandbox - Experiments, tests
  { name: 'Test to Sandbox', placeType: 'sandbox', matchTool: 'Bash', matchKeyword: 'test', priority: 90 },
  { name: 'Test tag to Sandbox', placeType: 'sandbox', matchTag: 'test', priority: 85 },
  
  // Board - Decisions, planning
  { name: 'Task to Board', placeType: 'board', matchTool: 'Task', priority: 100 },
  { name: 'TodoWrite to Board', placeType: 'board', matchTool: 'TodoWrite', priority: 100 },
  { name: 'Decision keyword to Board', placeType: 'board', matchKeyword: 'decided', priority: 70 },
  { name: 'Planning keyword to Board', placeType: 'board', matchKeyword: 'will implement', priority: 70 },
  
  // Ref - Research, patterns
  { name: 'Search to Ref', placeType: 'ref', matchTool: 'grep', priority: 90 },
  { name: 'WebFetch to Ref', placeType: 'ref', matchTool: 'WebFetch', priority: 85 },
  { name: 'Research keyword to Ref', placeType: 'ref', matchKeyword: 'research', priority: 80 },
  { name: 'Pattern keyword to Ref', placeType: 'ref', matchKeyword: 'pattern', priority: 75 },
  
  // Sparks - Ideas, future
  { name: 'Idea keyword to Sparks', placeType: 'sparks', matchKeyword: 'idea', priority: 80 },
  { name: 'Explore keyword to Sparks', placeType: 'sparks', matchKeyword: 'explore', priority: 75 },
  { name: 'Future keyword to Sparks', placeType: 'sparks', matchKeyword: 'will add', priority: 70 },
];

/**
 * Create a place rule
 */
export async function createPlaceRule(input: PlaceRuleCreateInput): Promise<PlaceRule> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database unavailable');
  }

  const schema = await getSchema();
  const sqliteDb = db as any;
  const id = randomUUID();

  const resolvedProjectId = input.projectId || (await ensureGlobalProject()).id;

  await sqliteDb.insert(schema.placeRules).values({
    id,
    projectId: resolvedProjectId,
    name: input.name,
    placeType: input.placeType,
    matchTool: input.matchTool || null,
    matchKeyword: input.matchKeyword || null,
    matchTag: input.matchTag || null,
    matchMemoryType: input.matchMemoryType || null,
    priority: input.priority ?? 0,
    enabled: input.enabled !== false ? 1 : 0,
  });

  logger.info(`[PlaceRules] Created rule: ${input.name} -> ${input.placeType}`);

  return {
    id,
    projectId: resolvedProjectId,
    name: input.name,
    placeType: input.placeType,
    matchTool: input.matchTool || null,
    matchKeyword: input.matchKeyword || null,
    matchTag: input.matchTag || null,
    matchMemoryType: input.matchMemoryType || null,
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get rules for a project or global scope
 */
export async function getProjectRules(projectId?: string): Promise<PlaceRule[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const resolvedProjectId = projectId || (await ensureGlobalProject()).id;

  const results = await sqliteDb.select()
    .from(schema.placeRules)
    .where(eq(schema.placeRules.projectId, resolvedProjectId))
    .orderBy(desc(schema.placeRules.priority));

  return results.map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    placeType: (row.place_type || row.placeType || 'custom') as PlaceType,
    matchTool: row.match_tool || row.matchTool,
    matchKeyword: row.match_keyword || row.matchKeyword,
    matchTag: row.match_tag || row.matchTag,
    matchMemoryType: row.match_memory_type || row.matchMemoryType,
    priority: row.priority ?? 0,
    enabled: row.enabled === 1 || row.enabled === true,
    createdAt: new Date(row.created_at || Date.now()),
    updatedAt: new Date(row.updated_at || Date.now()),
  }));
}

/**
 * Check if a rule matches the input
 */
export function matchesRule(rule: PlaceRule, input: RuleMatchInput): boolean {
  // Check tool match
  if (rule.matchTool && input.toolName) {
    if (input.toolName.toLowerCase() !== rule.matchTool.toLowerCase()) {
      return false;
    }
  }

  // Check keyword match
  if (rule.matchKeyword && input.content) {
    const contentLower = input.content.toLowerCase();
    if (!contentLower.includes(rule.matchKeyword.toLowerCase())) {
      return false;
    }
  }

  // Check tag match
  if (rule.matchTag && input.tags) {
    const hasTag = input.tags.some(t => 
      t.toLowerCase() === rule.matchTag!.toLowerCase()
    );
    if (!hasTag) {
      return false;
    }
  }

  // Check memory type match
  if (rule.matchMemoryType && input.memoryType) {
    if (input.memoryType.toLowerCase() !== rule.matchMemoryType.toLowerCase()) {
      return false;
    }
  }

  return true;
}

/**
 * Find matching place for a memory based on rules
 */
export async function findMatchingPlace(
  projectId: string | undefined,
  input: RuleMatchInput
): Promise<PlaceType | null> {
  const rules = await getProjectRules(projectId);
  
  // Sort by priority (highest first)
  const sortedRules = rules
    .filter(r => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (matchesRule(rule, input)) {
      logger.info(`[PlaceRules] Matched rule "${rule.name}" -> ${rule.placeType}`);
      return rule.placeType;
    }
  }

  return null;
}

/**
 * Initialize default rules for a project or global scope.
 * If no projectId provided, uses the global scope.
 */
export async function initializeDefaultRules(projectId?: string): Promise<PlaceRule[]> {
  const resolvedProjectId = projectId || (await ensureGlobalProject()).id;
  const created: PlaceRule[] = [];

  // Check if rules already exist for this project (skip if yes)
  const db = await getDb();
  if (db) {
    const schema = await getSchema();
    const sqliteDb = db as any;
    const existing = await sqliteDb.select()
      .from(schema.placeRules)
      .where(eq(schema.placeRules.projectId, resolvedProjectId))
      .limit(1);
    if (existing.length > 0) {
      logger.debug(`[PlaceRules] Rules already exist for project: ${resolvedProjectId}, skipping initialization`);
      return existing;
    }
  }

  for (const ruleConfig of DEFAULT_RULES) {
    const rule = await createPlaceRule({
      projectId: resolvedProjectId,
      ...ruleConfig,
    });
    created.push(rule);
  }

  logger.info(`[PlaceRules] Initialized ${created.length} default rules for project: ${resolvedProjectId}`);
  return created;
}

/**
 * Delete a rule
 */
export async function deletePlaceRule(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const schema = await getSchema();
  const sqliteDb = db as any;

  await sqliteDb.delete(schema.placeRules).where(eq(schema.placeRules.id, id));
  logger.info(`[PlaceRules] Deleted rule: ${id}`);

  return true;
}

/**
 * Update a rule
 */
export async function updatePlaceRule(
  id: string, 
  updates: Partial<PlaceRuleCreateInput>
): Promise<PlaceRule | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const updateData: any = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.placeType !== undefined) updateData.placeType = updates.placeType;
  if (updates.matchTool !== undefined) updateData.matchTool = updates.matchTool;
  if (updates.matchKeyword !== undefined) updateData.matchKeyword = updates.matchKeyword;
  if (updates.matchTag !== undefined) updateData.matchTag = updates.matchTag;
  if (updates.matchMemoryType !== undefined) updateData.matchMemoryType = updates.matchMemoryType;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

  if (Object.keys(updateData).length === 0) return null;

  await sqliteDb.update(schema.placeRules)
    .set(updateData)
    .where(eq(schema.placeRules.id, id));

  const result = await sqliteDb.select()
    .from(schema.placeRules)
    .where(eq(schema.placeRules.id, id))
    .limit(1);

  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    placeType: row.place_type as PlaceType,
    matchTool: row.match_tool,
    matchKeyword: row.match_keyword,
    matchTag: row.match_tag,
    matchMemoryType: row.match_memory_type,
    priority: row.priority,
    enabled: row.enabled === 1 || row.enabled === true,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}