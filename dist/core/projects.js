import { basename } from 'path';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { fromSqliteJson, toSqliteJson } from '../features/memory/serialization.js';
import { config } from '../config.js';
import { createDatabaseClient } from './database.js';
export async function getProjectByPath(path) {
    try {
        const db = createDatabaseClient(await getDb());
        const schema = await getSchema();
        const rows = await db.select().from(schema.projects).where(eq(schema.projects.path, path)).limit(1);
        const row = rows[0];
        if (!row)
            return null;
        return normalizeProject(row);
    }
    catch (error) {
        if (error.message?.includes('Database unavailable') ||
            error.message?.includes('not a valid Win32 application')) {
            return null; // Graceful degradation - database unavailable
        }
        throw error;
    }
}
export async function ensureProject(path) {
    if (!path)
        return null;
    const existing = await getProjectByPath(path);
    if (existing)
        return existing;
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const id = randomUUID();
    const name = basename(path) || path;
    const metadata = { source: 'mcp' };
    if (config.isTeamMode) {
        await db.insert(schema.projects).values({
            id,
            name,
            path,
            metadata,
        });
    }
    else {
        await db.insert(schema.projects).values({
            id,
            name,
            path,
            metadata: toSqliteJson(metadata),
        });
    }
    return { id, name, path, metadata };
}
function normalizeProject(row) {
    const metadata = config.isTeamMode ? row.metadata : fromSqliteJson(row.metadata);
    return {
        id: row.id,
        name: row.name,
        path: row.path,
        description: row.description ?? null,
        metadata,
    };
}
//# sourceMappingURL=projects.js.map