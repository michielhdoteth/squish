/**
 * STDIO pipe relay tests for squish-mcp entry point
 *
 * These tests verify that bin/squish-mcp.mjs correctly sets up STDIO pipe relay
 * for Windows compatibility. On Windows, 'inherit' mode gives child a duplicate
 * stdin handle that closes immediately; the fix uses 'pipe' mode + explicit
 * process.stdin.pipe(child.stdin) + process.stdin.resume().
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(import.meta.dir, '..', '..');
const squishMcpPath = join(rootDir, 'bin', 'squish-mcp.mjs');
const runtimeLauncherPath = join(rootDir, 'bin', 'runtime-launcher.mjs');

function readSquishMcp(): string {
  return readFileSync(squishMcpPath, 'utf-8');
}

function readRuntimeLauncher(): string {
  return readFileSync(runtimeLauncherPath, 'utf-8');
}

describe('STDIO pipe relay', () => {
  test('squish-mcp.mjs uses pipe mode for stdio', () => {
    const source = readSquishMcp();

    // Must use pipe mode explicitly
    expect(source).toContain("'pipe'");

    // inherit mode breaks on Windows - child gets a duplicate handle that closes immediately
    // Extract the stdio configuration block to avoid false positives from comments
    const stdioMatch = source.match(/stdio\s*:\s*\[([^\]]+)\]/);
    if (stdioMatch) {
      expect(stdioMatch[1]).not.toContain("'inherit'");
      expect(stdioMatch[1]).not.toContain('"inherit"');
    }
  });

  test('squish-mcp.mjs pipes stdin to child', () => {
    const source = readSquishMcp();

    // Must pipe stdin from parent to child
    expect(source).toContain('process.stdin.pipe(child.stdin)');

    // process.stdin.resume() keeps stdin open on Windows
    // Without this, Node may pause stdin and miss data
    expect(source).toContain('process.stdin.resume()');
  });

  test('squish-mcp.mjs handles stdin errors', () => {
    const source = readSquishMcp();

    // Must handle stdin errors to prevent crashes when parent stdin closes
    // Accepts either child.stdin.on('error') or process.stdin.on('error')
    const hasChildStdinError = source.includes("child.stdin.on('error'") ||
                               source.includes('child.stdin.on("error"');
    const hasProcessStdinError = source.includes("process.stdin.on('error'") ||
                                 source.includes('process.stdin.on("error"');

    expect(hasChildStdinError || hasProcessStdinError).toBe(true);
  });

  test('squish-mcp.mjs handles child exit', () => {
    const source = readSquishMcp();

    // Must handle child process exit
    expect(source).toContain("child.on('exit'");

    // Must forward exit codes from child to parent
    expect(source).toContain('process.exit(code');
  });

  test('squish-mcp.mjs sets up logging', () => {
    const source = readSquishMcp();

    // Must reference the log path (either via getDefaultLogFile or env var)
    const hasLogPath = source.includes("getDefaultLogFile('mcp')") ||
                       source.includes('SQUISH_LOG_FILE') ||
                       source.includes('.squish/logs/mcp.log');

    expect(hasLogPath).toBe(true);

    // Must pipe child stderr to log file via attachChildLogging
    expect(source).toContain('attachChildLogging');
  });

  test('runtime-launcher.mjs resolves bun or tsx', () => {
    const source = readRuntimeLauncher();

    // Must detect bun on PATH
    expect(source).toContain('detectBunOnPath');

    // Must fall back to tsx when bun is not available
    expect(source).toContain('resolveTsxCliPath');

    // Must check for bun availability via execFileSync
    expect(source).toContain("execFileSync");
    expect(source).toContain('bun');
  });
});
