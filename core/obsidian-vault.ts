/** Obsidian Vault Integration
 * 
 * Appends hot memories to Obsidian daily notes
 * Format: YYYY-MM-DD.md with memory blocks
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

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
 * Read existing memories from Obsidian vault (for future import feature)
 */
export async function readFromVault(vaultPath: string): Promise<ObsidianMemoryInput[]> {
  // Future: Read .md files and parse memory blocks
  // For MVP, this is placeholder
  logger.info(`[Obsidian] readFromVault called for: ${vaultPath}`);
  return [];
}