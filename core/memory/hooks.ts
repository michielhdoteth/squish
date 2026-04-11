/**
 * Memory Lifecycle Hooks
 * 
 * Provides event hooks for memory operations:
 * - memoryCreated: When a memory is stored (DB or wiki)
 * - memoryUpdated: When a memory is updated
 * - memoryDeleted: When a memory is deleted
 * - tierChange: When memory tier changes (hot/warm/cold)
 * - decayApplied: When decay score is updated
 * 
 * Each hook can have sync and async handlers.
 * Usage: Register handlers to auto-capture, sync to external systems, etc.
 */

import { logger } from '../logger.js';

export type HookEvent = 
  | 'memoryCreated' 
  | 'memoryUpdated' 
  | 'memoryDeleted' 
  | 'tierChange' 
  | 'decayApplied';

export interface MemoryHookContext {
  memoryId: string;
  content: string;
  type: string;
  tags: string[];
  project?: string;
  source?: string;
  tier?: string;
  importance?: number;
  oldContent?: string;  // For memoryUpdated events
}

export interface TierChangeContext extends MemoryHookContext {
  oldTier: string;
  newTier: string;
}

export interface DecayContext extends MemoryHookContext {
  oldScore: number;
  newScore: number;
}

export type HookHandler<T = MemoryHookContext> = (context: T) => void | Promise<void>;

interface HookRegistration {
  event: HookEvent;
  handler: HookHandler;
  priority: number;
}

// Global hook registry
const hooks: HookRegistration[] = [];

/**
 * Register a hook handler for a specific event
 */
export function registerHook(
  event: HookEvent, 
  handler: HookHandler,
  priority: number = 100
): void {
  hooks.push({ event, handler, priority });
  hooks.sort((a, b) => b.priority - a.priority);
  logger.info('[Hooks] Registered handler for: ' + event + ' (priority: ' + priority + ')');
}

/**
 * Unregister a hook handler
 */
export function unregisterHook(event: HookEvent, handler: HookHandler): void {
  const idx = hooks.findIndex(h => h.event === event && h.handler === handler);
  if (idx !== -1) {
    hooks.splice(idx, 1);
    logger.info('[Hooks] Unregistered handler for: ' + event);
  }
}

/**
 * Clear all hooks for an event
 */
export function clearHooks(event?: HookEvent): void {
  if (event) {
    const before = hooks.length;
    const filtered = hooks.filter(h => h.event !== event);
    hooks.length = 0;
    hooks.push(...filtered);
    logger.info('[Hooks] Cleared ' + (before - filtered.length) + ' hooks for: ' + event);
  } else {
    const count = hooks.length;
    hooks.length = 0;
    logger.info('[Hooks] Cleared all ' + count + ' hooks');
  }
}

/**
 * Get registered hooks for an event
 */
export function getHooks(event: HookEvent): HookHandler[] {
  return hooks.filter(h => h.event === event).map(h => h.handler);
}

/**
 * List all registered hooks (for debugging)
 */
export function listHooks(): { event: HookEvent; priority: number }[] {
  return hooks.map(h => ({ event: h.event, priority: h.priority }));
}

// --- Trigger functions ---

/**
 * Trigger memoryCreated hooks
 * Called when a memory is stored in DB or wiki
 */
export async function triggerMemoryCreated(context: MemoryHookContext): Promise<void> {
  const handlers = getHooks('memoryCreated');
  
  for (const handler of handlers) {
    try {
      const result = handler(context);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      logger.error('[Hooks] Error in memoryCreated handler: ' + error);
    }
  }
}

/**
 * Trigger memoryUpdated hooks
 * Called when a memory content/tags/etc changes
 */
export async function triggerMemoryUpdated(
  context: MemoryHookContext, 
  oldContent?: string
): Promise<void> {
  const handlers = getHooks('memoryUpdated');
  
  for (const handler of handlers) {
    try {
      const result = handler({ ...context, oldContent: oldContent || '' });
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      logger.error('[Hooks] Error in memoryUpdated handler: ' + error);
    }
  }
}

/**
 * Trigger memoryDeleted hooks
 * Called when a memory is deleted
 */
export async function triggerMemoryDeleted(context: MemoryHookContext): Promise<void> {
  const handlers = getHooks('memoryDeleted');
  
  for (const handler of handlers) {
    try {
      const result = handler(context);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      logger.error('[Hooks] Error in memoryDeleted handler: ' + error);
    }
  }
}

/**
 * Trigger tierChange hooks
 * Called when memory tier changes
 */
export async function triggerTierChange(context: TierChangeContext): Promise<void> {
  const handlers = getHooks('tierChange');
  
  for (const handler of handlers) {
    try {
      const result = handler(context);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      logger.error('[Hooks] Error in tierChange handler: ' + error);
    }
  }
}

/**
 * Trigger decayApplied hooks
 * Called when memory decay score changes
 */
export async function triggerDecayApplied(context: DecayContext): Promise<void> {
  const handlers = getHooks('decayApplied');
  
  for (const handler of handlers) {
    try {
      const result = handler(context);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      logger.error('[Hooks] Error in decayApplied handler: ' + error);
    }
  }
}

/**
 * Built-in hook: Auto-save to wiki when storing to DB
 * Use this to have dual storage (DB + markdown files)
 */
export function createWikiAutoSyncHook() {
  return async function wikiAutoSync(context: MemoryHookContext) {
    if (context.tier === 'hot') {
      const { saveToWiki } = await import('../wiki/wiki-storage.js');
      await saveToWiki({
        content: context.content,
        type: context.type as any,
        tags: context.tags,
        project: context.project,
        source: context.source,
      });
      logger.info('[Hooks] Auto-synced memory to wiki: ' + context.memoryId);
    }
  };
}