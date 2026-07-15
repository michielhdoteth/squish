/**
 * File Watcher
 *
 * Watches an inbox directory for new media files and auto-ingests them.
 * Uses polling (not native fs.watch) for cross-platform reliability.
 *
 * Design:
 * - Polls every 5 seconds (configurable)
 * - Tracks processed files by path + mtime to avoid re-processing
 * - Max file size limit (default 100MB) to prevent memory issues
 * - Graceful shutdown via stop()
 */

import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { logger } from '../logger.js';
import { ingestMediaFile, type IngestInput } from './ingest-pipeline.js';
import { isKnownMediaType } from './mime-detector.js';

export interface WatcherConfig {
  /** Directory to watch for new files (default: ./inbox) */
  inboxDir: string;
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs: number;
  /** Max file size in bytes (default: 100MB) */
  maxFileSizeBytes: number;
  /** Project ID to assign ingested memories to */
  projectId?: string;
  /** Tags to add to all ingested memories */
  tags?: string[];
}

const DEFAULT_CONFIG: WatcherConfig = {
  inboxDir: './inbox',
  pollIntervalMs: 5000,
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
};

interface ProcessedEntry {
  path: string;
  mtimeMs: number;
  ingestedAt: Date;
}

export class InboxWatcher {
  private config: WatcherConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private processed = new Map<string, ProcessedEntry>();
  private running = false;

  constructor(config: Partial<WatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.inboxDir = resolve(this.config.inboxDir);
  }

  /**
   * Start watching the inbox directory.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(`[Watcher] Starting inbox watcher on ${this.config.inboxDir}`);
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
    // Run immediately
    this.poll();
  }

  /**
   * Stop watching and clean up.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('[Watcher] Stopped inbox watcher');
  }

  /**
   * Get stats about the watcher.
   */
  stats(): { running: boolean; processedCount: number; inboxDir: string } {
    return {
      running: this.running,
      processedCount: this.processed.size,
      inboxDir: this.config.inboxDir,
    };
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const entries = await readdir(this.config.inboxDir);
      for (const entry of entries) {
        await this.processEntry(entry);
      }
    } catch (err: unknown) {
      // If inbox dir doesn't exist, that's fine - just skip
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('ENOENT')) {
        logger.debug(`[Watcher] Poll error: ${msg}`);
      }
    }
  }

  private async processEntry(fileName: string): Promise<void> {
    const filePath = join(this.config.inboxDir, fileName);

    // Skip known non-media files
    if (!isKnownMediaType(filePath)) return;

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) return;

      // Skip if too large
      if (fileStat.size > this.config.maxFileSizeBytes) {
        logger.debug(`[Watcher] Skipping ${fileName}: exceeds max size`);
        return;
      }

      // Skip if already processed (check by path + mtime)
      const existing = this.processed.get(filePath);
      if (existing && existing.mtimeMs >= fileStat.mtimeMs) return;

      // Ingest the file
      logger.info(`[Watcher] Ingesting ${fileName}`);
      const input: IngestInput = {
        filePath,
        projectId: this.config.projectId,
        tags: this.config.tags,
        source: 'watcher',
      };

      const result = await ingestMediaFile(input);

      // Track as processed
      this.processed.set(filePath, {
        path: filePath,
        mtimeMs: fileStat.mtimeMs,
        ingestedAt: new Date(),
      });

      if (result.status === 'success' || result.status === 'partial') {
        logger.info(`[Watcher] Successfully ingested ${fileName} (${result.status})`);
      } else {
        logger.debug(`[Watcher] Failed to ingest ${fileName}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(`[Watcher] Error processing ${fileName}: ${msg}`);
    }
  }
}

/**
 * Create and start an inbox watcher with default settings.
 */
export function startInboxWatcher(config: Partial<WatcherConfig> = {}): InboxWatcher {
  const watcher = new InboxWatcher(config);
  watcher.start();
  return watcher;
}
