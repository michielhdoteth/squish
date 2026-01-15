import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
export interface DatabaseClient {
    $client: Database | Pool;
    $clientType: 'sqlite' | 'postgres';
    select: (...args: any[]) => any;
    insert: (...args: any[]) => any;
}
export declare function createDatabaseClient(db: any): DatabaseClient;
//# sourceMappingURL=database.d.ts.map