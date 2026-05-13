import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(import.meta.dir, '..', '..');

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('universal runtime packaging', () => {
  test('published package does not require bun as an engine', () => {
    const pkg = JSON.parse(readText('package.json'));

    expect(pkg.engines?.node).toBeDefined();
    expect(pkg.engines?.bun).toBeUndefined();
  });

  test('dependency manager supports npm, yarn, pnpm, and bun global installs', () => {
    const source = readText('bin/dependency-manager.mjs');

    expect(source).toContain('case "npm"');
    expect(source).toContain('case "yarn"');
    expect(source).toContain('case "pnpm"');
    expect(source).toContain('case "bun"');
    expect(source).toContain('["npm", "yarn", "pnpm", "bun"]');
  });
});
