import { config } from '../config.js';
import { logger } from './logger.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

const QMD_DIR = 'qmd';

interface QMDMemory {
  id: string;
  content: string;
  type: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  tier: string;
  projectPath?: string;
}

export function getQMDDir(projectPath?: string): string {
  const project = projectPath || config.dataDir;
  return join(project, QMD_DIR);
}

export function ensureQMDDir(projectPath?: string): string {
  const dir = getQMDDir(projectPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info(`[QMD] Created QMD directory: ${dir}`);
  }
  return dir;
}

function parseFrontMatter(content: string): { metadata: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: content };
  }
  
  const yamlContent = match[1];
  const body = match[2];
  
  const metadata: Record<string, any> = {};
  const lines = yamlContent.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];
  
  for (const line of lines) {
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch) {
      if (currentKey) {
        if (currentArray.length > 0) {
          metadata[currentKey] = currentArray;
          currentArray = [];
        } else {
          metadata[currentKey] = currentKey;
        }
      }
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();
      
      if (value.startsWith('[') && value.endsWith(']')) {
        currentArray = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
      } else if (value) {
        metadata[currentKey] = value.replace(/['"]/g, '');
      }
    } else if (line.trim().startsWith('-')) {
      currentArray.push(line.trim().slice(1).trim().replace(/['"]/g, ''));
    }
  }
  
  if (currentKey) {
    if (currentArray.length > 0) {
      metadata[currentKey] = currentArray;
    }
  }
  
  return { metadata, body };
}

function serializeMemory(memory: QMDMemory): string {
  const lines = ['---'];
  lines.push(`id: ${memory.id}`);
  lines.push(`type: ${memory.type}`);
  if (memory.tags && memory.tags.length > 0) {
    lines.push(`tags: [${memory.tags.join(', ')}]`);
  }
  lines.push(`tier: ${memory.tier}`);
  lines.push(`createdAt: ${memory.createdAt}`);
  lines.push(`updatedAt: ${memory.updatedAt}`);
  if (memory.projectPath) {
    lines.push(`projectPath: ${memory.projectPath}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(memory.content);
  return lines.join('\n');
}

export async function writeMemory(memory: QMDMemory): Promise<void> {
  const dir = ensureQMDDir(memory.projectPath);
  const filePath = join(dir, `${memory.id}.md`);
  const content = serializeMemory(memory);
  writeFileSync(filePath, content, 'utf-8');
  logger.debug(`[QMD] Wrote memory to ${filePath}`);
}

export async function readMemory(memoryId: string, projectPath?: string): Promise<QMDMemory | null> {
  const dir = getQMDDir(projectPath);
  const filePath = join(dir, `${memoryId}.md`);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const { metadata, body } = parseFrontMatter(content);
    
    return {
      id: memoryId,
      content: body,
      type: metadata.type || 'observation',
      tags: metadata.tags || [],
      tier: metadata.tier || 'hot',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: metadata.updatedAt || new Date().toISOString(),
      projectPath: metadata.projectPath,
    };
  } catch (error) {
    logger.error(`[QMD] Failed to read memory ${memoryId}:`, error);
    return null;
  }
}

export async function deleteMemory(memoryId: string, projectPath?: string): Promise<boolean> {
  const dir = getQMDDir(projectPath);
  const filePath = join(dir, `${memoryId}.md`);
  
  if (!existsSync(filePath)) {
    return false;
  }
  
  try {
    unlinkSync(filePath);
    logger.debug(`[QMD] Deleted memory ${memoryId}`);
    return true;
  } catch (error) {
    logger.error(`[QMD] Failed to delete memory ${memoryId}:`, error);
    return false;
  }
}

export async function searchMemories(
  query: string,
  projectPath?: string,
  options?: { limit?: number; tier?: string }
): Promise<QMDMemory[]> {
  const dir = getQMDDir(projectPath);
  const { limit = 50, tier } = options || {};
  
  if (!existsSync(dir)) {
    return [];
  }
  
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const results: QMDMemory[] = [];
  const queryLower = query.toLowerCase();
  
  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf-8');
      const { metadata, body } = parseFrontMatter(content);
      
      if (tier && metadata.tier !== tier) {
        continue;
      }
      
      const searchText = `${metadata.type || ''} ${metadata.tags?.join(' ') || ''} ${body}`.toLowerCase();
      
      if (searchText.includes(queryLower)) {
        results.push({
          id: file.replace('.md', ''),
          content: body,
          type: metadata.type || 'observation',
          tags: metadata.tags || [],
          tier: metadata.tier || 'hot',
          createdAt: metadata.createdAt || '',
          updatedAt: metadata.updatedAt || '',
          projectPath: metadata.projectPath,
        });
      }
    } catch {
      // Skip unreadable files
    }
    
    if (results.length >= limit) break;
  }
  
  return results.slice(0, limit);
}

export async function getHotMemories(projectPath?: string, limit = 100): Promise<QMDMemory[]> {
  return searchMemories('', projectPath, { limit, tier: 'hot' });
}

export async function updateMemoryTier(memoryId: string, newTier: string, projectPath?: string): Promise<boolean> {
  const memory = await readMemory(memoryId, projectPath);
  if (!memory) return false;
  
  memory.tier = newTier;
  memory.updatedAt = new Date().toISOString();
  
  await writeMemory(memory);
  return true;
}

export function isQMDEnabled(): boolean {
  return config.qmdEnabled !== false;
}
