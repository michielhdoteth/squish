import { describe, expect, test, afterEach } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
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
  // getDataDir() mkdirs the resolved dir. Redirect HOME/USERPROFILE to a
  // temp dir in the subprocess so `~/...` expansion and creation are fully
  // isolated from the real home directory.
  const LEAKED_DIR_NAME = 'squish-tilde-test-xyz';
  const realHome = homedir();

  afterEach(() => {
    // Safety net: remove any folder leaked into the real home by older
    // versions of this test (or an unexpected fallback path).
    try {
      rmSync(join(realHome, LEAKED_DIR_NAME), { recursive: true, force: true });
    } catch {
      // Best effort only.
    }
  });

  test(
    'SQUISH_DATA_DIR with leading ~/ resolves under the (redirected) home path',
    async () => {
      const { spawnSync } = await import('node:child_process');
      const { mkdtempSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const repoRoot = join(import.meta.dir, '..', '..');

      const fakeHome = mkdtempSync(join(tmpdir(), 'squish-tilde-home-'));
      try {
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
            env: {
              ...process.env,
              SQUISH_DATA_DIR: `~/${LEAKED_DIR_NAME}`,
              // Redirect both unix and windows home vars so os.homedir()
              // resolves into the temp dir on every platform.
              HOME: fakeHome,
              USERPROFILE: fakeHome,
            },
          }
        );

        expect(result.status).toBe(0);
        const resolved = JSON.parse(result.stdout.trim());
        expect(resolved).toBe(join(fakeHome, LEAKED_DIR_NAME));
        expect(resolved).not.toContain('~');
      } finally {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            rmSync(fakeHome, { recursive: true, force: true });
            break;
          } catch {
            await sleep(50);
          }
        }
      }
    },
    30_000
  );
});
