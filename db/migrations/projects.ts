import type { Database } from 'better-sqlite3';
import { migrateTable } from '../schema/generator.js';
import { projectsSchema, usersSchema } from '../schema/projects.js';

export async function runProjectMigrations(sqlite: Database): Promise<void> {
  const projectCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
  ).get() as { name: string } | undefined;

  if (projectCheck) {
    await migrateTable(sqlite, projectsSchema);
  }

  const userCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
  ).get() as { name: string } | undefined;

  if (userCheck) {
    await migrateTable(sqlite, usersSchema);
  }
}
