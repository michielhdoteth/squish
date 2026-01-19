import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '.squish', 'squish.db');

console.log('=== DATABASE STATUS ===\n');

try {
  const db = new Database(dbPath);

  // Get all tables
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `).all();

  console.log(`📊 Total Tables: ${tables.length}`);
  tables.forEach(t => console.log(`   - ${t.name}`));
  console.log('');

  // Get memory counts
  console.log('📝 Memory Storage:\n');

  const memoriesCount = db.prepare('SELECT COUNT(*) as count FROM memories').get();
  console.log(`✅ Memories: ${memoriesCount.count}`);

  const conversationsCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
  console.log(`✅ Conversations: ${conversationsCount.count}`);

  const observationsCount = db.prepare('SELECT COUNT(*) as count FROM observations').get();
  console.log(`✅ Observations: ${observationsCount.count}`);

  const coreMemoryCount = db.prepare('SELECT COUNT(*) as count FROM core_memory').get();
  console.log(`✅ Core Memory Sections: ${coreMemoryCount.count}`);

  console.log('\n');

  // Show recent memories (if any exist)
  if (memoriesCount.count > 0) {
    console.log('📚 Recent Memories:\n');
    const recentMemories = db.prepare(`
      SELECT id, type, content, createdAt
      FROM memories
      ORDER BY createdAt DESC
      LIMIT 5
    `).all();

    recentMemories.forEach((mem, i) => {
      const content = mem.content.substring(0, 100) + (mem.content.length > 100 ? '...' : '');
      const date = new Date(mem.createdAt).toLocaleString();
      const memId = String(mem.id).substring(0, 8);
      console.log(`${i+1}. [${mem.type}] ${date}`);
      console.log(`   "${content}"`);
      console.log(`   ID: ${memId}...`);
      console.log('');
    });
  } else {
    console.log('📚 No memories stored yet\n');
  }

  // Show core memory content
  console.log('🧠 Core Memory Content:\n');
  const coreMemSections = db.prepare(`
    SELECT section, content, version
    FROM core_memory
    ORDER BY section
  `).all();

  coreMemSections.forEach(section => {
    const content = section.content || '(empty)';
    console.log(`${section.section.toUpperCase()}: v${section.version}`);
    if (content !== '(empty)') {
      console.log(`  ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`);
    } else {
      console.log(`  ${content}`);
    }
    console.log('');
  });

  db.close();

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
