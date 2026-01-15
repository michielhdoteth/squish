import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { getProjectByPath } from '../../core/projects.js';
import { fromSqliteJson } from '../../features/memory/serialization.js';
import { createDatabaseClient } from '../../core/database.js';
export async function searchConversations(input) {
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 50);
    if (config.isTeamMode) {
        return await searchConversationsPostgres(input, limit);
    }
    return await searchConversationsSqlite(input, limit);
}
export async function getRecentConversations(input) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const limit = Math.min(Math.max(input.n ?? 3, 1), 50);
    const whereParts = [];
    if (input.project) {
        const project = await getProjectByPath(input.project);
        if (project) {
            whereParts.push(eq(schema.conversations.projectId, project.id));
        }
    }
    if (input.before) {
        whereParts.push(lte(schema.conversations.startedAt, new Date(input.before)));
    }
    if (input.after) {
        whereParts.push(gte(schema.conversations.startedAt, new Date(input.after)));
    }
    const query = whereParts.length
        ? db.select().from(schema.conversations).where(and(...whereParts)).orderBy(desc(schema.conversations.startedAt)).limit(limit)
        : db.select().from(schema.conversations).orderBy(desc(schema.conversations.startedAt)).limit(limit);
    const rows = await query;
    return rows.map((row) => normalizeConversation(row));
}
async function searchConversationsSqlite(input, limit) {
    const db = createDatabaseClient(await getDb());
    const sqlite = db.$client;
    const params = [input.query];
    let where = 'messages_fts MATCH ?';
    if (input.role) {
        where += ' AND m.role = ?';
        params.push(input.role);
    }
    params.push(limit);
    const statement = sqlite.prepare(`
    SELECT DISTINCT
      c.id as id,
      c.project_id as projectId,
      c.session_id as sessionId,
      c.title as title,
      c.summary as summary,
      c.message_count as messageCount,
      c.token_count as tokenCount,
      c.started_at as startedAt,
      c.ended_at as endedAt,
      c.metadata as metadata
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    JOIN messages_fts ON messages_fts.rowid = m.rowid
    WHERE ${where}
    ORDER BY c.started_at DESC
    LIMIT ?
  `);
    const rows = statement.all(...params);
    return rows.map((row) => normalizeConversation(row));
}
async function searchConversationsPostgres(input, limit) {
    const db = createDatabaseClient(await getDb());
    const values = [`%${input.query}%`];
    const whereParts = [`m.content ILIKE $1`];
    if (input.role) {
        values.push(input.role);
        whereParts.push(`m.role = $${values.length}`);
    }
    values.push(limit);
    const rows = await db.$client.query(`SELECT DISTINCT ON (c.id)
      c.id as "id",
      c.project_id as "projectId",
      c.session_id as "sessionId",
      c.title as "title",
      c.summary as "summary",
      c.message_count as "messageCount",
      c.token_count as "tokenCount",
      c.started_at as "startedAt",
      c.ended_at as "endedAt",
      c.metadata as "metadata"
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    WHERE ${whereParts.join(' AND ')}
    ORDER BY c.id, c.started_at DESC
    LIMIT $${values.length}`, values);
    return rows.rows.map((row) => normalizeConversation(row));
}
function normalizeConversation(row) {
    const metadata = config.isTeamMode ? row.metadata : fromSqliteJson(row.metadata ?? null);
    return {
        id: row.id,
        projectId: row.projectId ?? row.project_id ?? null,
        sessionId: row.sessionId ?? row.session_id,
        title: row.title ?? null,
        summary: row.summary ?? null,
        messageCount: row.messageCount ?? row.message_count ?? null,
        tokenCount: row.tokenCount ?? row.token_count ?? null,
        startedAt: normalizeTimestamp(row.startedAt ?? row.started_at),
        endedAt: normalizeTimestamp(row.endedAt ?? row.ended_at),
    };
}
function normalizeTimestamp(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'number')
        return new Date(value * 1000).toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
//# sourceMappingURL=conversations.js.map