import { describe, expect, test } from 'bun:test';

describe('install diagnostics', () => {
  test('flags Bun-first shadowing when a non-Bun global shim exists later on PATH', async () => {
    const { assessInstallShadowing } = await import('../../core/runtime/install-diagnostics.ts');

    const result = assessInstallShadowing([
      {
        command: 'squish',
        paths: [
          'C:/Users/test/.bun/bin/squish.exe',
          'C:/Users/test/AppData/Roaming/npm/squish.cmd',
        ],
      },
      {
        command: 'squish-mcp',
        paths: [
          'C:/Users/test/.bun/bin/squish-mcp.exe',
          'C:/Users/test/AppData/Roaming/npm/squish-mcp.cmd',
        ],
      },
    ]);

    expect(result.status).toBe('broken');
    expect(result.detail).toContain('stale Bun shim');
    expect(result.remediation[0]).toContain('bun uninstall -g squish-memory');
  });

  test('accepts a single Bun install when no alternate global shim exists', async () => {
    const { assessInstallShadowing } = await import('../../core/runtime/install-diagnostics.ts');

    const result = assessInstallShadowing([
      {
        command: 'squish',
        paths: ['C:/Users/test/.bun/bin/squish.exe'],
      },
      {
        command: 'squish-mcp',
        paths: ['C:/Users/test/.bun/bin/squish-mcp.exe'],
      },
    ]);

    expect(result.status).toBe('ok');
  });
});
