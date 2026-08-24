/**
 * Batch 5 wiring probe: run one production-defaults search and dump the
 * retrieval trace fields added by this batch.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'squish-b5-probe-'));
process.env.SQUISH_DATA_DIR = dataDir;
process.env.DATABASE_URL = '';
delete process.env.SQUISH_DATABASE_URL;
if (!process.env.SQUISH_RERANKER_ENABLED) process.env.SQUISH_RERANKER_ENABLED = 'true';
if (!process.env.SQUISH_LOCAL_BUNDLED_MODEL) process.env.SQUISH_LOCAL_BUNDLED_MODEL = 'off';
// Keep the probe fast: short timeout for the doomed model load
process.env.SQUISH_RERANKER_LOAD_TIMEOUT_MS ||= '3000';

const { hybridSearch } = await import('../../core/memory/hybrid-search.js');

const { rememberMemory } = await import('../../core/memory/memories.js');
const m1 = await rememberMemory({ content: 'We chose pnpm as the package manager for 4m-mcp', type: 'fact' });
const m2 = await rememberMemory({ content: 'Bun is used for 4m-os and 4m-landing', type: 'fact' });
const { createAssociation } = await import('../../core/associations.js');
await createAssociation(m1.id, m2.id, 'relates_to', 1.0);

const results = await hybridSearch(
  { query: 'package manager for mcp gateway', limit: 5, trace: true } as any,
  { limit: 5 },
);

const t = (results[0] as any)?._trace;
console.log(JSON.stringify({
  graphBoostMode: t?.graphBoostMode,
  reranker: t?.reranker,
  serveMode: t?.scoringServeMode,
  top3: results.slice(0, 3).map((r: any) => ({
    content: String(r?.content ?? r?.memory?.content ?? '').slice(0, 40),
    breakdownGraph: r?.scoreBreakdown?.graph ?? null,
  })),
}, null, 2));

try {
  const { closeAllDbs } = await import('../../db/index.js');
  await closeAllDbs();
} catch {}
try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
