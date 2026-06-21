import { describe, expect, test } from 'bun:test';

describe('cli status command', () => {
  test('registers a top-level status command for launch readiness', async () => {
    const { createProgram } = await import('../../packages/cli/src/program.ts');
    const program = createProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain('status');
  });
});
