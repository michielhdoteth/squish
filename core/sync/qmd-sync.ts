/**
 * QMD Memory Synchronization
 *
 * Syncs Squish memories to QMD collections for hybrid search.
 * Writes memories as markdown files to QMD collection directories.
 *
 * QMD automatically indexes files in collection directories, so we just
 * need to write files to the right location.
 *
 * Collection Structure:
 * - qmd-collections/squish-observations/ - Observation memories
 * - qmd-collections/squish-facts/ - Fact memories
 * - qmd-collections/squish-decisions/ - Decision memories
 * - qmd-collections/squish-context/ - Context memories
 * - qmd-collections/squish-preferences/ - Preference memories
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getQMDClient } from '../embeddings/qmd-client.js';
import type { MemoryRecord } from '../memory/memories.js';
import { config } from '../../config.js';
import { logger } from '../logger.js';

export interface CollectionMapping {
  [memoryType: string]: string;
}

/**
 * QMD Memory Sync class
 *
 * Manages synchronization of Squish memories to QMD collections.
 */
export class QMDMemorySync {
  private collectionsPath: string;
  private client: any;
  private initialized = false;

  constructor() {
    this.collectionsPath = config.qmdCollectionsPath;
  }

  /**
   * Initialize the sync layer
   *
   * Creates collection directories and verifies QMD connection.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    try {
      // Ensure collections directory exists
      await mkdir(this.collectionsPath, { recursive: true });

      // Initialize QMD client (but don't fail if QMD isn't installed)
      try {
        this.client = await getQMDClient();
        const available = await this.client.isAvailable();

        if (available) {
          logger.info('QMD sync initialized with available QMD server');
        } else {
          logger.info('QMD sync initialized (QMD server not available)');
        }
      } catch (error) {
        logger.debug('QMD client unavailable, sync will be deferred');
      }

      // Create collection directories for each memory type
      for (const [memoryType, collectionName] of Object.entries(config.qmdCollectionMapping)) {
        await this.createCollection(String(collectionName));
      }
    } catch (error) {
      logger.error(`Failed to initialize QMD sync: ${error}`);
    }
  }

  /**
   * Sync a memory to QMD
   *
   * Writes memory as markdown to the appropriate collection directory.
   * QMD will automatically index the file on its next update cycle.
   *
   * @param memory - Memory record to sync
   */
  async syncMemory(memory: MemoryRecord): Promise<void> {
    // Lazy initialization
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if QMD is available
    if (this.client && !(await this.client.isAvailable())) {
      logger.debug('QMD unavailable, skipping sync');
      return;
    }

    const collection = this.getCollectionForMemory(memory);
    const filename = this.getFilenameForMemory(memory);
    const content = this.formatMemoryAsMarkdown(memory);
    const filepath = join(this.collectionsPath, collection, filename);

    try {
      await mkdir(join(this.collectionsPath, collection), { recursive: true });
      await writeFile(filepath, content, 'utf-8');
      logger.debug(`Synced memory ${memory.id} to QMD collection ${collection}`);
    } catch (error) {
      logger.error(`Failed to sync memory to QMD: ${error}`);
    }
  }

  /**
   * Batch sync multiple memories
   *
   * @param memories - Array of memory records to sync
   */
  async syncMemories(memories: MemoryRecord[]): Promise<void> {
    for (const memory of memories) {
      await this.syncMemory(memory);
    }
  }

  /**
   * Trigger QMD re-index
   *
   * Note: This would typically call `qmd update` or `qmd embed`.
   * For now, we just log that documents are ready for indexing.
   */
  async reindex(): Promise<void> {
    if (!this.client || !(await this.client.isAvailable())) {
      logger.debug('QMD unavailable, skipping reindex');
      return;
    }

    // In a full implementation, this would spawn a qmd process
    // to update the index. For now, we rely on QMD's background indexing.
    logger.info('QMD collections updated, ready for indexing');
  }

  /**
   * Get collection name for a memory
   *
   * @param memory - Memory record
   * @returns QMD collection name
   */
  private getCollectionForMemory(memory: MemoryRecord): string {
    const mapping = config.qmdCollectionMapping || {};
    return mapping[memory.type] || 'squish-default';
  }

  /**
   * Generate filename for memory
   *
   * Uses a docid-like format (6-char hash) for consistent naming.
   *
   * @param memory - Memory record
   * @returns Filename for the memory
   */
  private getFilenameForMemory(memory: MemoryRecord): string {
    // Create a short hash from the memory ID (like QMD's docid)
    const hash = Buffer.from(memory.id.replace(/-/g, '')).toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 6);

    // Format: type-hash.md
    return `${memory.type}-${hash}.md`;
  }

  /**
   * Format memory as markdown for QMD indexing
   *
   * Uses frontmatter for metadata and standard markdown for content.
   *
   * @param memory - Memory record
   * @returns Markdown formatted string
   */
  private formatMemoryAsMarkdown(memory: MemoryRecord): string {
    const frontmatter = [
      '---',
      `id: ${memory.id}`,
      `type: ${memory.type}`,
      memory.tags && memory.tags.length > 0 ? `tags: ${memory.tags.join(', ')}` : '',
      memory.createdAt ? `created: ${memory.createdAt}` : '',
      memory.metadata ? `metadata: ${JSON.stringify(memory.metadata)}` : '',
      '---',
      '',
      `# ${this.capitalize(memory.type)}`,
      ''
    ].filter(line => line !== '').join('\n');

    return frontmatter + memory.content;
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Create a QMD collection directory
   *
   * @param name - Collection name
   */
  private async createCollection(name: string): Promise<void> {
    const collectionPath = join(this.collectionsPath, name);
    await mkdir(collectionPath, { recursive: true });
    logger.debug(`QMD collection prepared: ${name}`);
  }
}

// Singleton instance
let syncInstance: QMDMemorySync | null = null;

/**
 * Get the singleton QMD memory sync instance
 *
 * @returns QMDMemorySync instance
 */
export async function getQMDMemorySync(): Promise<QMDMemorySync> {
  if (!syncInstance) {
    syncInstance = new QMDMemorySync();
    await syncInstance.initialize();
  }
  return syncInstance;
}

/**
 * Reset the singleton sync instance
 * Useful for testing or when configuration changes.
 */
export function resetQMDMemorySync(): void {
  syncInstance = null;
}
