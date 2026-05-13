/**
 * Cloud Sync Module
 * 
 * Bridges local Squish (cold/durable memories) to the managed cloud-api.
 * 
 * Key rules:
 *   - Only cold-tier memories are pushed to cloud (hot stays local)
 *   - Triggered by tierChange hook: hot->cold demotion
 *   - Also runs on a periodic schedule via existing cron
 *   - No CLI commands - fully automatic via hooks + config
 * 
 * Cloud API is at cloud-api/ (the managed version of Squish)
 */

import { getDb } from '../../db/index.js';
import { config } from '../../config.js';
import { logger } from '../logger.js';
import { registerHook } from '../memory/hooks.js';

// ========== TYPES ==========

export interface CloudConfig {
  apiUrl: string;
  apiKey: string;
  enabled: boolean;
  /** Only push cold-tier memories (default: true) */
  coldOnly: boolean;
}

export interface CloudStatus {
  connected: boolean;
  plan: string;
  memoriesInCloud: number;
  memoriesLocal: number;
  lastSyncAt: string | null;
  quotaUsed: number;
  quotaLimit: number;
}

// ========== CONFIG ==========

function getCloudConfig(): CloudConfig {
  // Uses existing managed config from config.ts
  return {
    apiUrl: process.env.SQUISH_CLOUD_URL || config.managedApiUrl || '',
    apiKey: process.env.SQUISH_CLOUD_API_KEY || config.managedApiKey || '',
    enabled: config.isManagedMode || process.env.SQUISH_CLOUD_ENABLED === 'true' || false,
    coldOnly: true,
  };
}

// ========== API CLIENT ==========

