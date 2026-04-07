import { describe, test, expect } from 'bun:test';
import { spawn } from 'child_process';

describe('TASK-019: Test CLI commands', () => {
  test('squish --help displays help', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const proc = spawn('node', ['dist/index.js', '--help'], { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));
      proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      proc.on('error', reject);
    });

    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).toContain('Squish');
    expect(result.stdout + result.stderr).toContain('Usage');
  });

  test('squish stats returns statistics', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const proc = spawn('node', ['dist/index.js', 'stats'], { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));
      proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      proc.on('error', reject);
    });

    expect(result.code).toBe(0);
    const output = result.stdout + result.stderr;
    const parsed = JSON.parse(output);
    expect(parsed.totalMemories).toBeDefined();
  });

  test('squish remember works', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const proc = spawn('node', ['dist/index.js', 'remember', 'test memory from consolidation'], { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));
      proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      proc.on('error', reject);
    });

    expect(result.code).toBe(0);
    const output = result.stdout + result.stderr;
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
  });

  test('squish search works', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const proc = spawn('node', ['dist/index.js', 'search', 'test'], { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));
      proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      proc.on('error', reject);
    });

    expect(result.code).toBe(0);
    const output = result.stdout + result.stderr;
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toBeDefined();
  });
});
