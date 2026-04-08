import Database from 'better-sqlite3';
import { getDataDir } from './dist/config.js';

const dbPath = `${getDataDir()}/squish.db`;
console.log(`Fixing schema for: ${dbPath}`);

const db = new Database(dbPath);

// Get current columns in memories table
const tableInfo = db.prepare("PRAGMA table_info(memories)").all();
const existingCols = new Set(tableInfo.map(col => col.name));

// Columns needed by Drizzle schema but might be missing
const neededColumns = [
  { name: 'embedding', type: 'BLOB' },
  { name: 'is_private', type: 'INTEGER DEFAULT 0' },
  { name: 'has_secrets', type: 'INTEGER DEFAULT 0' },
  { name: 'is_protected', type: 'INTEGER DEFAULT 0' },
  { name: 'is_active', type: 'INTEGER DEFAULT 1' },
  { name: 'access_count', type: 'INTEGER DEFAULT 0' },
  { name: 'last_accessed_at', type: 'INTEGER' },
  { name: 'expires_at', type: 'INTEGER' },
  { name: 'confidence', type: 'INTEGER DEFAULT 100' },
  { name: 'source', type: 'TEXT' },
  { name: 'summary', type: 'TEXT' },
  { name: 'user_id', type: 'TEXT' },
  { name: 'agent_id', type: 'TEXT' },
  { name: 'visibility_scope', type: 'TEXT DEFAULT \'private\'' },
];

for (const col of neededColumns) {
  if (!existingCols.has(col.name)) {
    console.log(`Adding column: ${col.name}`);
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN ${col.name} ${col.type};`);
      console.log(`  ✅ Added ${col.name}`);
    } catch (e) {
      console.log(`  ⚠️ ${e.message}`);
    }
  } else {
    console.log(`✅ ${col.name} already exists`);
  }
}

db.close();
console.log('✅ Schema fix complete');
