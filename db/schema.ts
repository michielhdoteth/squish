import { config } from '../config.js';

export type SchemaModule = typeof import('../drizzle/schema.js') | typeof import('../drizzle/schema-sqlite.js');

let cachedSchema: SchemaModule | null = null;

export async function getSchema(): Promise<SchemaModule> {
  if (cachedSchema) return cachedSchema;
  cachedSchema = config.isTeamMode
    ? await import('../drizzle/schema.js')
    : await import('../drizzle/schema-sqlite.js');
  return cachedSchema;
}
