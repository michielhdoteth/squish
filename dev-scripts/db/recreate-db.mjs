import { createDb } from './dist/db/adapter.js';

async function main() {
  try {
    console.log('Creating database with proper schema...');
    await createDb();
    console.log('✅ Database recreated successfully');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  }
}

main();
