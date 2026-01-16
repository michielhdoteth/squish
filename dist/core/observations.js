import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
import { ensureProject, getProjectByPath } from './projects.js';
import { fromSqliteJson, toSqliteJson } from '../features/memory/serialization.js';
import { createDatabaseClient } from './database.js';
import { normalizeTimestamp, isDatabaseUnavailableError, prepareEmbedding } from './utils.js';
export async function createObservation(input) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const project = await ensureProject(input.project);
    const embedding = await getEmbedding(input.summary);
    const id = randomUUID();
    const baseValues = {
        id,
        projectId: project?.id ?? null,
        type: input.type,
        action: input.action,
        target: input.target ?? null,
        summary: input.summary,
    };
    const embeddingValues = prepareEmbedding(embedding);
    const detailsValue = config.isTeamMode ? input.details ?? null : toSqliteJson(input.details ?? null);
    await db.insert(schema.observations).values({
        ...baseValues,
        details: detailsValue,
        ...embeddingValues,
    });
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
        if (isDatabaseUnavailableError(error)) {
            return []; // Graceful degradation - database unavailable
        }
        throw error;
    }
}
export async function getRecentObservations(projectPath, limit = 10) {
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
        if (isDatabaseUnavailableError(error)) {
            return [];
        }
        console.error('[squish] Error getting recent observations:', error);
        return [];
    }
}
export async function getObservationById(observationId) {
    try {
        const db = createDatabaseClient(await getDb());
        const schema = await getSchema();
        const rows = await db.select().from(schema.observations)
            .where(eq(schema.observations.id, observationId))
            .limit(1);
        if (rows.length === 0)
            return null;
        return normalizeObservation(rows[0]);
    }
    catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return null;
        }
        console.error('[squish] Error getting observation:', error);
        return null;
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
//# sourceMappingURL=observations.js.map