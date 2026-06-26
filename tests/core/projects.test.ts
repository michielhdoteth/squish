import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';

let testDataDir: string;
let savedDataDir: string | undefined;
let savedDatabaseUrl: string | undefined;
let getProjectByPath: typeof import('../../core/projects.js').getProjectByPath;
let requireProject: typeof import('../../core/projects.js').requireProject;
let getOrCreateProject: typeof import('../../core/projects.js').getOrCreateProject;
let ProjectNotFoundError: typeof import('../../core/projects.js').ProjectNotFoundError;
let getAllProjects: typeof import('../../core/projects.js').getAllProjects;
let getDb: typeof import('../../db/index.js').getDb;
let resetDb: typeof import('../../db/index.js').resetDb;

async function clearProjects() {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec('DELETE FROM projects;');
  } else {
    throw new Error('Could not access SQLite client');
  }
}

describe('Project Resolution Helpers', () => {
  beforeAll(async () => {
    savedDataDir = process.env.SQUISH_DATA_DIR;
    savedDatabaseUrl = process.env.DATABASE_URL;
    testDataDir = join(process.cwd(), '.test-data');
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

    const projectsMod = await import('../../core/projects.js');
    const dbMod = await import('../../db/index.js');
    getProjectByPath = projectsMod.getProjectByPath;
    requireProject = projectsMod.requireProject;
    getOrCreateProject = projectsMod.getOrCreateProject;
    ProjectNotFoundError = projectsMod.ProjectNotFoundError;
    getAllProjects = projectsMod.getAllProjects;
    getDb = dbMod.getDb;
    resetDb = dbMod.resetDb;
    resetDb();
  });

  afterAll(() => {
    if (savedDataDir === undefined) delete process.env.SQUISH_DATA_DIR;
    else process.env.SQUISH_DATA_DIR = savedDataDir;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  beforeEach(() => {
    clearProjects();
  });

  describe('requireProject', () => {
    test('should throw ProjectNotFoundError when project does not exist', async () => {
      await expect(requireProject('/nonexistent/project'))
        .rejects
        .toThrow(ProjectNotFoundError);

      try {
        await requireProject('/nonexistent/project');
        throw new Error('Should have thrown');
      } catch (error: any) {
        if (error instanceof ProjectNotFoundError) {
          expect(error.message).toBe('Project not found: /nonexistent/project');
          expect(error.name).toBe('ProjectNotFoundError');
        } else {
          throw error;
        }
      }
    });

    test('should return project when it exists', async () => {
      const existing = await getOrCreateProject('/existing/project');
      if (!existing) throw new Error('Failed to create project');
      expect(existing.path).toBe('/existing/project');

      const required = await requireProject('/existing/project');
      expect(required).toBeDefined();
      expect(required.id).toBe(existing.id);
      expect(required.path).toBe('/existing/project');
    });
  });

  describe('getOrCreateProject', () => {
    test('should return existing project when it exists', async () => {
      const first = await getOrCreateProject('/test/project');
      if (!first) throw new Error('Failed to create project');
      expect(first.path).toBe('/test/project');

      const second = await getOrCreateProject('/test/project');
      if (!second) throw new Error('Failed to get existing project');
      expect(second.id).toBe(first.id);
    });

    test('should create and return new project when it does not exist', async () => {
      const result = await getOrCreateProject('/new/project');
      if (!result) throw new Error('Failed to create project');
      expect(result.id).toBeTypeOf('string');
      expect(result.path).toBe('/new/project');
      expect(result.name).toBe('project');
    });

    test('should return null for undefined or null path', async () => {
      const result = await getOrCreateProject(undefined);
      expect(result).toBeNull();
    });

    test('should set metadata with source: mcp', async () => {
      const result = await getOrCreateProject('/metadata/test');
      if (!result) throw new Error('Failed to create project');
      expect(result.metadata).toEqual({ source: 'mcp' });
    });
  });

  describe('integration with getProjectByPath', () => {
    test('getProjectByPath should find created project', async () => {
      await getOrCreateProject('/find/me');
      const found = await getProjectByPath('/find/me');
      expect(found).not.toBeNull();
      expect(found?.path).toBe('/find/me');
    });

    test('getProjectByPath should return null for non-existent project', async () => {
      const found = await getProjectByPath('/does/not/exist');
      expect(found).toBeNull();
    });
  });
});
