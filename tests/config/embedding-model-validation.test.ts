import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');

function runEmbedding(env: Record<string, string>) {
  const tempDataDir = mkdtempSync(join(tmpdir(), 'squish-embedding-'));
  try {
    return spawnSync(
      'bun',
      [
        '-e',
        `
          import { getEmbedding } from './core/embeddings/embeddings.ts';
          try {
            const embedding = await getEmbedding('launch safe local embedding');
            console.log(JSON.stringify({ ok: true, length: embedding?.length ?? 0 }));
          } catch (error) {
            console.error((error instanceof Error ? error.message : String(error)));
            process.exit(1);
          }
        `,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: '',
          SUPABASE_URL: '',
          NEON_PROJECT_ID: '',
          SQUISH_DATA_DIR: tempDataDir,
          SQUISH_OPENAI_EMBEDDING_MODEL: '',
          SQUISH_GOOGLE_EMBEDDING_MODEL: '',
          SQUISH_OLLAMA_EMBEDDING_MODEL: '',
          SQUISH_LM_STUDIO_EMBEDDING_MODEL: '',
          SQUISH_LOCAL_MODEL: '',
          ...env,
        },
      },
    );
  } finally {
    rmSync(tempDataDir, { recursive: true, force: true });
  }
}

describe('embedding provider model validation', () => {
  test.each([
    ['openai', 'SQUISH_OPENAI_EMBEDDING_MODEL'],
    ['google', 'SQUISH_GOOGLE_EMBEDDING_MODEL'],
    ['ollama', 'SQUISH_OLLAMA_EMBEDDING_MODEL'],
    ['lmstudio', 'SQUISH_LM_STUDIO_EMBEDDING_MODEL'],
    ['transformers', 'SQUISH_LOCAL_MODEL'],
  ])('%s requires an explicit model', (provider, envVar) => {
    const result = runEmbedding({ SQUISH_EMBEDDINGS_PROVIDER: provider });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(envVar);
  });

  test('auto skips model-missing providers and falls back to local', () => {
    const result = runEmbedding({
      SQUISH_EMBEDDINGS_PROVIDER: 'auto',
      SQUISH_OPENAI_API_KEY: 'test-key',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.length).toBe(768);
  });
});
