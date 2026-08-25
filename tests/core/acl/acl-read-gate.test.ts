/**
 * P5 ACL read-gate tests: log-only mode returns all results but logs
 * would-filter decisions; enforce mode filters disallowed results.
 */
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

let testDataDir: string;
let savedEnv: Record<string, string | undefined>;

let setVisibilityRule: typeof import('../../../core/loadout/loadout.js').setVisibilityRule;
let removeVisibilityRule: typeof import('../../../core/loadout/loadout.js').removeVisibilityRule;
let applyAclReadGate: typeof import('../../../core/acl/read-gate.js').applyAclReadGate;
let getAclLog: typeof import('../../../core/acl/acl-log.js').getAclLog;
let clearAclLog: typeof import('../../../core/acl/acl-log.js').clearAclLog;
let getDb: typeof import('../../../db/index.js').getDb;
let resetDb: typeof import('../../../db/index.js').resetDb;

const OWNER = 'user-owner';
const STRANGER = 'user-stranger';

async function seedMemory(id: string, content: string): Promise<void> {
  const db = await getDb();
  const sqlite = (db as any).$client;
  sqlite.exec(`INSERT INTO memories (id, content, type, status, created_at) VALUES ('${id}', '${content.replace(/'/g, "''")}', 'fact', 'active', '${new Date().toISOString()}')`);
}

describe('ACL read gate (P5)', () => {
  beforeAll(async () => {
    savedEnv = {
      SQUISH_DATA_DIR: process.env.SQUISH_DATA_DIR,
      DATABASE_URL: process.env.DATABASE_URL,
      SQUISH_ACL_ENFORCE: process.env.SQUISH_ACL_ENFORCE,
    };

    testDataDir = join(tmpdir(), `squish-acl-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';

    const loadoutMod = await import('../../../core/loadout/loadout.js');
    const gateMod = await import('../../../core/acl/read-gate.js');
    const logMod = await import('../../../core/acl/acl-log.js');
    const dbMod = await import('../../../db/index.js');
    setVisibilityRule = loadoutMod.setVisibilityRule;
    removeVisibilityRule = loadoutMod.removeVisibilityRule;
    applyAclReadGate = gateMod.applyAclReadGate;
    getAclLog = logMod.getAclLog;
    clearAclLog = logMod.clearAclLog;
    getDb = dbMod.getDb;
    resetDb = dbMod.resetDb;

    await resetDb();

    // Seed three memories:
    //  mem-private: rule grants only STRANGER -> hidden from OTHER_READER
    //  mem-open: rule grants everyone -> visible to all
    //  mem-norules: no rules at all -> always served (cheap path)
    await seedMemory('mem-private', 'private team secret');
    await seedMemory('mem-open', 'public announcement');
    await seedMemory('mem-norules', 'ordinary memory without visibility rules');

    await setVisibilityRule({
      assetType: 'memory',
      assetId: 'mem-private',
      ruleType: 'allow',
      granteeType: 'user',
      granteeId: STRANGER,
      permission: 'read',
    });
    await setVisibilityRule({
      assetType: 'memory',
      assetId: 'mem-open',
      ruleType: 'allow',
      granteeType: 'everyone',
      granteeId: '*',
      permission: 'read',
    });
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try { await removeVisibilityRule('memory', 'mem-private', 'user', STRANGER); } catch {}
    try { await removeVisibilityRule('memory', 'mem-open', 'everyone', '*'); } catch {}
    try { rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  const RESULTS = [
    { id: 'mem-private', content: 'private team secret' },
    { id: 'mem-open', content: 'public announcement' },
    { id: 'mem-norules', content: 'ordinary memory without visibility rules' },
  ];

  test('no ACL context: everything served unchanged (zero overhead)', async () => {
    const out = await applyAclReadGate(RESULTS, null);
    expect(out).toHaveLength(3);
    expect(getAclLog('acl_would_filter')).toHaveLength(0);
  });

  test('log-only mode (default): serves everything but logs would-filter', async () => {
    delete process.env.SQUISH_ACL_ENFORCE;
    clearAclLog();

    const out = await applyAclReadGate(RESULTS, { userId: OWNER });

    expect(out).toHaveLength(3);
    const logged = getAclLog('acl_would_filter');
    expect(logged.length).toBe(1);
    expect((logged[0] as any).memoryId).toBe('mem-private');
    expect(String((logged[0] as any).rule)).toContain('user');
  });

  test('SQUISH_ACL_ENFORCE values other than exact "true" stay log-only', async () => {
    // Regression coverage for the inlined flag parse (was flags.ts isAclEnforce):
    // only the exact string 'true' enables enforcement.
    for (const value of ['1', 'TRUE', 'yes']) {
      process.env.SQUISH_ACL_ENFORCE = value;
      clearAclLog();

      const out = await applyAclReadGate(RESULTS, { userId: OWNER });

      expect(out).toHaveLength(3);
      expect(getAclLog('acl_would_filter').length).toBe(1);
    }
    delete process.env.SQUISH_ACL_ENFORCE;
  });

  test('enforce mode filters disallowed results', async () => {
    process.env.SQUISH_ACL_ENFORCE = 'true';

    const out = await applyAclReadGate(RESULTS, { userId: OWNER });

    const ids = out.map((r) => r.id);
    expect(ids).not.toContain('mem-private');
    expect(ids).toContain('mem-open');
    expect(ids).toContain('mem-norules');

    // stranger can see mem-private via explicit grant
    const strangerOut = await applyAclReadGate(RESULTS, { userId: STRANGER });
    expect(strangerOut.map((r) => r.id)).toContain('mem-private');
  });
});
