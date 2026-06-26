import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'bun:test';

let testDataDir: string;
let savedDataDir: string | undefined;
let savedDatabaseUrl: string | undefined;
let resolveProjectScope: typeof import('../../core/runtime/trust-state.js').resolveProjectScope;
let ensureProject: typeof import('../../core/projects.js').ensureProject;
let resetDb: typeof import('../../db/index.js').resetDb;

describe('trust-state', () => {
  beforeAll(async () => {
    savedDataDir = process.env.SQUISH_DATA_DIR;
    savedDatabaseUrl = process.env.DATABASE_URL;
    testDataDir = join(tmpdir(), `squish-trust-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

    const trustState = await import('../../core/runtime/trust-state.js');
    const projects = await import('../../core/projects.js');
    const db = await import('../../db/index.js');
    resolveProjectScope = trustState.resolveProjectScope;
    ensureProject = projects.ensureProject;
    resetDb = db.resetDb;

    resetDb();
    await ensureProject(process.cwd());
  });

  afterAll(() => {
    if (savedDataDir === undefined) delete process.env.SQUISH_DATA_DIR;
    else process.env.SQUISH_DATA_DIR = savedDataDir;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    try { rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  beforeEach(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    resetDb();
  });

  it('marks explicit project paths as explicit', async () => {
    const scope = await resolveProjectScope(process.cwd());
    expect(scope.currentProject.path).toBe(process.cwd());
    expect(['explicit', 'auto-created']).toContain(scope.currentProject.resolution);
  });
});
