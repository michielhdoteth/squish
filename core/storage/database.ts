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
  const isSqlite = typeof (db.$client as any).prepare === 'function';
  return {
    $client: db.$client,
    $clientType: isSqlite ? 'sqlite' : 'postgres',
    select: (...args: any[]) => db.select(...args),
    insert: (...args: any[]) => db.insert(...args),
    update: (...args: any[]) => db.update(...args),
    delete: (...args: any[]) => db.delete(...args),
  };
}
