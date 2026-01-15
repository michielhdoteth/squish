import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { getProjectByPath } from '../../core/projects.js';
import { fromSqliteJson } from '../../features/memory/serialization.js';
import { createDatabaseClient } from '../../core/database.js';
export async function getEntitiesForProject(projectPath, limit) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const project = await getProjectByPath(projectPath);
    if (!project)
        return [];
    const rows = await db.select().from(schema.entities)
        .where(eq(schema.entities.projectId, project.id))
        .orderBy(desc(schema.entities.createdAt))
        .limit(limit);
    return rows.map((row) => normalizeEntity(row));
}
function normalizeEntity(row) {
    const properties = config.isTeamMode ? row.properties : fromSqliteJson(row.properties ?? null);
    return {
        id: row.id,
        projectId: row.projectId ?? row.project_id ?? null,
        name: row.name,
        type: row.type,
        description: row.description ?? null,
        properties,
        createdAt: normalizeTimestamp(row.createdAt ?? row.created_at),
        updatedAt: normalizeTimestamp(row.updatedAt ?? row.updated_at),
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
//# sourceMappingURL=entities.js.map