import { describe, test, expect } from 'bun:test';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { stat } from 'fs/promises';

describe('TASK-004: Verify core/commands/ is dead code', () => {
  const baseDir = process.cwd();

  async function getAllTsAndJsFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const items = await readdir(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      try {
        const fileStat = await stat(fullPath);
        if (fileStat.isDirectory()) {
          // Skip node_modules, .git, dist, and test directories
          if (item === 'node_modules' || item === '.git' || item === 'dist' ||
              item === 'tests' || item === 'consolidation') {
            continue;
          }
          files.push(...(await getAllTsAndJsFiles(fullPath)));
        } else if (item.endsWith('.ts') || item.endsWith('.js')) {
          files.push(fullPath);
        }
      } catch (err) {
        // Skip files we can't access
      }
    }
    return files;
  }

  test('core/commands/ directory exists with exactly 2 files', async () => {
    const coreCommandsPath = join(baseDir, 'core', 'commands');
    const files = await readdir(coreCommandsPath);

    // Should have exactly 2 files: managed-sync.ts and mcp-server.ts
    expect(files).toHaveLength(2);
    expect(files).toContain('managed-sync.ts');
    expect(files).toContain('mcp-server.ts');
  });

  test('no TypeScript/JavaScript files import from core/commands/', async () => {
    const allFiles = await getAllTsAndJsFiles(baseDir);
    const filesWithImports: string[] = [];

    for (const file of allFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        if (content.includes("from '../core/commands/") ||
            content.includes("from './core/commands/") ||
            content.includes("from '../../core/commands/") ||
            content.includes("from '../../../core/commands/")) {
          filesWithImports.push(file);
          console.log(`Found import from core/commands/ in: ${file}`);
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }

    expect(filesWithImports).toHaveLength(0);
  });

  test('package.json does not reference core/commands/', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    expect(content).not.toContain('core/commands/mcp-server.js');
    expect(content).not.toContain('core/commands/managed-sync.ts');
  });

  test('tsconfig.json does not include core/commands/', async () => {
    const tsconfigPath = join(baseDir, 'tsconfig.json');
    const content = await readFile(tsconfigPath, 'utf-8');

    expect(content).not.toContain('"core/commands/**/*.ts"');
  });

  test('config files do not reference core/commands/', async () => {
    const configFiles = [
      'config/plugin.json',
      'mcp.json.example',
      'config/plugin-manifest.json'
    ];

    for (const configFile of configFiles) {
      const filePath = join(baseDir, configFile);
      try {
        const content = await readFile(filePath, 'utf-8');
        expect(content).not.toContain('core/commands/');
      } catch (err) {
        // If file doesn't exist yet, skip
      }
    }
  });

  test('core/commands/ files are duplicates of commands/ versions', async () => {
    const commandsPath = join(baseDir, 'commands');
    const coreCommandsPath = join(baseDir, 'core', 'commands');

    const commandsFiles = await readdir(commandsPath);
    const coreFiles = await readdir(coreCommandsPath);

    // All files in core/commands/ should also exist in commands/
    for (const coreFile of coreFiles) {
      expect(commandsFiles).toContain(coreFile);
    }
  });
});
