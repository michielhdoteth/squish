import { default as SQLite } from 'bun:sqlite';

// Test the FIXED logic
const db = new SQLite(':memory:');

// Create a FRESH database - only projects and namespaces, NO memories table
db.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  );
  
  CREATE TABLE namespaces (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    path TEXT,
    description TEXT,
    parent_id TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
`);

console.log('=== Testing FIXED logic (no memories table) ===');

// This is what runSqliteMigrations does NOW (after fix):
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'").get();

if (tableCheck) {
  console.log('Would run memories migrations...');
} else {
  console.log('Skipping memories migrations (table not exists)');
}

// Run namespaces migration (NOW outside the memories check)
console.log('\n=== Running namespaces migration ===');
const namespacesTableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='namespaces'").get();
if (namespacesTableCheck) {
  const namespacesInfo = db.prepare("PRAGMA table_info(namespaces)").all() as Array<{name: string}>;
  const existingNamespacesColumns = new Set(namespacesInfo.map(col => col.name));
  console.log('Existing columns:', [...existingNamespacesColumns]);
  
  if (!existingNamespacesColumns.has('type')) {
    console.log('Adding type column...');
    try {
      db.exec("ALTER TABLE namespaces ADD COLUMN type TEXT NOT NULL DEFAULT 'custom'");
      console.log('SUCCESS');
    } catch (e) {
      console.log('FAILED:', e.message);
    }
  }
}

// Verify
console.log('\n=== Final state ===');
const info = db.query("PRAGMA table_info(namespaces)").all();
console.log('Has type column:', info.some((c: any) => c.name === 'type'));

db.close();