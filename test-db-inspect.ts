import { createDb } from './db/adapter.js';

async function inspectDb() {
  try {
    const db = await createDb();
    console.log('DB type:', typeof db);
    console.log('DB keys:', Object.keys(db));
    console.log('Has $client:', '$client' in db);
    console.log('Has drizzle:', 'drizzle' in db);
    
    // Check if it's a Drizzle instance with a _client or similar
    for (const key of Object.keys(db)) {
      console.log(`  ${key}:`, typeof db[key]);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectDb();
