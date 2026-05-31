import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';

const testDataDir = join(tmpdir(), `squish-trust-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

import { describe, expect, it, beforeAll, beforeEach } from 'bun:test';
import { resolveProjectScope } from '../../core/runtime/trust-state.js';
import { ensureProject } from '../../core/projects.js';
import { resetDb } from '../../db/index.js';

describe('trust-state', () => {
  beforeEach(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    resetDb();
  });

  beforeAll(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    resetDb();
    await ensureProject(process.cwd());
  });

  it('marks explicit project paths as explicit', async () => {
    const scope = await resolveProjectScope(process.cwd());
    expect(scope.currentProject.path).toBe(process.cwd());
    expect(['explicit', 'auto-created']).toContain(scope.currentProject.resolution);
  });
});
