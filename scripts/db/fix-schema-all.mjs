import Database from 'better-sqlite3';
import { getDataDir } from './dist/config.js';

const dbPath = `${getDataDir()}/squish.db`;
console.log(`Fixing schema for: ${dbPath}`);

const db = new Database(dbPath);

// Get current columns
const tableInfo = db.prepare("PRAGMA table_info(memories)").all();
const existingCols = new Set(tableInfo.map(col => col.name));
console.log('Existing columns:', Array.from(existingCols).join(', '));

// All columns from Drizzle schema
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
  { name: 'relevance_score', type: 'INTEGER DEFAULT 50' },
  { name: 'is_merged', type: 'INTEGER DEFAULT 0' },
  { name: 'merged_into_id', type: 'TEXT' },
  { name: 'merged_at', type: 'INTEGER' },
  { name: 'is_canonical', type: 'INTEGER DEFAULT 0' },
  { name: 'merge_source_ids', type: 'TEXT' },
  { name: 'is_mergeable', type: 'INTEGER DEFAULT 1' },
  { name: 'merge_version', type: 'INTEGER DEFAULT 1' },
];

let added = 0;
for (const col of neededColumns) {
  if (!existingCols.has(col.name)) {
    console.log(`Adding column: ${col.name}`);
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN ${col.name} ${col.type};`);
      console.log(`  ✅ Added ${col.name}`);
      added++;
    } catch (e) {
      console.log(`  ⚠️ ${e.message}`);
    }
  }
}

db.close();
console.log(`✅ Schema fix complete. Added ${added} columns.`);
