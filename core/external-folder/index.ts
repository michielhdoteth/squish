/**
 * External Folder Memory Manager
 * 
 * Wraps QMD to treat an external folder as a secondary memory layer.
 * - Writes hot memories to daily notes (YYYY-MM-DD.md) with frontmatter
 * - Uses QMD to search both Squish DB and external folder
 * - Auto-indexes on mount and write
 * 
 * Usage:
 *   squish mount /path/to/folder    # Enable external memory
 *   squish mount status             # Show status
 *   squish mount unmount            # Disable
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { logger } from '../logger.js';
import { config } from '../../config.js';
import type { MemoryRecord, MemoryType } from '../memory/memories.js';

export interface ExternalMemoryConfig {
  enabled: boolean;
  path: string;
}

export interface ExternalMemoryStatus {
  mounted: boolean;
  path: string | null;
  qmdIndexed: boolean;
  memoryCount: number;
  lastIndexed: string | null;
}

export interface MemoryAsMarkdown {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  createdAt: string;
  confidence?: string;
  projectId?: string | null;
}

/**
 * Format a memory as markdown with YAML frontmatter
 */
function formatMemoryAsMarkdown(memory: MemoryAsMarkdown): string {
  const frontmatter = [
    '---',
    `id: ${memory.id}`,
    `type: ${memory.type}`,
    `tags: [${memory.tags.join(', ')}]`,
    `created: ${memory.createdAt}`,
  ];
  
  if (memory.confidence) {
    frontmatter.push(`confidence: ${memory.confidence}`);
  }
  if (memory.projectId) {
    frontmatter.push(`project: ${memory.projectId}`);
  }
  
  frontmatter.push('---', '', memory.content);
  
  return frontmatter.join('\n');
}

/**
 * Get the daily note filename for a given date
 */
function getDailyNotePath(folderPath: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return join(folderPath, `${year}-${month}-${day}.md`);
}

/**
 * Get today's date string
 */
