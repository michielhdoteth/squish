export type SchemaModule = typeof import('./drizzle/schema-sqlite.js');

let cachedSchema: SchemaModule | null = null;

export function clearSchemaCache(): void {
  cachedSchema = null;
}

export async function getSchema(): Promise<SchemaModule> {
  if (cachedSchema) return cachedSchema;
  cachedSchema = await import('./drizzle/schema-sqlite.js');
  return cachedSchema;
}
