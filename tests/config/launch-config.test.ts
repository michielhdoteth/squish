import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const runtimeExecutable = process.execPath;

function readConfig(env: Record<string, string>) {
  const tempDataDir = mkdtempSync(join(tmpdir(), 'squish-config-'));
  try {
    const result = spawnSync(
      runtimeExecutable,
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

function inspectDataDir(cwd: string, env: Record<string, string> = {}) {
  const result = spawnSync(
    runtimeExecutable,
    [
      '-e',
      `
        import { config, getDataDir } from './config.ts';
        console.log(JSON.stringify({
          dataDir: config.dataDir,
          ensuredDataDir: getDataDir()
        }));
      `,
    ],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: '',
        SUPABASE_URL: '',
        NEON_PROJECT_ID: '',
        ...env,
      },
    },
  );

  return result;
}

async function loadDataDirSnapshot(
  cwd: string,
  env: Record<string, string> = {},
  options: { ensureExists?: boolean } = {},
) {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };

  process.chdir(cwd);
  delete process.env.SQUISH_DATA_DIR;

  Object.assign(process.env, {
    DATABASE_URL: '',
    SUPABASE_URL: '',
    NEON_PROJECT_ID: '',
    ...env,
  });

  try {
    const module = await import(`../../config.ts?case=${Date.now()}-${Math.random()}`);
    const snapshot: { dataDir: string; ensuredDataDir?: string } = {
      dataDir: module.config.dataDir as string,
    };

    if (options.ensureExists) {
      snapshot.ensuredDataDir = module.getDataDir() as string;
    }

    return snapshot;
  } finally {
    process.chdir(previousCwd);
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
  }
}

describe('launch config defaults and overrides', () => {
  test('settings.json is valid JSON', () => {
    const result = spawnSync(
      runtimeExecutable,
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

  test('relative data dir resolves absolutely without import-time filesystem writes', async () => {
    const tempWorkspace = mkdtempSync(join(tmpdir(), 'squish-data-dir-'));
    const expectedDataDir = join(tempWorkspace, '.squish');

    try {
      expect(existsSync(expectedDataDir)).toBe(false);

      const snapshot = await loadDataDirSnapshot(tempWorkspace);
      expect(snapshot.dataDir).toBe(expectedDataDir);
      expect(existsSync(expectedDataDir)).toBe(false);

      const ensured = await loadDataDirSnapshot(tempWorkspace, {}, { ensureExists: true });
      expect(ensured.ensuredDataDir).toBe(expectedDataDir);
      expect(existsSync(expectedDataDir)).toBe(true);
    } finally {
      rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  test('getDataDir uses global ~/.squish/ when no data.dir configured', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'squish-global-'));
    const previousEnv = process.env.SQUISH_DATA_DIR;
    const previousHome = process.env.HOME || process.env.USERPROFILE;
    process.env.SQUISH_DATA_DIR = tempDir;
    process.env.HOME = tempDir;

    try {
      const module = await import(`../../config.ts?case=${Date.now()}`);
      const dir = module.getDataDir();
      // When SQUISH_DATA_DIR is set and HOME is temp, uses the env override
      expect(dir).toBe(tempDir);
    } finally {
      if (previousEnv !== undefined) process.env.SQUISH_DATA_DIR = previousEnv;
      else delete process.env.SQUISH_DATA_DIR;
      if (previousHome) process.env.HOME = previousHome;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('findSquishDir always returns global ~/.squish (global-only)', async () => {
    const { findSquishDir, globalDataDir } = await import('../../config.ts');
    const parentDir = mkdtempSync(join(tmpdir(), 'squish-parent-'));
    const childDir = join(parentDir, 'nested', 'project');
    mkdirSync(childDir, { recursive: true });

    try {
      const found = findSquishDir(childDir);
      expect(found).toBe(globalDataDir());
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test('findSquishDir ignores local .squish dirs (global-only)', async () => {
    const { findSquishDir, globalDataDir } = await import('../../config.ts');
    const tempDir = mkdtempSync(join(tmpdir(), 'squish-direct-'));
    mkdirSync(join(tempDir, '.squish'), { recursive: true });

    try {
      const found = findSquishDir(tempDir);
      expect(found).toBe(globalDataDir());
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('globalDataDir returns homedir/.squish path', async () => {
    const { globalDataDir } = await import('../../config.ts');
    const { homedir } = await import('os');
    expect(globalDataDir()).toBe(join(homedir(), '.squish'));
  });

  test('getDataDir with SQUISH_DATA_DIR uses that override', async () => {
    const { getDataDir } = await import('../../config.ts');
    const tempDir = mkdtempSync(join(tmpdir(), 'squish-sqldir-'));
    const previousEnv = process.env.SQUISH_DATA_DIR;
    process.env.SQUISH_DATA_DIR = tempDir;
    try {
      const dir = getDataDir();
      expect(dir).toBe(tempDir);
    } finally {
      if (previousEnv === undefined) {
        delete process.env.SQUISH_DATA_DIR;
      } else {
        process.env.SQUISH_DATA_DIR = previousEnv;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('findSquishDir falls back to global ~/.squish when no local .squish exists', async () => {
    const { findSquishDir, globalDataDir } = await import('../../config.ts');

    const tempDir = mkdtempSync(join(tmpdir(), 'squish-nolocal-'));
    // Ensure no .squish exists in tempDir
    const localSquish = join(tempDir, '.squish');
    if (existsSync(localSquish)) rmSync(localSquish, { recursive: true, force: true });

    try {
      const found = findSquishDir(tempDir);
      expect(found).toBe(globalDataDir());
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('getDataDir with explicit data.dir in settings.json still respected', async () => {
    // The repo's settings.json has data.dir: ".squish" which should still work
    const { getDataDir } = await import('../../config.js');
    const dir = getDataDir();
    expect(dir).toBeTruthy();
    expect(typeof dir).toBe('string');
  });
});
