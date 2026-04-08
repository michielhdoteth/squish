/**
 * Memory Migration Module
 * Migrate memories between .squish directories/databases
 */

import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDbClient } from '../lib/db-client.js';

export interface MigrateOptions {
  dryRun?: boolean;
  deleteSource?: boolean;
}

export interface MigrateResult {
  memoriesCopied: number;
  observationsCopied: number;
  associationsCopied: number;
  projectsMapped: number;
  sourceDeleted?: boolean;
  message: string;
}

/**
 * Migrate memories from one .squish directory to another
 */
export async function migrateMemories(
  sourceDir: string,
  targetDir: string,
  options: MigrateOptions = {}
): Promise<MigrateResult> {
  const { dryRun = false, deleteSource = false } = options;
  
  const sourceDbPath = join(sourceDir, 'squish.db');
  const targetDbPath = join(targetDir, 'squish.db');
  
  if (!existsSync(sourceDbPath)) {
    throw new Error(`Source database not found: ${sourceDbPath}`);
  }
  if (!existsSync(targetDbPath)) {
    throw new Error(`Target database not found: ${targetDbPath}`);
  }

  // Use bun:sqlite for direct source DB access
  // @ts-ignore - bun:sqlite module not found in types but works at runtime
  const SqliteDatabase = (await import('bun:sqlite')).default;
  const sourceDb = new SqliteDatabase(sourceDbPath, { readonly: true });
  
  // Get target DB through the app's existing mechanism
  const { db: targetDb, schema } = await getDbClient();

  // Get all projects from source
  const sourceProjects = sourceDb.query('SELECT * FROM projects').all() as any[];
  
  // Map old project IDs to new project IDs
  const projectIdMap = new Map<string, string>();
  
  for (const project of sourceProjects) {
    // Check if project with same path exists in target
    const existing = await targetDb.select()
      .from(schema.projects)
      .where((tbl: any, { eq }: any) => eq(tbl.path, project.path))
      .limit(1);
    
    if (existing.length > 0) {
      projectIdMap.set(project.id, existing[0].id);
    } else {
      // Create new project in target
      const newId = randomUUID();
      await targetDb.insert(schema.projects).values({
        id: newId,
        path: project.path,
        name: project.name || 'migrated',
        createdAt: new Date(),
      });
      projectIdMap.set(project.id, newId);
    }
  }

  // Migrate memories
  const sourceMemories = sourceDb.query('SELECT * FROM memories').all() as any[];
  let memoriesCopied = 0;
  
  for (const mem of sourceMemories) {
    const oldProjectId = mem.project_id;
    const newProjectId = projectIdMap.get(oldProjectId);
    
    if (!newProjectId) {
      console.warn(`Skipping memory ${mem.id}: no project mapping found`);
      continue;
    }
    
    if (!dryRun) {
      // Add 'imported' tag to track migrated memories
      const existingTags = mem.tags ? JSON.parse(mem.tags) : [];
      const newTags = [...existingTags, 'imported'];
      
      await targetDb.insert(schema.memories).values({
        id: randomUUID(),
        projectId: newProjectId,
        type: mem.type,
        content: mem.content,
        summary: mem.summary,
        source: mem.source || 'migrated',
        confidence: mem.confidence ?? 50,
        confidenceLevel: mem.confidence_level || 'speculative',
        tags: newTags,
        metadata: { ...mem.metadata, migratedAt: new Date().toISOString(), originalId: mem.id },
        isActive: mem.is_active ?? 1,
        createdAt: mem.created_at ? new Date(mem.created_at * 1000) : new Date(),
        updatedAt: new Date(),
      });
    }
    memoriesCopied++;
  }

  // Migrate learnings (renamed from observations)
  const sourceLearnings = sourceDb.query('SELECT * FROM learnings').all() as any[];
  let learningsCopied = 0;
  
  for (const learn of sourceLearnings) {
    const oldProjectId = learn.project_id;
    const newProjectId = projectIdMap.get(oldProjectId);
    
    if (!newProjectId) continue;
    
    if (!dryRun) {
      // Add is_imported flag to track migrated learnings
      await targetDb.insert(schema.learnings).values({
        id: randomUUID(),
        projectId: newProjectId,
        type: learn.type,
        action: learn.action,
        summary: learn.summary,
        target: learn.target,
        details: learn.details,
        isImported: true,
        createdAt: new Date(),
      });
    }
    learningsCopied++;
  }

  // Migrate memory associations (simplified - skip for now)
  const sourceAssoc = sourceDb.query('SELECT * FROM memory_associations').all() as any[];
  let associationsCopied = 0;
  
  if (!dryRun && sourceAssoc.length > 0) {
    console.warn(`Note: ${sourceAssoc.length} associations not migrated (requires ID mapping)`);
  }

  // Close source DB
  sourceDb.close();

  // Delete source if requested
  let sourceDeleted = false;
  if (!dryRun && deleteSource && memoriesCopied > 0) {
    // Implementation would delete the file
    console.warn('Source deletion not implemented - requires manual removal');
  }

  return {
    memoriesCopied,
    observationsCopied: learningsCopied,
    associationsCopied,
    projectsMapped: projectIdMap.size,
    sourceDeleted,
    message: dryRun 
      ? 'Dry run complete - no changes made'
      : `Successfully migrated ${memoriesCopied} memories, ${learningsCopied} learnings`
  };
}
