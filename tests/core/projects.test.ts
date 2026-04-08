import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync, rmdirSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';

// Setup test environment BEFORE any imports
const testDataDir = join(process.cwd(), '.test-data');
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = ''; // Ensure SQLite mode

// Ensure test data directory exists
if (!existsSync(testDataDir)) {
  mkdirSync(testDataDir, { recursive: true });
}

// Now import the functions
import { 
  getProjectByPath, 
  requireProject, 
  getOrCreateProject, 
  ProjectNotFoundError,
  getAllProjects 
} from '../../core/projects.js';
import { getDb } from '../../db/index.js';

// Helper to clear projects table
async function clearProjects() {
  const db = await getDb();
  // Access the underlying SQLite client
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec('DELETE FROM projects;');
    // Also reset auto-increment if needed (not for SQLite with TEXT PK)
  } else {
    throw new Error('Could not access SQLite client');
  }
}

describe('Project Resolution Helpers', () => {
  beforeEach(() => {
    // Clear projects before each test
    clearProjects();
  });

  describe('requireProject', () => {
    test('should throw ProjectNotFoundError when project does not exist', async () => {
      await expect(requireProject('/nonexistent/project'))
        .rejects
        .toThrow(ProjectNotFoundError);
      
      // Check error message contains path
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
      // First create a project
      const existing = await getOrCreateProject('/existing/project');
      if (!existing) throw new Error('Failed to create project');
      expect(existing.path).toBe('/existing/project');

      // Now requireProject should return it
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
      expect(second.id).toBe(first.id); // Same ID
    });

    test('should create and return new project when it does not exist', async () => {
      const result = await getOrCreateProject('/new/project');
      if (!result) throw new Error('Failed to create project');
      expect(result.id).toBeTypeOf('string');
      expect(result.path).toBe('/new/project');
      expect(result.name).toBe('project'); // basename of path
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

// Cleanup after all tests
afterEach(async () => {
  // Could clear between tests, already done in beforeEach
});

// Optional: clean up test data directory after all tests
// But keep it for inspection if tests fail
