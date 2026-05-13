import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('installer plugin copy', () => {
  test('creates nested target directory before copying plugin files', async () => {
    const { copyPluginFiles } = await import('../../bin/install-plugins.mjs');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-plugin-copy-'));
    const sourceDir = path.join(tempRoot, 'source');
    const targetDir = path.join(tempRoot, 'nested', 'plugins', 'squish');

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'index.ts'), 'export default 1;\n');

    copyPluginFiles(sourceDir, targetDir, ['index.ts']);

    expect(fs.existsSync(path.join(targetDir, 'index.ts'))).toBe(true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
