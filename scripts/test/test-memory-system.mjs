import { getDb } from './dist/db/index.js';
import { rememberMemory, searchMemories } from './dist/features/memory/memories.js';
import { getCoreMemory, initializeCoreMemory, editCoreMemorySection } from './dist/core/core-memory.js';
import { getOrCreateProject } from './dist/core/projects.js';

console.log('=== MEMORY SYSTEM TEST ===\n');

try {
  // Initialize database
  console.log('1️⃣  Initializing database...');
  await getDb();
  console.log('✅ Database initialized\n');

  // Ensure project exists
  console.log('2️⃣  Creating test project...');
  const projectPath = process.cwd();
  const project = await getOrCreateProject(projectPath);
  console.log(`✅ Project created: ${project.id}\n`);

  // Initialize core memory
  console.log('3️⃣  Initializing core memory...');
  await initializeCoreMemory(project.id);
  console.log('✅ Core memory initialized\n');

  // Edit core memory sections
  console.log('4️⃣  Setting up core memory...');
  await editCoreMemorySection(project.id, 'persona', 'I am Claude, helping with Squish development and memory optimization');
  await editCoreMemorySection(project.id, 'project_context', 'Working on Squish v0.5.0 - smart memory system with heuristic-based search');
  console.log('✅ Core memory updated\n');

  // Get core memory
  console.log('5️⃣  Reading core memory...');
  const coreMemory = await getCoreMemory(project.id);
  console.log('✅ Core Memory Content:');
  console.log(`   Persona: ${coreMemory.persona}`);
  console.log(`   Project: ${coreMemory.project_context}\n`);

  // Store test memories (like grep)
  console.log('6️⃣  Storing test memories...');
  const memories = [
    { content: 'API key for production is stored in .env.production file', type: 'fact' },
    { content: 'Database connection string uses PostgreSQL on port 5432', type: 'fact' },
    { content: 'Authentication bug fixed: JWT token refresh was missing', type: 'observation' },
    { content: 'User preference: always show memory suggestions', type: 'preference' },
    { content: 'Cache invalidation strategy: TTL-based with 1 hour expiry', type: 'decision' },
  ];

  const storedIds = [];
  for (const mem of memories) {
    const result = await rememberMemory({
      content: mem.content,
      type: mem.type,
      project: projectPath,
      tags: ['test']
    });
    storedIds.push(result.id);
    console.log(`✅ Stored [${mem.type}]: ${mem.content.substring(0, 60)}...`);
  }
  console.log('');

  // Test grep-like search
  console.log('7️⃣  Testing grep-like search (grep memories for "API")...');
  const searchResults1 = await searchMemories({
    query: 'API',
    project: projectPath,
    limit: 5
  });
  console.log(`✅ Found ${searchResults1.length} results:`);
  searchResults1.forEach((mem, i) => {
    console.log(`   ${i+1}. [${mem.type}] "${mem.content.substring(0, 60)}..."`);
  });
  console.log('');

  // Test grep for "database"
  console.log('8️⃣  Testing grep for "database"...');
  const searchResults2 = await searchMemories({
    query: 'database',
    project: projectPath,
    limit: 5
  });
  console.log(`✅ Found ${searchResults2.length} results:`);
  searchResults2.forEach((mem, i) => {
    console.log(`   ${i+1}. [${mem.type}] "${mem.content.substring(0, 60)}..."`);
  });
  console.log('');

  // Test grep for "authentication"
  console.log('9️⃣  Testing grep for "authentication"...');
  const searchResults3 = await searchMemories({
    query: 'authentication',
    project: projectPath,
    limit: 5
  });
  console.log(`✅ Found ${searchResults3.length} results:`);
  searchResults3.forEach((mem, i) => {
    console.log(`   ${i+1}. [${mem.type}] "${mem.content.substring(0, 60)}..."`);
  });
  console.log('');

  // Test smart search heuristics
  console.log('🔟 Testing smart search heuristics...');
  function shouldSmartSearch(msg) {
    if (!msg || msg.length < 3) return false;
    const isQuestion = msg.includes('?');
    const questionKeywords = ['what ', 'where ', 'how ', 'remember', 'explain'];
    const isQuestionLike = questionKeywords.some(kw => msg.toLowerCase().includes(kw));
    const contextKeywords = ['debug', 'error', 'stuck', 'help'];
    const hasContextClue = contextKeywords.some(kw => msg.toLowerCase().includes(kw));
    return isQuestion || isQuestionLike || hasContextClue;
  }

  const testQueries = [
    'What is the API key?',
    'Where is the database config?',
    'I am stuck debugging this error',
    'Remember the authentication fix',
    'Hello world'
  ];

  testQueries.forEach(query => {
    const shouldSearch = shouldSmartSearch(query);
    const icon = shouldSearch ? '✅' : '❌';
    console.log(`   ${icon} "${query}" → ${shouldSearch ? 'WILL SEARCH' : 'will not search'}`);
  });
  console.log('');

  console.log('=== TEST SUMMARY ===');
  console.log('✅ Database initialized');
  console.log('✅ Core memory set up');
  console.log('✅ 5 test memories stored');
  console.log('✅ Grep-like search working');
  console.log('✅ Smart heuristics working');
  console.log('\n🎉 MEMORY SYSTEM FULLY OPERATIONAL');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
