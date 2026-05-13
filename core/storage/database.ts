import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';

export interface DatabaseClient {
  $client: Database | Pool;
  $clientType: 'sqlite' | 'postgres';
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

export function createDatabaseClient(db: any): DatabaseClient {
  if (!db) {
    throw new Error('Database client is null or undefined');
  }
  const client = db.$client ?? db;
  const isSqlite = client && typeof client.prepare === 'function';
  return {
    $client: client,
    $clientType: isSqlite ? 'sqlite' : 'postgres',
    select: (...args: any[]) => db.select(...args),
    insert: (...args: any[]) => db.insert(...args),
    update: (...args: any[]) => db.update(...args),
    delete: (...args: any[]) => db.delete(...args),
  };
}
