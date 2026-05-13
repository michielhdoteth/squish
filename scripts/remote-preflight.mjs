#!/usr/bin/env node

/**
 * Remote Preflight Check
 * 
 * Usage:
 *   node scripts/remote-preflight.mjs
 * 
 * Checks that required environment variables are set for remote mode.
 * Required: DATABASE_URL, REDIS_URL, SQUISH_REMOTE_TOKEN
 */

function checkEnv() {
  const required = ['DATABASE_URL', 'REDIS_URL', 'SQUISH_REMOTE_TOKEN'];
  const missing = [];
  
  for (const envVar of required) {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.error(`missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  const result = {
    success: true,
    mode: 'remote',
    checks: {
      database: !!process.env.DATABASE_URL,
      redis: !!process.env.REDIS_URL,
      token: !!process.env.SQUISH_REMOTE_TOKEN,
      embeddingsProvider: process.env.SQUISH_EMBEDDINGS_PROVIDER || 'local'
    }
  };
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

checkEnv();
