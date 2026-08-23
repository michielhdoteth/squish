import type { Database } from 'better-sqlite3';

export interface DatabaseClient {
  $client: Database;
  $clientType: 'sqlite';
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

async function rawExec(client: any, sql: string): Promise<void> {
  if (typeof client.exec === 'function') {
    client.exec(sql);
    return;
  }
  if (typeof client.query === 'function') {
    await client.query(sql);
    return;
  }
  if (typeof client.run === 'function') {
    client.run(sql);
    return;
  }
  if (typeof client.prepare === 'function') {
    const stmt = client.prepare(sql);
    if (typeof stmt.run === 'function') {
      stmt.run();
      return;
    }
  }
  throw new Error(`Cannot execute "${sql}": no compatible execution method on database client`);
}

/**
 * Runs fn inside a SQLite/Postgres transaction using the underlying client.
 * Falls back to running without a transaction if the driver cannot execute
 * transaction control statements.
 */
export async function runInTransaction<T>(
  db: any,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  const client = (db as any)?.$client ?? db;

  let began = false;
  try {
    await rawExec(client, 'BEGIN');
    began = true;
  } catch {
    // Driver does not support manual transaction control; proceed without one
  }

  try {
    const result = await fn(db);
    if (began) {
      await rawExec(client, 'COMMIT');
    }
    return result;
  } catch (error) {
    if (began) {
      try {
        await rawExec(client, 'ROLLBACK');
      } catch {
        // ignore rollback failures
      }
    }
    throw error;
  }
}

export function createDatabaseClient(db: any): DatabaseClient {
  if (!db) {
    throw new Error('Database client is null or undefined');
  }
  const client = db.$client ?? db;
  return {
    $client: client,
    $clientType: 'sqlite',
    select: (...args: any[]) => db.select(...args),
    insert: (...args: any[]) => db.insert(...args),
    update: (...args: any[]) => db.update(...args),
    delete: (...args: any[]) => db.delete(...args),
  };
}
