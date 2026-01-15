import { config } from '../config.js';
let cachedSchema = null;
export async function getSchema() {
    if (cachedSchema)
        return cachedSchema;
    cachedSchema = config.isTeamMode
        ? await import('../drizzle/schema.js')
        : await import('../drizzle/schema-sqlite.js');
    return cachedSchema;
}
//# sourceMappingURL=schema.js.map