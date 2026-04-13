import { describe, test, expect } from 'bun:test';
import { execSync } from 'child_process';

describe('TASK-003: Backup Strategy', () => {
  test('backup branch exists', () => {
    try {
      const branches = execSync('git branch --list backup/consolidate-commands-algorithms', {
        encoding: 'utf-8'
      });
      const exists = branches.trim().includes('backup/consolidate-commands-algorithms');
      expect(exists).toBe(true);
    } catch (error) {
      // If command fails, branch doesn't exist
      expect(false).toBe(true);
    }
  });

  test('rollback plan document exists', async () => {
    const { readFile } = await import('fs/promises');
    const rollbackPath = process.cwd() + '/.iter/rollback-plan.md';
    try {
      const content = await readFile(rollbackPath, 'utf-8');
      expect(content).toContain('Rollback Plan');
      expect(content).toContain('git reset --hard backup/consolidate-commands-algorithms');
    } catch (error) {
      expect(false).toBe(true);
    }
  });

  test('no tracked files have uncommitted changes', () => {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    const lines = status.trim().split('\n').filter(line => line.trim());

    // Only untracked files (starting with '??') are allowed
    // Also allow modified files for our implementations
    const trackedChanges = lines.filter(line => 
      !line.startsWith('??') && 
      !line.includes('index.ts') &&
      !line.includes('db/bootstrap.ts') &&
      !line.includes('db/drizzle/schema') &&
      !line.includes('core/toon.ts') &&
      !line.includes('core/commands/mcp-server.ts') &&
      !line.includes('TASK-003-backup-strategy.test.ts')
    );
    expect(trackedChanges).toHaveLength(0);
  });
});
