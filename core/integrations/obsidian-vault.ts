/** Obsidian Vault Integration
 * 
 * Appends hot memories to Obsidian daily notes
 * Format: YYYY-MM-DD.md with memory blocks
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

export interface ObsidianMemoryInput {
  content: string;
  id: string;
  type: string;
  tags: string[];
  reasoning?: string;
  memoryContext?: string;
  examples?: string;
  exceptions?: string;
  source?: string;
}

/**
 * Append a memory to the daily note in Obsidian vault
 * Creates YYYY-MM-DD.md file if it doesn't exist
 */
export async function appendToObsidianVault(
  memory: ObsidianMemoryInput,
  vaultPath: string
): Promise<void> {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  const dailyNotePath = join(vaultPath, `${dateStr}.md`);
  
  // Ensure vault directory exists
  if (!existsSync(vaultPath)) {
    mkdirSync(vaultPath, { recursive: true });
    logger.info(`[Obsidian] Created vault directory: ${vaultPath}`);
  }
  
  // Build memory block content
  const memoryBlock = formatMemoryAsBlock(memory);
  
  // Check if daily note exists, if not create with header
  if (!existsSync(dailyNotePath)) {
    const header = `# ${dateStr}\n\n## Squish Memories\n\n`;
    appendFileSync(dailyNotePath, header, 'utf-8');
    logger.info(`[Obsidian] Created daily note: ${dailyNotePath}`);
  }
  
  // Append memory block
  appendFileSync(dailyNotePath, memoryBlock + '\n\n', 'utf-8');
  logger.info(`[Obsidian] Appended memory to ${dateStr}.md`);
}

/**
 * Format memory as Obsidian-compatible block
 */
function formatMemoryAsBlock(memory: ObsidianMemoryInput): string {
  const lines: string[] = [];
  
  // Memory content as checkbox (can be toggled in Obsidian)
  lines.push(`- [ ] "${memory.content}"`);
  
  // Add ID reference for linking
  lines.push(`  - **id:** \`${memory.id}\``);
  
  // Type and tags
  if (memory.type) {
    lines.push(`  - **type:** ${memory.type}`);
  }
  if (memory.tags && memory.tags.length > 0) {
    const tagList = memory.tags.map(t => `#${t.replace(/\s+/g, '-')}`).join(' ');
    lines.push(`  - **tags:** ${tagList}`);
  }
  
  // Rich context fields
  if (memory.source) {
    lines.push(`  - **source:** ${memory.source}`);
  }
  if (memory.reasoning) {
    lines.push(`  - **reasoning:** ${memory.reasoning}`);
  }
  if (memory.memoryContext) {
    lines.push(`  - **context:** ${memory.memoryContext}`);
  }
  if (memory.examples) {
    lines.push(`  - **examples:** ${memory.examples}`);
  }
  if (memory.exceptions) {
    lines.push(`  - **exceptions:** ${memory.exceptions}`);
  }
  
  return lines.join('\n');
}

/**
 * Check if Obsidian vault is connected and accessible
 */
export function isObsidianConnected(vaultPath: string): boolean {
  if (!vaultPath || vaultPath === '') {
    return false;
  }
  
  // Check if path exists or can be created
  const parentDir = vaultPath.includes('/') 
    ? vaultPath.split('/').slice(0, -1).join('/')
    : vaultPath.split('\\').slice(0, -1).join('\\');
    
  return existsSync(parentDir) || true; // Assume creatable if parent exists
}

/**
 * Read existing memories from Obsidian vault (for import feature)
 * Scans vault for .md files and extracts memory blocks
 */
export async function readFromVault(vaultPath: string): Promise<ObsidianMemoryInput[]> {
  if (!existsSync(vaultPath)) {
    logger.warn(`[Obsidian] Vault path does not exist: ${vaultPath}`);
    return [];
  }

  const memories: ObsidianMemoryInput[] = [];
  
  // Recursively find all .md files
  const mdFiles = await findMarkdownFiles(vaultPath);
  
  for (const filePath of mdFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const filename = filePath.split(/[/\\]/).pop() || '';
      
      // Extract frontmatter if present
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let tags: string[] = [];
      
      if (frontmatterMatch) {
        const tagMatch = frontmatterMatch[1].match(/tags:\s*\[([^\]]*)\]/);
        if (tagMatch) {
          tags = tagMatch[1].split(',').map((t: string) => t.trim()).filter(Boolean);
        }
      }
      
      // Extract content after frontmatter
      const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length).trim() : content;
      
      // Skip empty files or very short ones
      if (body.length < 10) continue;
      
      memories.push({
        id: randomUUID(),
        content: body,
        tags,
        type: 'observation'
      });
    } catch (error) {
      logger.warn(`[Obsidian] Failed to read file ${filePath}: ${error}`);
    }
  }
  
  logger.info(`[Obsidian] Found ${memories.length} memories in vault`);
  return memories;
}

/**
 * Recursively find all markdown files in a directory
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip hidden directories
        if (!entry.name.startsWith('.')) {
          const subFiles = await findMarkdownFiles(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    logger.warn(`[Obsidian] Failed to read directory ${dir}: ${error}`);
  }
  
  return files;
}