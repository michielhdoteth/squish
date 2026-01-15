import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
import { ensureProject, getProjectByPath } from '../features/search/entities.js';
import { fromSqliteJson, toSqliteJson } from '../features/memory/serialization.js';
import { createDatabaseClient } from './database.js';
export async function createObservation(input) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const project = await ensureProject(input.project);
    const embedding = await getEmbedding(input.summary);
    const id = randomUUID();
    if (config.isTeamMode) {
        await db.insert(schema.observations).values({
            id,
            projectId: project?.id ?? null,
            type: input.type,
            action: input.action,
            target: input.target ?? null,
            summary: input.summary,
            details: input.details ?? null,
            embedding: embedding ?? null,
        });
    }
    else {
        await db.insert(schema.observations).values({
            id,
            projectId: project?.id ?? null,
            type: input.type,
            action: input.action,
            target: input.target ?? null,
            summary: input.summary,
            details: toSqliteJson(input.details ?? null),
            embeddingJson: toSqliteJson(embedding ?? null),
        });
    }
    return {
        id,
        projectId: project?.id ?? null,
        conversationId: null,
        type: input.type,
        action: input.action,
        target: input.target ?? null,
        summary: input.summary,
        details: input.details ?? null,
    };
}
export async function getObservationsForProject(projectPath, limit) {
    try {
        const db = createDatabaseClient(await getDb());
        const schema = await getSchema();
        const project = await getProjectByPath(projectPath);
        if (!project)
            return [];
        const rows = await db.select().from(schema.observations)
            .where(eq(schema.observations.projectId, project.id))
            .orderBy(desc(schema.observations.createdAt))
            .limit(limit);
        return rows.map((row) => normalizeObservation(row));
    }
    catch (error) {
        if (error.message?.includes('Database unavailable') ||
            error.message?.includes('not a valid Win32 application')) {
            return []; // Graceful degradation - database unavailable
        }
        throw error;
    }
}
function normalizeObservation(row) {
    const details = config.isTeamMode ? row.details : fromSqliteJson(row.details ?? null);
    return {
        id: row.id,
        projectId: row.projectId ?? row.project_id ?? null,
        conversationId: row.conversationId ?? row.conversation_id ?? null,
        type: row.type,
        action: row.action,
        target: row.target ?? null,
        summary: row.summary,
        details,
        createdAt: normalizeTimestamp(row.createdAt ?? row.created_at),
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
//# sourceMappingURL=observations.js.map