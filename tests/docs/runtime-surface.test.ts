import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(import.meta.dir, '..', '..');

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('release-facing runtime surface', () => {
  test('memory migration no longer depends on bun:sqlite', () => {
    const source = readText('core/memory/migrate.ts');
    expect(source).not.toContain('bun:sqlite');
  });

  test('qmd client install guidance is package-manager neutral', () => {
    const source = readText('core/embeddings/qmd-client.ts');
    expect(source).not.toContain('bun install -g qmd');
  });

  test('quickstart docs do not steer users to bun-only install paths', () => {
    const source = readText('docs/INSTALL-QUICKSTART.md');
    expect(source).not.toContain('bun add squish-memory');
  });

  test('mcp server docs do not present bun as the primary runtime path', () => {
    const source = readText('docs/MCP-SERVER.md');
    expect(source).not.toContain('bun run mcp');
  });
});
