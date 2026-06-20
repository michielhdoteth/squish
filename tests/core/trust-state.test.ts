import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { describe, expect, it, beforeAll, beforeEach } from 'bun:test';

const testDataDir = join(tmpdir(), `squish-trust-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

let resolveProjectScope: typeof import('../../core/runtime/trust-state.js').resolveProjectScope;
let ensureProject: typeof import('../../core/projects.js').ensureProject;
let resetDb: typeof import('../../db/index.js').resetDb;

describe('trust-state', () => {
  beforeAll(async () => {
    const trustState = await import('../../core/runtime/trust-state.js');
    const projects = await import('../../core/projects.js');
    const db = await import('../../db/index.js');
    resolveProjectScope = trustState.resolveProjectScope;
    ensureProject = projects.ensureProject;
    resetDb = db.resetDb;
  });

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