function getTodayDateStr(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * External Folder Memory Manager class
 */
export class ExternalFolderMemory {
  private mountedPath: string | null = null;
  
  /**
   * Check if external memory is enabled and mounted
   */
  isEnabled(): boolean {
    return config.externalMemoryEnabled && !!config.externalMemoryPath;
  }
  
  /**
   * Get the mounted path
   */
  getPath(): string | null {
    return this.isEnabled() ? config.externalMemoryPath : null;
  }
  
  /**
   * Mount external memory at a path
   * Creates folder if needed, initializes structure
   */
  async mount(path: string): Promise<{ success: boolean; error?: string }> {
    if (!path) {
      return { success: false, error: 'Path is required' };
    }
    
    // Resolve to absolute path
    const absolutePath = join(process.cwd(), path);
    
    // Security: validate path doesn't escape cwd (prevent path traversal)
    const resolvedPath = absolutePath.split(/[\\/]/).join('/');
    const cwdPath = process.cwd().split(/[\\/]/).join('/');
    if (!resolvedPath.startsWith(cwdPath + '/') && resolvedPath !== cwdPath) {
      return { success: false, error: 'Path traversal not allowed' };
    }
    
    // Create folder if it doesn't exist
    if (!existsSync(absolutePath)) {
      try {
        mkdirSync(absolutePath, { recursive: true });
        logger.info(`[ExternalMemory] Created folder: ${absolutePath}`);
      } catch (error) {
        return { success: false, error: `Failed to create folder: ${error}` };
      }
    }
    
    // Initialize QMD index for this folder
    const indexed = await this.ensureIndexed(absolutePath);
    if (!indexed) {
      logger.warn('[ExternalMemory] QMD not found or indexing failed. Install with: bun install -g qmd');
    }
    
    this.mountedPath = absolutePath;
    logger.info(`[ExternalMemory] Mounted at: ${absolutePath}`);
    
    return { success: true };
  }
  
  /**
   * Unmount external memory
   */
  unmount(): { success: boolean } {
    this.mountedPath = null;
    logger.info('[ExternalMemory] Unmounted');
    return { success: true };
  }
  
  /**
   * Ensure QMD indexes the external folder
   */
  async ensureIndexed(folderPath?: string): Promise<boolean> {
    const targetPath = folderPath || this.getPath();
    if (!targetPath) {
      return false;
    }
    
    return new Promise((resolve) => {
      // Run qmd add to index the folder
      const process = spawn('qmd', ['add', targetPath], {
        stdio: 'ignore'
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          logger.info(`[ExternalMemory] Indexed folder: ${targetPath}`);
          resolve(true);
        } else {
          logger.warn(`[ExternalMemory] QMD add failed with code: ${code}`);
          resolve(false);
        }
      });
      
      process.on('error', (error) => {
        logger.warn(`[ExternalMemory] QMD add error: ${error}`);
        resolve(false);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 30000);
    });
  }
  
  /**
   * Write a memory to the external folder (daily note)
   */
  async writeMemory(memory: MemoryAsMarkdown): Promise<{ success: boolean; error?: string }> {
    const folderPath = this.getPath();
    if (!folderPath) {
      return { success: false, error: 'External memory not enabled' };
    }
    
    try {
      const date = memory.createdAt ? new Date(memory.createdAt) : new Date();
      const dailyNotePath = getDailyNotePath(folderPath, date);
      const dateStr = getTodayDateStr();
      
      // Build memory block content
      const memoryBlock = formatMemoryAsMarkdown(memory);
      
      // Check if daily note exists, if not create with header
      if (!existsSync(dailyNotePath)) {
        const header = `# ${dateStr}\n\n## Squish Memories\n\n---\n\n`;
        appendFileSync(dailyNotePath, header, 'utf-8');
        logger.info(`[ExternalMemory] Created daily note: ${dailyNotePath}`);
      }
      
      // Append memory block with separator
      appendFileSync(dailyNotePath, '\n---\n\n' + memoryBlock + '\n', 'utf-8');
      logger.info(`[ExternalMemory] Wrote memory ${memory.id} to ${dateStr}.md`);
      
      // Trigger QMD re-index (background)
      this.triggerReindex().catch(() => {});
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[ExternalMemory] Write failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
  
  /**
   * Trigger background re-index via QMD
   */
  private async triggerReindex(): Promise<void> {
    const folderPath = this.getPath();
    if (!folderPath) return;
    
    // Run qmd in background to re-index
    spawn('qmd', ['add', folderPath], {
      stdio: 'ignore',
      detached: true
    });
  }
  
  /**
   * Get current status of external memory
   */
  async getStatus(): Promise<ExternalMemoryStatus> {
    const path = this.getPath();
    
    if (!path || !existsSync(path)) {
      return {
        mounted: false,
        path: null,
        qmdIndexed: false,
        memoryCount: 0,
        lastIndexed: null
      };
    }
    
    // Count .md files and memories
    let memoryCount = 0;
    try {
      const { readdirSync } = await import('fs');
      const files = readdirSync(path).filter(f => f.endsWith('.md'));
      memoryCount = files.length;
    } catch {
      // Ignore
    }
    
    // Check if QMD has this folder indexed (via qmd list)
    const qmdIndexed = await this.checkQMDIndexed(path);
    
    return {
      mounted: true,
      path,
      qmdIndexed,
      memoryCount,
      lastIndexed: null
    };
  }
  
  /**
   * Check if folder is indexed by QMD
   */
  private async checkQMDIndexed(folderPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('qmd', ['list'], {
        stdio: 'pipe'
      });
      
      let output = '';
      process.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', () => {
        resolve(output.includes(folderPath));
      });
      
      process.on('error', () => {
        resolve(false);
      });
      
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
  }
  
  /**
   * Convert a MemoryRecord to MemoryAsMarkdown format
   */
  toMarkdownFormat(memory: MemoryRecord): MemoryAsMarkdown {
    return {
      id: memory.id,
      type: memory.type,
      content: memory.content,
      tags: memory.tags || [],
      createdAt: memory.createdAt || new Date().toISOString(),
      confidence: memory.confidenceLevel || undefined,
      projectId: memory.projectId
    };
  }
}

// Singleton instance
let externalMemoryInstance: ExternalFolderMemory | null = null;

/**
 * Get the singleton ExternalFolderMemory instance
 */
export function getExternalMemory(): ExternalFolderMemory {
  if (!externalMemoryInstance) {
    externalMemoryInstance = new ExternalFolderMemory();
  }
  return externalMemoryInstance;
}

/**
 * Check if external memory is enabled
 */
export function isExternalMemoryEnabled(): boolean {
  return getExternalMemory().isEnabled();
}

/**
 * Get external memory path
 */
export function getExternalMemoryPath(): string | null {
  return getExternalMemory().getPath();
}