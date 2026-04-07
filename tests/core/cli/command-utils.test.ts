import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { createCliCommand, createReadCommand } from '../../core/cli/command-utils.js';

describe('CLI Command Utils', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  describe('createCliCommand', () => {
    test('should wrap handler and return success result', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      const command = createCliCommand(handler);

      await command({}, {});

      expect(handler).toHaveBeenCalledWith({}, {});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, result: 'success' }, null, 2)
      );
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    test('should handle synchronous handlers', async () => {
      const handler = vi.fn().mockReturnValue({ result: 'sync success' });
      const command = createCliCommand(handler);

      await command({}, {});

      expect(handler).toHaveBeenCalledWith({}, {});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, result: 'sync success' }, null, 2)
      );
    });

    test('should handle errors and exit with code 1', async () => {
      const error = new Error('Test error message');
      const handler = vi.fn().mockRejectedValue(error);
      const command = createCliCommand(handler);

      await command({}, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({ ok: false, error: error.message }, null, 2)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('should handle thrown errors', async () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('Thrown error');
      });
      const command = createCliCommand(handler);

      await command({}, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({ ok: false, error: 'Thrown error' }, null, 2)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('should pass arguments to handler correctly', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '123' });
      const command = createCliCommand(handler);
      const args = { id: '123' };
      const options = { verbose: true };

      await command(args, options);

      expect(handler).toHaveBeenCalledWith(args, options);
    });

    test('should handle undefined return value', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const command = createCliCommand(handler);

      await command({}, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({ ok: true }, null, 2)
      );
    });

    test('should handle custom error messages', async () => {
      const handler = vi.fn().mockRejectedValue(
        new Error('Custom error details')
      );
      const command = createCliCommand(handler);

      await command({}, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({ ok: false, error: 'Custom error details' }, null, 2)
      );
    });
  });

  describe('createReadCommand', () => {
    test('should wrap handler and output result directly', async () => {
      const handler = vi.fn().mockResolvedValue('Direct output');
      const command = createReadCommand(handler);

      await command({}, {});

      expect(handler).toHaveBeenCalledWith({}, {});
      expect(mockConsoleLog).toHaveBeenCalledWith('Direct output');
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    test('should handle errors and exit with code 1', async () => {
      const error = new Error('Read command error');
      const handler = vi.fn().mockRejectedValue(error);
      const command = createReadCommand(handler);

      await command({}, {});

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('should handle synchronous handlers', async () => {
      const handler = vi.fn().mockReturnValue('Sync output');
      const command = createReadCommand(handler);

      await command({}, {});

      expect(mockConsoleLog).toHaveBeenCalledWith('Sync output');
    });

    test('should handle undefined return', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const command = createReadCommand(handler);

      await command({}, {});

      expect(mockConsoleLog).toHaveBeenCalledWith('');
    });
  });
});
