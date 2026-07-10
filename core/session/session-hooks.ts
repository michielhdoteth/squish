/** Session Hooks - Lifecycle hooks for conversation management
 *
 * Provides functions to be called when sessions start/end
 */

import { sql, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import { bridgeSessionToGraph } from '../bridge/session-bridge.js';

/**
 * Called when a session ends
 * Marks the conversation as ended so self-iteration can process it
 */
export async function onSessionEnd(sessionId: string): Promise<void> {
  logger.info(`[SessionHooks] Session ended: ${sessionId}`);

  const db = await getDb();
  if (!db) {
    logger.warn('[SessionHooks] Database unavailable, cannot end session');
    return;
  }

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Mark conversation as ended
  await sqliteDb.update(schema.conversations)
    .set({ endedAt: new Date() })
    .where(eq(schema.conversations.sessionId, sessionId));

  // Bridge durable session memories to the permanent knowledge graph (non-blocking)
  bridgeSessionToGraph(sessionId).catch((error) => {
    logger.debug(`[SessionHooks] Session bridge failed for ${sessionId}: ${error}`);
  });

  logger.info(`[SessionHooks] Session ${sessionId} marked as ended`);
}

/**
 * Get active sessions for a project
 */
export async function getActiveSessions(projectId: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const sessions = await sqliteDb.select()
    .from(schema.conversations)
    .where(eq(schema.conversations.projectId, projectId))
    .where(sql`${schema.conversations.endedAt} IS NULL`);

  return sessions.map((s: any) => s.session_id);
}

/**
 * End all sessions for a project
 */
export async function endAllProjectSessions(projectId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const result = await sqliteDb.update(schema.conversations)
    .set({ endedAt: new Date() })
    .where(eq(schema.conversations.projectId, projectId));

  logger.info(`[SessionHooks] Ended ${result.rowCount} sessions for project ${projectId}`);
  return result.rowCount || 0;
}
