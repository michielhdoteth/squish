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
  projectId: string;
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
  // Workshop - Implementation, code, fixes
  { name: 'Write to Workshop', placeType: 'workshop', matchTool: 'Write', priority: 100 },
  { name: 'Edit to Workshop', placeType: 'workshop', matchTool: 'Edit', priority: 100 },
  { name: 'MultiEdit to Workshop', placeType: 'workshop', matchTool: 'MultiEdit', priority: 100 },
  { name: 'Fix keyword to Workshop', placeType: 'workshop', matchKeyword: 'fix', priority: 80 },
  { name: 'Bug keyword to Workshop', placeType: 'workshop', matchKeyword: 'bug', priority: 80 },
  
  // Lab - Experiments, tests
  { name: 'Test to Lab', placeType: 'lab', matchTool: 'Bash', matchKeyword: 'test', priority: 90 },
  { name: 'Test tag to Lab', placeType: 'lab', matchTag: 'test', priority: 85 },
  
  // Office - Decisions, planning
  { name: 'Task to Office', placeType: 'office', matchTool: 'Task', priority: 100 },
  { name: 'TodoWrite to Office', placeType: 'office', matchTool: 'TodoWrite', priority: 100 },
  { name: 'Decision keyword to Office', placeType: 'office', matchKeyword: 'decided', priority: 70 },
  { name: 'Planning keyword to Office', placeType: 'office', matchKeyword: 'will implement', priority: 70 },
  
  // Library - Research, patterns
  { name: 'Search to Library', placeType: 'library', matchTool: 'grep', priority: 90 },
  { name: 'WebFetch to Library', placeType: 'library', matchTool: 'WebFetch', priority: 85 },
  { name: 'Research keyword to Library', placeType: 'library', matchKeyword: 'research', priority: 80 },
  { name: 'Pattern keyword to Library', placeType: 'library', matchKeyword: 'pattern', priority: 75 },
  
  // Garden - Ideas, future
  { name: 'Idea keyword to Garden', placeType: 'garden', matchKeyword: 'idea', priority: 80 },
  { name: 'Explore keyword to Garden', placeType: 'garden', matchKeyword: 'explore', priority: 75 },
  { name: 'Future keyword to Garden', placeType: 'garden', matchKeyword: 'will add', priority: 70 },
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

  await sqliteDb.insert(schema.placeRules).values({
    id,
    projectId: input.projectId,
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
    projectId: input.projectId,
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
 * Get rules for a project
 */
export async function getProjectRules(projectId: string): Promise<PlaceRule[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const results = await sqliteDb.select()
    .from(schema.placeRules)
    .where(eq(schema.placeRules.projectId, projectId))
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
  projectId: string,
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
 * Initialize default rules for a project
 */
export async function initializeDefaultRules(projectId: string): Promise<PlaceRule[]> {
  const created: PlaceRule[] = [];

  for (const ruleConfig of DEFAULT_RULES) {
    const rule = await createPlaceRule({
      projectId,
      ...ruleConfig,
    });
    created.push(rule);
  }

  logger.info(`[PlaceRules] Initialized ${created.length} default rules for project: ${projectId}`);
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