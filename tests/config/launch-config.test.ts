import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');

function readConfig(env: Record<string, string>) {
  const tempDataDir = mkdtempSync(join(tmpdir(), 'squish-config-'));
  try {
    const result = spawnSync(
      'bun',
      [
        '-e',
        `
          import { config } from './config.ts';
          console.log(JSON.stringify({
            mode: config.mode,
            embeddingsProvider: config.embeddingsProvider,
            openAiEmbeddingModel: config.openAiEmbeddingModel,
            googleEmbeddingModel: config.googleEmbeddingModel,
            ollamaEmbeddingModel: config.ollamaEmbeddingModel,
            lmStudioEmbeddingModel: config.lmStudioEmbeddingModel,
            transformersLocalModel: config.transformersLocalModel,
            llmExtractionModel: config.llmExtractionModel,
            llmReasoningModel: config.llmReasoningModel,
            llmEnabled: config.llmEnabled,
            nestedLlmEnabled: config.llm.enabled,
            graphAutoBuild: config.graphAutoBuild,
            nestedGraphAutoBuild: config.graph.autoBuild,
            graphExtractionMethod: config.graphExtractionMethod,
            llmEndpoint: config.llmEndpoint
          }));
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
          SQUISH_LLM_EXTRACTION_MODEL: '',
          SQUISH_LLM_REASONING_MODEL: '',
          ...env,
        },
      },
    );

    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(tempDataDir, { recursive: true, force: true });
  }
}

describe('launch config defaults and overrides', () => {
  test('settings.json is valid JSON', () => {
    const result = spawnSync(
      'node',
      ['-e', "JSON.parse(require('fs').readFileSync('config/settings.json','utf8'));"],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
  });

  test('defaults are local-first with llm disabled', () => {
    const config = readConfig({});

    expect(config.mode).toBe('local');
    expect(config.embeddingsProvider).toBe('local');
    expect(config.llmEnabled).toBe(false);
    expect(config.nestedLlmEnabled).toBe(false);
    expect(config.graphAutoBuild).toBe(true);
    expect(config.nestedGraphAutoBuild).toBe(true);
  });

  test('packaged defaults do not hardcode provider model names', () => {
    const config = readConfig({});

    expect(config.openAiEmbeddingModel).toBe('');
    expect(config.googleEmbeddingModel).toBe('');
    expect(config.ollamaEmbeddingModel).toBe('');
    expect(config.lmStudioEmbeddingModel).toBe('');
    expect(config.transformersLocalModel).toBe('');
    expect(config.llmExtractionModel).toBe('');
    expect(config.llmReasoningModel).toBe('');
  });

  test('boolean env overrides parse false as false', () => {
    const config = readConfig({
      SQUISH_LLM_ENABLED: 'false',
      SQUISH_GRAPH_AUTO_BUILD: 'false',
    });

    expect(config.llmEnabled).toBe(false);
    expect(config.nestedLlmEnabled).toBe(false);
    expect(config.graphAutoBuild).toBe(false);
    expect(config.nestedGraphAutoBuild).toBe(false);
  });

  test('invalid enum env values fall back safely', () => {
    const config = readConfig({
      SQUISH_EMBEDDINGS_PROVIDER: 'benchmark-only-provider',
      SQUISH_GRAPH_EXTRACTION_METHOD: 'magic',
    });

    expect(config.embeddingsProvider).toBe('local');
    expect(config.graphExtractionMethod).toBe('auto');
  });

  test('benchmark runtime overrides come from env', () => {
    const config = readConfig({
      SQUISH_LLM_ENABLED: 'true',
      SQUISH_LLM_ENDPOINT: 'http://localhost:1234',
    });

    expect(config.llmEnabled).toBe(true);
    expect(config.nestedLlmEnabled).toBe(true);
    expect(config.llmEndpoint).toBe('http://localhost:1234');
  });

  test('provider model env overrides are read correctly', () => {
    const config = readConfig({
      SQUISH_OPENAI_EMBEDDING_MODEL: 'example-openai-model',
      SQUISH_GOOGLE_EMBEDDING_MODEL: 'example-google-model',
      SQUISH_OLLAMA_EMBEDDING_MODEL: 'example-ollama-model',
      SQUISH_LM_STUDIO_EMBEDDING_MODEL: 'example-lmstudio-model',
      SQUISH_LOCAL_MODEL: 'example-transformers-model',
      SQUISH_LLM_EXTRACTION_MODEL: 'example-extraction-model',
      SQUISH_LLM_REASONING_MODEL: 'example-reasoning-model',
    });

    expect(config.openAiEmbeddingModel).toBe('example-openai-model');
    expect(config.googleEmbeddingModel).toBe('example-google-model');
    expect(config.ollamaEmbeddingModel).toBe('example-ollama-model');
    expect(config.lmStudioEmbeddingModel).toBe('example-lmstudio-model');
    expect(config.transformersLocalModel).toBe('example-transformers-model');
    expect(config.llmExtractionModel).toBe('example-extraction-model');
    expect(config.llmReasoningModel).toBe('example-reasoning-model');
  });
});
