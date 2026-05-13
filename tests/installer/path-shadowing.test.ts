import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(import.meta.dir, '..', '..');

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('installer path shadowing guard', () => {
  test('installer blocks when stale Bun shims shadow the direct binary', () => {
    const source = readText('bin/install-interactive.mjs');

    expect(source).toContain('Stale Bun global install is shadowing the current Squish binary.');
    expect(source).toContain('bun uninstall -g squish-memory');
    expect(source).toContain("['squish', 'squish-mcp']");
  });
});
