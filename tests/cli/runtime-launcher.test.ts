import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('runtime launcher', () => {
  test('falls back to local tsx when bun is not provided', async () => {
    const { resolveRuntimeLaunch } = await import('../../bin/runtime-launcher.mjs');
    const launch = resolveRuntimeLaunch({
      rootDir: repoRoot,
      entryRelativePath: 'packages/mcp/src/index.ts',
      env: {},
    });

    expect(launch.command).toBe(process.execPath);
    expect(launch.args[0]).toContain('node_modules');
    expect(launch.args[0]).toContain('tsx');
    expect(launch.args[launch.args.length - 1]).toBe(repoRoot.replace(/\\/g, '/') + '/packages/mcp/src/index.ts');
  });

  test('prefers explicit bun path when available', async () => {
    const { resolveRuntimeLaunch } = await import('../../bin/runtime-launcher.mjs');
    const launch = resolveRuntimeLaunch({
      rootDir: 'C:/repo',
      entryRelativePath: 'packages/cli/src/index.ts',
      env: { BUN: 'C:\\bun\\bin\\bun.exe' },
    });

    expect(launch.command).toBe('C:/bun/bin/bun.exe');
    expect(launch.args).toEqual(['C:/repo/packages/cli/src/index.ts']);
  });
});
