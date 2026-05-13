import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(import.meta.dir, '..', '..');

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('migrate runtime', () => {
  test('uses direct sqlite access instead of the ambient process db client', () => {
    const source = readText('core/memory/migrate.ts');

    expect(source).toContain("new Database(sourceDbPath, { readonly: true })");
    expect(source).toContain('const targetDb = new Database(targetDbPath)');
    expect(source).not.toContain('getDbClient(');
  });
});
