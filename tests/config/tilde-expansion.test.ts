import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expandTilde } from '../../config.js';

describe('expandTilde', () => {
  test('expands a bare ~ to the home directory', () => {
    expect(expandTilde('~')).toBe(homedir());
  });

  test('expands a leading ~/ to the home directory', () => {
    const result = expandTilde('~/some/path');
    expect(result).toBe(join(homedir(), 'some', 'path'));
    expect(result).not.toContain('~');
  });

  test('expands a leading ~\\ (Windows separator)', () => {
    const result = expandTilde('~\\.squish');
    expect(result).toBe(join(homedir(), '.squish'));
  });

  test('leaves absolute paths untouched', () => {
    expect(expandTilde('/usr/local/data')).toBe('/usr/local/data');
    expect(expandTilde('C:\\data\\dir')).toBe('C:\\data\\dir');
  });

  test('leaves relative paths and mid-path tildes untouched', () => {
    expect(expandTilde('relative/~path')).toBe('relative/~path');
    expect(expandTilde('./local/dir')).toBe('./local/dir');
    expect(expandTilde('a~b')).toBe('a~b');
  });

  test('handles empty strings', () => {
    expect(expandTilde('')).toBe('');
  });
});

describe('getDataDir tilde integration', () => {
  test('SQUISH_DATA_DIR with leading ~/ resolves to the real home path', async () => {
    // Spawned subprocess keeps the parent env (and the real ~/.squish) clean.
    const { spawnSync } = await import('node:child_process');
    const repoRoot = join(import.meta.dir, '..', '..');

    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
        import { getDataDir } from './config.ts';
        console.log(JSON.stringify(getDataDir()));
      `,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, SQUISH_DATA_DIR: '~/squish-tilde-test-xyz' },
      }
    );

    expect(result.status).toBe(0);
    const resolved = JSON.parse(result.stdout.trim());
    expect(resolved).toBe(join(homedir(), 'squish-tilde-test-xyz'));
    expect(resolved).not.toContain('~');
  });
});
