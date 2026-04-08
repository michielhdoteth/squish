import Database from 'better-sqlite3';
import { getDataDir } from './dist/config.js';

const dbPath = `${getDataDir()}/squish.db`;
console.log(`Fixing schema for: ${dbPath}`);

const db = new Database(dbPath);

// Check if embedding column exists
const tableInfo = db.prepare("PRAGMA table_info(memories)").all();
const hasEmbedding = tableInfo.some(col => col.name === 'embedding');

if (!hasEmbedding) {
  console.log('Adding missing embedding column...');
  db.exec(`ALTER TABLE memories ADD COLUMN embedding BLOB;`);
  console.log('✅ Added embedding column');
} else {
  console.log('✅ embedding column already exists');
}

// Check other tables that might need the embedding column
const tables = ['observations', 'messages', 'entities'];
for (const table of tables) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasCol = info.some(col => col.name === 'embedding');
  if (!hasCol) {
    console.log(`Adding embedding column to ${table}...`);
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN embedding BLOB;`);
      console.log(`✅ Added embedding column to ${table}`);
    } catch (e) {
      console.log(`⚠️ Could not add to ${table}: ${e.message}`);
    }
  }
}

db.close();
console.log('✅ Schema fix complete');
