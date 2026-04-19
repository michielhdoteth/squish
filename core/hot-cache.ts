/**
 * Hot Cache - Persistent session context (Karpathy-style)
 * 
 * Implements the "hot.md" layer from LLM Wiki pattern:
 * - ~500 words persistent session context
 * - Survives restart (unlike session working set)
 * - Auto-updates on session events
 * - Deduplication and stale detection
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { logger } from '../logger.js';
import { getProjectPath } from '../projects.js';

export interface HotCacheEntry {
  id: string;
  content: string;
  hash: string;
  createdAt: number;
  lastReferencedAt: number;
  referenceCount: number;
  tags?: string[];
}

export interface HotCache {
  version: string;
  projectPath: string;
  entries: HotCacheEntry[];
  lastUpdated: number;
  staleEntries: string[];  // IDs flagged as stale
}

const HOT_CACHE_VERSION = '1.0.0';
const MAX_HOT_CACHE_SIZE = 500;  // ~500 words max
const STALE_THRESHOLD_DAYS = 7;  // Flag as stale after 7 days
const STALE_REFERENCE_COUNT = 3;  // Minimum refs before considering stale

let hotCacheInstance: HotCache | null = null;

/**
 * Get the hot cache file path for a project
 */
function getHotCachePath(projectPath: string): string {
  return join(projectPath, '.squish', 'hot-cache.json');
}

/**
 * Ensure .squish directory exists
 */
async function ensureSquishDir(projectPath: string): Promise<string> {
  const squishDir = join(projectPath, '.squish');
  if (!existsSync(squishDir)) {
    mkdirSync(squishDir, { recursive: true });
  }
  return squishDir;
}

/**
 * Create content hash for deduplication
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex').slice(0, 12);
}

/**
 * Load hot cache from disk (or create new)
 */
export async function loadHotCache(projectPath?: string): Promise<HotCache> {
  const path = projectPath || await getProjectPath();
  if (!path) {
    return createEmptyHotCache('');
  }

  const cachePath = getHotCachePath(path);
  
  try {
    if (existsSync(cachePath)) {
      const content = readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(content) as HotCache;
      
      // Clean stale entries on load
      cache.staleEntries = identifyStaleEntries(cache.entries);
      
      // Remove very stale entries (>14 days)
      cache.entries = cache.entries.filter(entry => {
        const ageDays = (Date.now() - entry.lastReferencedAt) / (24 * 60 * 60 * 1000);
        return ageDays < 14;
      });
      
      logger.info('[HotCache] Loaded', { entries: cache.entries.length, path });
      return cache;
    }
  } catch (error) {
    logger.warn('[HotCache] Load failed, creating new', { error });
  }
  
  return createEmptyHotCache(path);
}

/**
 * Create empty hot cache
 */
function createEmptyHotCache(projectPath: string): HotCache {
  return {
    version: HOT_CACHE_VERSION,
    projectPath,
    entries: [],
    lastUpdated: Date.now(),
    staleEntries: [],
  };
}

/**
 * Identify stale entries (>7 days without enough references)
 */
function identifyStaleEntries(entries: HotCacheEntry[]): string[] {
  const stale: string[] = [];
  const now = Date.now();
  
  for (const entry of entries) {
    const daysSinceRef = (now - entry.lastReferencedAt) / (24 * 60 * 60 * 1000);
    if (daysSinceRef > STALE_THRESHOLD_DAYS && entry.referenceCount < STALE_REFERENCE_COUNT) {
      stale.push(entry.id);
    }
  }
  
  return stale;
}

/**
 * Save hot cache to disk
 */
export async function saveHotCache(cache: HotCache): Promise<void> {
  const cachePath = getHotCachePath(cache.projectPath);
  
  try {
    await ensureSquishDir(cache.projectPath);
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    cache.lastUpdated = Date.now();
  } catch (error) {
    logger.error('[HotCache] Save failed', { error });
  }
}

/**
 * Add an entry to hot cache (with deduplication)
 */
