import type { Database } from 'better-sqlite3';
export interface DatabaseClient {
    $client: Database;
    $clientType: 'sqlite';
    select: (...args: any[]) => any;
    insert: (...args: any[]) => any;
    update: (...args: any[]) => any;
    delete: (...args: any[]) => any;
}
export declare function createDatabaseClient(db: any): DatabaseClient;
//# sourceMappingURL=database.d.ts.map