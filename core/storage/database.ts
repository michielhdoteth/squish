import type { Database } from 'better-sqlite3';

export interface DatabaseClient {
  $client: Database;
  $clientType: 'sqlite';
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
  return {
    $client: client,
    $clientType: 'sqlite',
    select: (...args: any[]) => db.select(...args),
    insert: (...args: any[]) => db.insert(...args),
    update: (...args: any[]) => db.update(...args),
    delete: (...args: any[]) => db.delete(...args),
  };
}