export async function addToHotCache(
  content: string,
  options?: {
    projectPath?: string;
    tags?: string[];
    reference?: boolean;
  }
): Promise<HotCache> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) {
    return createEmptyHotCache('');
  }

  const cache = await loadHotCache(path);
  
  const contentHash = hashContent(content);
  
  // Check for duplicate by hash
  const existingIndex = cache.entries.findIndex(e => e.hash === contentHash);
  if (existingIndex >= 0) {
    // Update reference info for duplicate
    cache.entries[existingIndex].lastReferencedAt = Date.now();
    cache.entries[existingIndex].referenceCount++;
    await saveHotCache(cache);
    logger.debug('[HotCache] Updated existing entry reference', { hash: contentHash });
    return cache;
  }

  // Add new entry
  const newEntry: HotCacheEntry = {
    id: `hot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: content.slice(0, 500),  // Limit individual entry size
    hash: contentHash,
    createdAt: Date.now(),
    lastReferencedAt: Date.now(),
    referenceCount: 1,
    tags: options?.tags,
  };

  cache.entries.push(newEntry);
  
  // Trim if over max size (remove oldest entries)
  if (cache.entries.length > MAX_HOT_CACHE_SIZE) {
    cache.entries = cache.entries
      .sort((a, b) => b.lastReferencedAt - a.lastReferencedAt)
      .slice(0, MAX_HOT_CACHE_SIZE);
  }
  
  await saveHotCache(cache);
  logger.info('[HotCache] Added new entry', { entries: cache.entries.length });
  
  return cache;
}

/**
 * Get hot cache summary for context
 * Returns markdown-formatted summary of recent entries
 */
export async function getHotCacheSummary(
  options?: {
    projectPath?: string;
    maxEntries?: number;
  }
): Promise<string> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) return '';

  const cache = await loadHotCache(path);
  
  if (cache.entries.length === 0) {
    return '## Hot Cache\n\nNo active hot memories yet.\n';
  }

  const maxEntries = options?.maxEntries || 10;
  const recentEntries = cache.entries
    .sort((a, b) => b.lastReferencedAt - a.lastReferencedAt)
    .slice(0, maxEntries);

  const lines = ['## Hot Cache\n'];
  
  for (const entry of recentEntries) {
    const date = new Date(entry.lastReferencedAt).toISOString().split('T')[0];
    const stale = cache.staleEntries.includes(entry.id) ? ' [STALE]' : '';
    lines.push(`- ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}${stale} (${date})`);
  }

  if (cache.staleEntries.length > 0) {
    lines.push(`\n* ${cache.staleEntries.length} entries flagged as stale (consider cleaning)*`);
  }

  return lines.join('\n');
}

/**
 * Reference an existing hot cache entry (prevents staleness)
 */
export async function referenceHotCacheEntry(
  entryId: string,
  projectPath?: string
): Promise<boolean> {
  const path = projectPath || await getProjectPath();
  if (!path) return false;

  const cache = await loadHotCache(path);
  const entry = cache.entries.find(e => e.id === entryId);
  
  if (entry) {
    entry.lastReferencedAt = Date.now();
    entry.referenceCount++;
    await saveHotCache(cache);
    return true;
  }
  
  return false;
}

/**
 * Remove stale entries from hot cache
 */
export async function cleanStaleEntries(projectPath?: string): Promise<number> {
  const path = projectPath || await getProjectPath();
  if (!path) return 0;

  const cache = await loadHotCache(path);
  const staleIdSet = new Set(cache.staleEntries);
  
  const originalCount = cache.entries.length;
  cache.entries = cache.entries.filter(e => !staleIdSet.has(e.id));
  cache.staleEntries = [];
  
  await saveHotCache(cache);
  
  const removed = originalCount - cache.entries.length;
  logger.info('[HotCache] Cleaned stale entries', { removed });
  
  return removed;
}

/**
 * Add session context to hot cache
 * Called from session hooks with key session information
 */
export async function addSessionContextToHotCache(
  sessionInfo: {
    activeFiles?: string[];
    commands?: string[];
    failures?: string[];
    decisions?: string[];
    hypotheses?: string[];
  },
  projectPath?: string
): Promise<HotCache> {
  const path = projectPath || await getProjectPath();
  if (!path) return createEmptyHotCache('');

  // Build context entries from session info
  const entries: string[] = [];
  
  if (sessionInfo.activeFiles?.length) {
    entries.push(`Active files: ${sessionInfo.activeFiles.join(', ')}`);
  }
  
  if (sessionInfo.commands?.length) {
    entries.push(`Recent commands: ${sessionInfo.commands.slice(-3).join('; ')}`);
  }
  
  if (sessionInfo.failures?.length) {
    entries.push(`Recent failures: ${sessionInfo.failures.slice(-2).join('; ')}`);
  }
  
  if (sessionInfo.decisions?.length) {
    entries.push(`Decisions: ${sessionInfo.decisions.join('; ')}`);
  }
  
  if (sessionInfo.hypotheses?.length) {
    entries.push(`Hypotheses: ${sessionInfo.hypotheses.slice(-2).join('; ')}`);
  }

  // Add each entry to hot cache
  let cache = await loadHotCache(path);
  for (const entry of entries) {
    cache = await addToHotCache(entry, { projectPath: path });
  }

  return cache;
}

/**
 * Get all hot cache entries (for advanced use)
 */
export async function getHotCacheEntries(
  projectPath?: string
): Promise<HotCacheEntry[]> {
  const path = projectPath || await getProjectPath();
  if (!path) return [];

  const cache = await loadHotCache(path);
  return cache.entries;
}

/**
 * Clear hot cache (dangerous - use with caution)
 */
export async function clearHotCache(projectPath?: string): Promise<void> {
  const path = projectPath || await getProjectPath();
  if (!path) return;

  const cache = createEmptyHotCache(path);
  await saveHotCache(cache);
  logger.info('[HotCache] Cleared');
}

/**
 * Get hot cache statistics
 */
export async function getHotCacheStats(projectPath?: string): Promise<{
  entries: number;
  staleEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}> {
  const path = projectPath || await getProjectPath();
  if (!path) return { entries: 0, staleEntries: 0, oldestEntry: null, newestEntry: null };

  const cache = await loadHotCache(path);
  
  if (cache.entries.length === 0) {
    return { entries: 0, staleEntries: 0, oldestEntry: null, newestEntry: null };
  }

  const timestamps = cache.entries.map(e => e.createdAt);
  
  return {
    entries: cache.entries.length,
    staleEntries: cache.staleEntries.length,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps),
  };
}