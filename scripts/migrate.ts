#!/usr/bin/env node

/**
 * Migration script for Squish v1.1.0
 * 
 * Run with: node dist/scripts/migrate.js
 * 
 * This script:
 * 1. Adds new columns to memories table
 * 2. Back-fills decay_rate based on memory type
 * 3. Sets status='active' for existing rows
 * 4. Generates salt file for encryption
 */

import 'dotenv/config';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { randomBytes, createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

const DECAY_RATES: Record<string, number> = {
  episodic: 0.07,
  semantic: 0.02,
  procedural: 0.03,
  self_model: 0.01,
  introspective: 0.02,
  observation: 0.05,
  fact: 0.03,
  decision: 0.02,
  context: 0.04,
  preference: 0.03,
  note: 0.05,
  reflection: 0.02,
};

async function migrate() {
  console.log('Starting migration to v1.1.0...\n');
  
  const db = await getDb();
  const schema = await getSchema();
  const sqliteDb = db as any;
  
  // 1. Add new columns if they don't exist
  const migrations = [
    { col: 'status', sql: 'ALTER TABLE memories ADD COLUMN status TEXT DEFAULT "active"' },
    { col: 'decay_rate', sql: 'ALTER TABLE memories ADD COLUMN decay_rate REAL DEFAULT 0.03' },
    { col: 'encrypted_content', sql: 'ALTER TABLE memories ADD COLUMN encrypted_content TEXT' },
    { col: 'encryption_nonce', sql: 'ALTER TABLE memories ADD COLUMN encryption_nonce TEXT' },
    { col: 'is_encrypted', sql: 'ALTER TABLE memories ADD COLUMN is_encrypted INTEGER DEFAULT 0' },
    { col: 'last_decay_at', sql: 'ALTER TABLE memories ADD COLUMN last_decay_at INTEGER DEFAULT (strftime(\'%s\',\'now\'))' },
  ];
  
  try {
    const tableInfo = sqliteDb.prepare("PRAGMA table_info(memories)").all() as Array<{name: string}>;
    const existingColumns = new Set(tableInfo.map(col => col.name));
    
    for (const migration of migrations) {
      if (!existingColumns.has(migration.col)) {
        try {
          sqliteDb.exec(migration.sql);
          console.log(`✓ Added column: ${migration.col}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('duplicate column name')) {
            console.log(`  - Column already exists: ${migration.col}`);
          } else {
            throw error;
          }
        }
      } else {
        console.log(`  - Column already exists: ${migration.col}`);
      }
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  // 2. Back-fill decay_rate based on memory type
  console.log('\nBack-filling decay_rate based on memory type...');
  try {
    const memories = await sqliteDb.select().from(schema.memories);
    let updated = 0;
    
    for (const memory of memories) {
      const type = memory.type || 'observation';
      const decayRate = DECAY_RATES[type] || 0.03;
      
      if (memory.decayRate === undefined || memory.decayRate === null) {
        await sqliteDb
          .update(schema.memories)
          .set({ decayRate })
          .where((schema.memories as any).id.eq(memory.id));
        updated++;
      }
    }
    console.log(`✓ Updated ${updated} memories with decay rates`);
  } catch (error) {
    console.warn('Warning: Could not back-fill decay_rate:', error);
  }
  
  // 3. Ensure status='active' for existing rows
  console.log('\nEnsuring status=active for all memories...');
  try {
    await sqliteDb
      .update(schema.memories)
      .set({ status: 'active' })
      .where((schema.memories as any).status.eq(undefined));
    console.log('✓ Status column initialized');
  } catch (error) {
    console.warn('Warning: Could not set status:', error);
  }
  
  // 4. Generate salt for encryption if enabled
  if (config.clientEncryptionEnabled && config.encryptionPassphrase) {
    console.log('\nGenerating encryption salt...');
    const saltPath = join(config.dataDir, 'salt');
    if (!existsSync(saltPath)) {
      const salt = randomBytes(16).toString('hex');
      const saltDir = config.dataDir;
      if (!existsSync(saltDir)) {
        mkdirSync(saltDir, { recursive: true });
      }
      writeFileSync(saltPath, salt);
      console.log(`✓ Generated salt at ${saltPath}`);
    } else {
      console.log('  - Salt already exists');
    }
  }
  
  // 5. Create QMD directory
  if (config.qmdEnabled) {
    console.log('\nCreating QMD directory...');
    const qmdDir = join(config.dataDir, 'qmd');
    if (!existsSync(qmdDir)) {
      mkdirSync(qmdDir, { recursive: true });
      console.log(`✓ Created QMD directory at ${qmdDir}`);
    } else {
      console.log('  - QMD directory already exists');
    }
  }
  
  console.log('\n✓ Migration complete!');
  console.log('\nNew features enabled:');
  console.log('  - Client-side encryption:', config.clientEncryptionEnabled ? 'enabled' : 'disabled');
  console.log('  - QMD hot-tier storage:', config.qmdEnabled ? 'enabled' : 'disabled');
  console.log('  - Memory lifecycle with decay:', 'enabled');
  console.log('  - Graph-boosted retrieval:', 'enabled');
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
