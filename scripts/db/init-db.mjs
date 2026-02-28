import { createDb } from './dist/db/adapter.js';

async function main() {
  try {
    await createDb();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    process.exit(1);
  }
}

main();