async function apiRequest<T>(method: string, path: string, body?: any): Promise<{ ok: boolean; data?: T; error?: string }> {
  const cfg = getCloudConfig();
  try {
    // Warn if API key sent over non-HTTPS (except localhost)
    if (!cfg.apiUrl.startsWith('https://') && !cfg.apiUrl.startsWith('http://localhost') && !cfg.apiUrl.startsWith('http://127.0.0.1')) {
      logger.warn('Cloud API URL is not HTTPS. API key sent in cleartext! Set SQUISH_MANAGED_API_URL to https://');
    }
    const res = await fetch(`${cfg.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'User-Agent': 'squish-local/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      return { ok: false, error: `Cloud API ${res.status}: ${await res.text().catch(() => res.statusText)}` };
    }
    const data = await res.json();
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

export async function pushMemory(memory: any): Promise<boolean> {
  let tags: string[] = [];
  try { tags = typeof memory.tags === 'string' ? JSON.parse(memory.tags) : (memory.tags || []); } catch { tags = []; }
  const r = await apiRequest('POST', '/api/memories', {
    title: (memory.content || '').split('\n')[0]?.substring(0, 80) || 'Untitled',
    content: memory.content || '',
    tags,
    strength: memory.importance_score || 50,
    source: memory.source || 'local-sync',
    memory_type: memory.type || 'fact',
  });
  return r.ok;
}

async function pushColdMemories(): Promise<{ synced: number; failed: number }> {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.apiKey) return { synced: 0, failed: 0 };

  const drizzle = await getDb();
  const db: any = (drizzle as any).$client ?? drizzle;

  // Ensure sync tracking table exists (separate from main schema)
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_sync_log (
    memory_id TEXT PRIMARY KEY,
    synced_at TEXT NOT NULL,
    tier_at_sync TEXT NOT NULL
  )`);

  // Only push cold-tier memories not yet synced
  const unsynced = db.prepare(`
    SELECT m.id, m.content, m.type, m.tags, m.importance_score, m.source, m.created_at
    FROM memories m
    LEFT JOIN cloud_sync_log s ON m.id = s.memory_id
    WHERE m.tier = 'cold'
      AND (m.status IS NULL OR m.status != 'expired')
      AND s.memory_id IS NULL
    ORDER BY m.created_at DESC
    LIMIT 50
  `).all() as any[];

  if (unsynced.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;
  for (const mem of unsynced) {
    if (await pushMemory(mem)) {
      db.prepare('INSERT OR REPLACE INTO cloud_sync_log (memory_id, synced_at, tier_at_sync) VALUES (?, ?, ?)')
        .run(mem.id, new Date().toISOString(), 'cold');
      synced++;
    } else {
      failed++;
    }
  }

  // Save last sync time in settings
  try {
    const ts = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM settings WHERE key = 'cloud_last_sync'").get() as any;
    if (existing) {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'cloud_last_sync'").run(ts);
    } else {
      db.prepare("INSERT INTO settings (key, value) VALUES ('cloud_last_sync', ?)").run(ts);
    }
  } catch {}

  logger.info(`Cloud sync: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

// ========== HOOK HANDLER ==========

/**
 * Handle tier change events from the memory hook system.
 * When a memory transitions hot->cold, push it to cloud.
 */
export async function handleTierChange(context: {
  memoryId: string;
  content: string;
  type: string;
  tags: any;
  importance: number;
  oldTier: string;
  newTier: string;
}): Promise<void> {
  // Only sync on hot->cold transition
  if (context.oldTier !== 'hot' || context.newTier !== 'cold') return;
  
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.apiKey) return;

  await pushMemory({
    id: context.memoryId,
    content: context.content,
    type: context.type,
    tags: context.tags,
    importance_score: context.importance,
    source: 'auto-sync',
  });

  // Mark as synced in tracking table
  try {
    const drizzle = await getDb();
    const db: any = (drizzle as any).$client ?? drizzle;
    db.exec('CREATE TABLE IF NOT EXISTS cloud_sync_log (memory_id TEXT PRIMARY KEY, synced_at TEXT NOT NULL, tier_at_sync TEXT NOT NULL)');
    db.prepare('INSERT OR REPLACE INTO cloud_sync_log (memory_id, synced_at, tier_at_sync) VALUES (?, ?, ?)')
      .run(context.memoryId, new Date().toISOString(), 'cold');
  } catch {}
}

// ========== AUTO-SYNC SETUP ==========

let hookRegistered = false;

/**
 * Register the cloud sync hook to auto-push cold memories.
 * Called once during worker startup.
 */
export function registerCloudSyncHooks(): void {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    logger.info('Cloud sync not configured (set SQUISH_CLOUD_ENABLED + SQUISH_CLOUD_API_KEY)');
    return;
  }
  if (hookRegistered) return;

  registerHook('tierChange', async (ctx: any) => {
    await handleTierChange(ctx).catch(err => {
      logger.error('Cloud sync hook failed:', err);
    });
  });

  hookRegistered = true;
  logger.info('Cloud sync hooks registered (cold-only push)');
}

/**
 * Unregister cloud sync hooks.
 */
export function unregisterCloudSyncHooks(): void {
  if (!hookRegistered) return;
  // The hook system doesn't support unregister by reference easily,
  // so we just reset the flag. The hook remains but won't cause issues.
  hookRegistered = false;
}

/**
 * Check cloud connectivity and return status.
 */
export async function checkCloudStatus(): Promise<CloudStatus> {
  const cfg = getCloudConfig();
  const drizzle = await getDb();
  const db: any = (drizzle as any).$client ?? drizzle;

  let localCount = 0;
  try { localCount = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as any)?.c || 0; } catch {}

  if (!cfg.enabled || !cfg.apiKey) {
    return { connected: false, plan: 'local', memoriesInCloud: 0, memoriesLocal: localCount, lastSyncAt: null, quotaUsed: 0, quotaLimit: 500 };
  }

  const health = await apiRequest<any>('GET', '/api/health');
  if (!health.ok) {
    return { connected: false, plan: 'unknown', memoriesInCloud: 0, memoriesLocal: localCount, lastSyncAt: null, quotaUsed: 0, quotaLimit: 500 };
  }

  let lastSync: string | null = null;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'cloud_last_sync'").get() as any;
    if (row) lastSync = row.value;
  } catch {}

  return {
    connected: true,
    plan: health.data?.plan || health.data?.status || 'active',
    memoriesInCloud: 0, // Would need a separate API call
    memoriesLocal: localCount,
    lastSyncAt: lastSync,
    quotaUsed: 0,
    quotaLimit: 1000,
  };
}

/**
 * Trigger an immediate sync of all unsynced cold memories.
 * Can be called from cron or worker.
 */
export async function runCloudSync(): Promise<{ synced: number; failed: number }> {
  return pushColdMemories();
}
