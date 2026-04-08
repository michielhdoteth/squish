import Database from 'better-sqlite3';
import { getDataDir } from './dist/config.js';

const dbPath = `${getDataDir()}/squish.db`;
console.log(`Fixing schema for: ${dbPath}`);

const db = new Database(dbPath);

// Get current columns
const tableInfo = db.prepare("PRAGMA table_info(memories)").all();
const existingCols = new Set(tableInfo.map(col => col.name));

// All columns from Drizzle schema-sqlite.ts (in order, with snake_case names)
const allColumns = [
  { name: 'sector', type: "TEXT DEFAULT 'episodic'" },
  { name: 'tier', type: "TEXT DEFAULT 'hot'" },
  { name: 'context_status', type: "TEXT DEFAULT 'out-of-context'" },
  { name: 'decay_rate', type: 'INTEGER DEFAULT 30' },
  { name: 'coactivation_score', type: 'INTEGER DEFAULT 0' },
  { name: 'last_decay_at', type: 'INTEGER' },
  { name: 'agent_role', type: 'TEXT' },
  { name: 'is_pinned', type: 'INTEGER DEFAULT 0' },
  { name: 'is_immutable', type: 'INTEGER DEFAULT 0' },
  { name: 'write_scope', type: 'TEXT' },
  { name: 'read_scope', type: 'TEXT' },
  { name: 'triggered_by', type: 'TEXT' },
  { name: 'capture_reason', type: 'TEXT' },
  { name: 'last_used_at', type: 'INTEGER' },
  { name: 'usage_count', type: 'INTEGER DEFAULT 0' },
  { name: 'valid_from', type: 'INTEGER' },
  { name: 'valid_to', type: 'INTEGER' },
  { name: 'superseded_by', type: 'TEXT' },
  { name: 'version', type: 'INTEGER DEFAULT 1' },
];

let added = 0;
for (const col of allColumns) {
  if (!existingCols.has(col.name)) {
    console.log(`Adding: ${col.name}`);
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN ${col.name} ${col.type};`);
      added++;
    } catch (e) {
      console.log(`  ⚠️ ${e.message}`);
    }
  } else {
    console.log(`✅ ${col.name}`);
  }
}

db.close();
console.log(`✅ Added ${added} columns`);
