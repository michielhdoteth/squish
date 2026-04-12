/**
 * Memory Markdown Storage
 * 
 * Stores memories as markdown files in .squish/memory/
 * Following Karpathy LLM Memory pattern:
 * - raw/ : Append-only memory files (never edit)
 * - processed/ : LLM-generated articles (future)
 * - outputs/ : Query responses (future)
 * 
 * Each memory = one .md file with YAML frontmatter
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../logger.js';
import { getDataDir } from '../../../config.js';
import type { MemoryType } from '../memories.js';

export interface MarkdownMemoryInput {
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

export interface MarkdownMemoryFile {
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
 * Get the memory base path (.squish/memory/)
 */
function getMemoryPath(): string {
  return join(getDataDir(), 'memory');
}

/**
 * Get the raw memories path (.squish/memory/raw/)
 */
function getRawPath(): string {
  return join(getMemoryPath(), 'raw');
}

/**
 * Ensure memory directory structure exists
 */
function ensureMemoryStructure(): void {
  const dirs = [getMemoryPath(), getRawPath()];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info(`[MemoryStorage] Created directory: ${dir}`);
    }
  }
}

/**
 * Format memory as markdown with YAML frontmatter
 */
function formatMemoryAsMarkdown(memory: MarkdownMemoryFile): string {
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
 * Parse markdown file to MarkdownMemoryFile
 */
function parseMarkdownFile(filePath: string): MarkdownMemoryFile | null {
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
    
    return memory as MarkdownMemoryFile;
  } catch (error) {
    logger.warn(`[MemoryStorage] Failed to parse ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Save a memory to memory raw folder
 */
export async function saveToMarkdown(input: MarkdownMemoryInput): Promise<MarkdownMemoryFile> {
  ensureMemoryStructure();
  
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  
  const memory: MarkdownMemoryFile = {
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
  
  logger.info(`[MemoryStorage] Saved memory to ${filePath}`);
  
  return memory;
}

/**
 * Get all memories from memory raw folder
 */
export async function getMarkdownMemories(options?: {
  since?: Date;
  until?: Date;
  tags?: string[];
  type?: MemoryType;
  project?: string;
}): Promise<MarkdownMemoryFile[]> {
  ensureMemoryStructure();
  
  const files = readdirSync(getRawPath()).filter(f => f.endsWith('.md'));
  const memories: MarkdownMemoryFile[] = [];
  
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
export async function getMarkdownMemory(id: string): Promise<MarkdownMemoryFile | null> {
  const filePath = join(getRawPath(), `${id}.md`);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  return parseMarkdownFile(filePath);
}

/**
 * Delete a memory from memory
 */
export async function deleteMarkdownMemory(id: string): Promise<boolean> {
  const filePath = join(getRawPath(), `${id}.md`);
  
  if (!existsSync(filePath)) {
    return false;
  }
  
  unlinkSync(filePath);
  logger.info(`[MemoryStorage] Deleted memory ${id}`);
  
  return true;
}

/**
 * Get memory storage stats
 */
export async function getMemoryStats(): Promise<{
  totalMemories: number;
  byType: Record<string, number>;
  byTag: Record<string, number>;
  storageSizeBytes: number;
}> {
  ensureMemoryStructure();
  
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
 * Check if memory storage is available
 */
export function isMemoryStorageAvailable(): boolean {
  try {
    ensureMemoryStructure();
    return existsSync(getRawPath());
  } catch {
    return false;
  }
}