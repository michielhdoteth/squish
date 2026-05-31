import { describe, expect, test } from 'bun:test';

describe('cli command surface', () => {
  test('includes install commands for package setup flows', async () => {
    const { createProgram } = await import('../../packages/cli/src/program.ts');
    const program = createProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain('install');
    expect(commandNames).toContain('uninstall');
  });
});
