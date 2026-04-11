/**
 * Wiki Folder Storage
 * 
 * Stores memories as markdown files in .squish/wiki/raw/
 * Following Karpathy LLM Wiki pattern:
 * - raw/ : Append-only memory files (never edit)
 * - wiki/ : LLM-generated articles (future)
 * - outputs/ : Query responses (future)
 * 
 * Each memory = one .md file with YAML frontmatter
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { getDataDir } from '../../config.js';
import type { MemoryType } from '../memory/memories.js';

export interface WikiMemoryInput {
  content: string;
  type?: MemoryType;
  tags?: string[];
  reasoning?: string;
  memoryContext?: string;
  examples?: string;
  exceptions?: string;
  source?: string;
  project?: string;
}

export interface WikiMemoryFile {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  createdAt: string;
  source?: string;
  project?: string;
  reasoning?: string;
  memoryContext?: string;
  examples?: string;
  exceptions?: string;
}

/**
 * Get the wiki base path (.squish/wiki/)
 */
function getWikiPath(): string {
  return join(getDataDir(), 'wiki');
}

/**
 * Get the raw memories path (.squish/wiki/raw/)
 */
function getRawPath(): string {
  return join(getWikiPath(), 'raw');
}

/**
 * Ensure wiki directory structure exists
 */
function ensureWikiStructure(): void {
  const dirs = [getWikiPath(), getRawPath()];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info(`[WikiStorage] Created directory: ${dir}`);
    }
  }
}

/**
 * Format memory as markdown with YAML frontmatter
 */
function formatMemoryAsMarkdown(memory: WikiMemoryFile): string {
  const lines: string[] = [];
  
  // YAML frontmatter
  lines.push('---');
  lines.push(`id: ${memory.id}`);
  lines.push(`type: ${memory.type}`);
  lines.push(`created: ${memory.createdAt}`);
  
  if (memory.tags && memory.tags.length > 0) {
    lines.push(`tags: [${memory.tags.join(', ')}]`);
  }
  if (memory.source) {
    lines.push(`source: ${memory.source}`);
  }
  if (memory.project) {
    lines.push(`project: ${memory.project}`);
  }
  if (memory.reasoning) {
    lines.push(`reasoning: |`);
    lines.push(memory.reasoning.split('\n').map(l => `  ${l}`).join('\n'));
  }
  if (memory.memoryContext) {
    lines.push(`context: |`);
    lines.push(memory.memoryContext.split('\n').map(l => `  ${l}`).join('\n'));
  }
  if (memory.examples) {
    lines.push(`examples: |`);
    lines.push(memory.examples.split('\n').map(l => `  ${l}`).join('\n'));
  }
  if (memory.exceptions) {
    lines.push(`exceptions: |`);
    lines.push(memory.exceptions.split('\n').map(l => `  ${l}`).join('\n'));
  }
  
  lines.push('---');
  lines.push('');
  lines.push(memory.content);
  
  return lines.join('\n');
}

/**
 * Parse markdown file to WikiMemoryFile
 */
function parseMarkdownFile(filePath: string): WikiMemoryFile | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!match) return null;
    
    const frontmatter = match[1];
    const body = content.slice(match[0].length).trim();
    
    const memory: any = { content: body };
    
    // Parse frontmatter lines
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      
      // Handle array values like tags: [tag1, tag2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
        memory[key] = value.split(',').map((t: string) => t.trim());
      } else if (value === 'true' || value === 'false') {
        memory[key] = value === 'true';
      } else {
        memory[key] = value;
      }
    }
    
    return memory as WikiMemoryFile;
  } catch (error) {
    logger.warn(`[WikiStorage] Failed to parse ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Save a memory to wiki raw folder
 */
export async function saveToWiki(input: WikiMemoryInput): Promise<WikiMemoryFile> {
  ensureWikiStructure();
  
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  
  const memory: WikiMemoryFile = {
    id,
    type: input.type || 'observation',
    content: input.content,
    tags: input.tags || [],
    createdAt,
    source: input.source,
    project: input.project,
    reasoning: input.reasoning,
    memoryContext: input.memoryContext,
    examples: input.examples,
    exceptions: input.exceptions,
  };
  
  const filePath = join(getRawPath(), `${id}.md`);
  writeFileSync(filePath, formatMemoryAsMarkdown(memory), 'utf-8');
  
  logger.info(`[WikiStorage] Saved memory to ${filePath}`);
  
  return memory;
}

/**
 * Get all memories from wiki raw folder
 */
export async function getWikiMemories(options?: {
  since?: Date;
  until?: Date;
  tags?: string[];
  type?: MemoryType;
  project?: string;
}): Promise<WikiMemoryFile[]> {
  ensureWikiStructure();
  
  const files = readdirSync(getRawPath()).filter(f => f.endsWith('.md'));
  const memories: WikiMemoryFile[] = [];
  
  for (const file of files) {
    const filePath = join(getRawPath(), file);
    const memory = parseMarkdownFile(filePath);
    
    if (!memory) continue;
    
    const createdAt = new Date(memory.createdAt);
    
    // Filter by date range
    if (options?.since && createdAt < options.since) continue;
    if (options?.until && createdAt > options.until) continue;
    
    // Filter by tags
    if (options?.tags && options.tags.length > 0) {
      const hasTag = options.tags.some(t => memory.tags.includes(t));
      if (!hasTag) continue;
    }
    
    // Filter by type
    if (options?.type && memory.type !== options.type) continue;
    
    // Filter by project
    if (options?.project && memory.project !== options.project) continue;
    
    memories.push(memory);
  }
  
  // Sort by createdAt descending
  memories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  return memories;
}

/**
 * Get a specific memory by ID
 */
export async function getWikiMemory(id: string): Promise<WikiMemoryFile | null> {
  const filePath = join(getRawPath(), `${id}.md`);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  return parseMarkdownFile(filePath);
}

/**
 * Delete a memory from wiki
 */
export async function deleteWikiMemory(id: string): Promise<boolean> {
  const filePath = join(getRawPath(), `${id}.md`);
  
  if (!existsSync(filePath)) {
    return false;
  }
  
  unlinkSync(filePath);
  logger.info(`[WikiStorage] Deleted memory ${id}`);
  
  return true;
}

/**
 * Get wiki storage stats
 */
export async function getWikiStats(): Promise<{
  totalMemories: number;
  byType: Record<string, number>;
  byTag: Record<string, number>;
  storageSizeBytes: number;
}> {
  ensureWikiStructure();
  
  const files = readdirSync(getRawPath()).filter(f => f.endsWith('.md'));
  
  const byType: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  let storageSizeBytes = 0;
  
  for (const file of files) {
    const filePath = join(getRawPath(), file);
    const stats = await import('fs').then(fs => fs.statSync(filePath));
    storageSizeBytes += stats.size;
    
    const memory = parseMarkdownFile(filePath);
    if (!memory) continue;
    
    byType[memory.type] = (byType[memory.type] || 0) + 1;
    
    for (const tag of memory.tags) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }
  
  return {
    totalMemories: files.length,
    byType,
    byTag,
    storageSizeBytes,
  };
}

/**
 * Check if wiki storage is available
 */
export function isWikiStorageAvailable(): boolean {
  try {
    ensureWikiStructure();
    return existsSync(getRawPath());
  } catch {
    return false;
  }
}