import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
export declare function ensureSqliteSchema(sqlite: Database): Promise<void>;
export declare function ensurePostgresSchema(pool: Pool): Promise<void>;
//# sourceMappingURL=bootstrap.d.ts.map