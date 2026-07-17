/**
 * Cloud Command Group - Connect CLI to Squish Cloud
 *
 * Usage:
 *   squish cloud login              # Login or signup
 *   squish cloud status             # Show cloud connection status
 *   squish cloud sync               # Sync local memories to cloud
 *   squish cloud logout             # Remove cloud credentials
 */

import { Command } from 'commander';
import { intro, outro, text, confirm, spinner, password } from '@clack/prompts';
import picocolors from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const c = picocolors;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert ISO string or epoch to epoch seconds for SQLite */
function toEpoch(val: any): number {
  if (!val) return Math.floor(Date.now() / 1000);
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? Math.floor(Date.now() / 1000) : Math.floor(d.getTime() / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Auth storage
// ---------------------------------------------------------------------------

interface CloudAuth {
  email: string;
  apiKey: string;
  projectId: string;
  projectName: string;
  cloudUrl: string;
  loggedInAt: string;
}

const AUTH_FILE = path.join(os.homedir(), '.squish', 'auth.json');

function loadAuth(): CloudAuth | null {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    }
  } catch {
    // corrupted auth file
  }
  return null;
}

function saveAuth(auth: CloudAuth): void {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf-8');
}

function clearAuth(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiCall(cloudUrl: string, endpoint: string, options: {
  method?: string;
  body?: Record<string, unknown>;
  apiKey?: string;
  timeout?: number;
} = {}): Promise<any> {
  const { method = 'GET', body, apiKey, timeout = 15000 } = options;
  const url = `${cloudUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Login command
// ---------------------------------------------------------------------------

async function runLogin(opts: { email?: string; url?: string }) {
  intro(c.cyan('Squish Cloud Login'));

  const cloudUrl = opts.url || 'https://api.squishplugin.dev';

  // Check if already logged in
  const existing = loadAuth();
  if (existing) {
    const proceed = await confirm({
      message: `Already logged in as ${c.cyan(existing.email)}. Switch account?`,
      initialValue: false,
    });
    if (!proceed) {
      outro('Cancelled.');
      return;
    }
  }

  // Get email
  let email = opts.email;
  if (!email) {
    const input = await text({
      message: 'Email address:',
      validate: (val) => {
        if (!val || !val.includes('@')) return 'Please enter a valid email address';
        return undefined;
      },
    });
    if (typeof input === 'symbol') { outro('Cancelled.'); return; }
    email = input;
  }

  // Try login first, then signup if not found
  const s = spinner();
  let auth: CloudAuth;

  try {
    // Try login
    s.start('Connecting to Squish Cloud...');
    const loginResult = await apiCall(cloudUrl, '/api/auth/login', {
      method: 'POST',
      body: { email },
    });

    // API returns snake_case: api_key, project_id
    const loginApiKey = loginResult.api_key || loginResult.apiKey;
    if (loginApiKey && loginResult.success) {
      // Login succeeded
      s.stop('Logged in successfully');

      auth = {
        email,
        apiKey: loginApiKey,
        projectId: loginResult.project_id || '',
        projectName: email.split('@')[0],
        cloudUrl,
        loggedInAt: new Date().toISOString(),
      };

      // Try to get richer project info from /me
      try {
        const meResult = await apiCall(cloudUrl, '/api/auth/me', {
          apiKey: loginApiKey,
        });
        if (meResult.name) auth.projectName = meResult.name;
        if (meResult.id) auth.projectId = meResult.id;
      } catch {
        // Use what we have from login
      }

      saveAuth(auth);
      showLoginSuccess(auth);
      return;
    }
  } catch (err: any) {
    // Login failed - try signup
    s.message('Account not found. Creating new account...');
  }

  try {
    // Signup
    s.start('Creating account...');
    const signupResult = await apiCall(cloudUrl, '/api/auth/signup', {
      method: 'POST',
      body: { email, name: email.split('@')[0] },
    });

    // API returns snake_case: api_key, project_id
    const signupApiKey = signupResult.api_key || signupResult.apiKey;
    if (!signupApiKey) {
      throw new Error(signupResult.error || 'Failed to create account');
    }

    s.stop('Account created');

    auth = {
      email,
      apiKey: signupApiKey,
      projectId: signupResult.project_id || '',
      projectName: email.split('@')[0],
      cloudUrl,
      loggedInAt: new Date().toISOString(),
    };

    // Try to get richer project info from /me
    try {
      const meResult = await apiCall(cloudUrl, '/api/auth/me', {
        apiKey: signupApiKey,
      });
      if (meResult.name) auth.projectName = meResult.name;
      if (meResult.id) auth.projectId = meResult.id;
    } catch {
      // Use what we have from signup
    }

    saveAuth(auth);
    showLoginSuccess(auth);
  } catch (err: any) {
    s.stop('Failed to connect');
    outro(c.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

function showLoginSuccess(auth: CloudAuth) {
  outro(c.green('Connected to Squish Cloud'));
  console.log('');
  console.log(`  ${c.gray('Email:')}    ${auth.email}`);
  console.log(`  ${c.gray('Project:')}  ${auth.projectName}`);
  console.log(`  ${c.gray('API URL:')}  ${auth.cloudUrl}`);
  console.log(`  ${c.gray('API Key:')}  ${auth.apiKey.slice(0, 8)}...${auth.apiKey.slice(-4)}`);
  console.log('');
  console.log(c.gray('  Run `squish cloud status` to check connection'));
  console.log(c.gray('  Run `squish cloud sync` to upload memories'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Status command
// ---------------------------------------------------------------------------

async function runStatus() {
  const auth = loadAuth();

  if (!auth) {
    console.log(c.yellow('Not connected to Squish Cloud'));
    console.log('');
    console.log(`  Run ${c.cyan('squish cloud login')} to connect`);
    console.log('');
    return;
  }

  const s = spinner();
  s.start('Checking cloud connection...');

  try {
    const health = await apiCall(auth.cloudUrl, '/api/health', {
      timeout: 5000,
    });

    const me = await apiCall(auth.cloudUrl, '/api/auth/me', {
      apiKey: auth.apiKey,
    });

    s.stop('Connected');

    // API returns snake_case: name, plan, requests_used, requests_limit
    const projectName = me.name || auth.projectName;
    const plan = me.plan || 'unknown';
    const used = me.requests_used ?? '?';
    const limit = me.requests_limit ?? '?';

    console.log('');
    console.log(c.green('  Squish Cloud - Connected'));
    console.log('');
    console.log(`  ${c.gray('Email:')}      ${auth.email}`);
    console.log(`  ${c.gray('Project:')}    ${projectName}`);
    console.log(`  ${c.gray('Plan:')}       ${plan}`);
    console.log(`  ${c.gray('Usage:')}      ${used} / ${limit} requests`);
    console.log(`  ${c.gray('API URL:')}    ${auth.cloudUrl}`);
    console.log(`  ${c.gray('Logged in:')}  ${new Date(auth.loggedInAt).toLocaleDateString()}`);
    console.log(`  ${c.gray('API Status:')} ${health.status === 'ok' ? c.green('Healthy') : c.red('Degraded')}`);
    console.log('');

    // Show memory count if available
    try {
      const memories = await apiCall(auth.cloudUrl, '/api/memories?limit=1', {
        apiKey: auth.apiKey,
      });
      const count = memories.total || memories.count || (Array.isArray(memories) ? memories.length : 0);
      if (count > 0) {
        console.log(`  ${c.gray('Memories:')}  ${c.cyan(String(count))} in cloud`);
      }
    } catch {
      // Memory count not available
    }
    console.log('');
  } catch (err: any) {
    s.stop('Connection check failed');
    console.log('');
    console.log(c.red(`  Error: ${err.message}`));
    console.log(c.gray(`  Logged in: ${new Date(auth.loggedInAt).toLocaleDateString()}`));
    console.log(c.gray(`  API URL: ${auth.cloudUrl}`));
    console.log('');
    console.log(`  Run ${c.cyan('squish cloud login')} to reconnect`);
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Sync command
// ---------------------------------------------------------------------------

interface SyncStats {
  pushed: number;
  pulled: number;
  skipped: number;
  failed: number;
  errors: string[];
}

async function runSync(opts: {
  direction?: string;
  limit?: number;
  dryRun?: boolean;
  type?: string;
  since?: string;
  retry?: number;
}) {
  const auth = loadAuth();

  if (!auth) {
    console.log(c.yellow('Not connected to Squish Cloud'));
    console.log(`  Run ${c.cyan('squish cloud login')} to connect first`);
    return;
  }

  const direction = opts.direction || 'push';
  const limit = opts.limit || 500;
  const dryRun = opts.dryRun || false;
  const since = opts.since ? new Date(opts.since) : null;
  const maxRetries = opts.retry || 2;

  const stats: SyncStats = { pushed: 0, pulled: 0, skipped: 0, failed: 0, errors: [] };

  if (dryRun) {
    console.log(c.yellow('  DRY RUN - no changes will be made'));
    console.log('');
  }

  // ---- PUSH ----
  if (direction === 'push' || direction === 'both') {
    const s = spinner();
    s.start('Reading local memories...');

    try {
      const { getDb } = await import('../../../../db/index.js');
      const db = await getDb();
      const client = (db as any).$client;

      // Build query with optional filters
      let query = `
        SELECT id, content, type, tags, importance_score, source,
               summary, confidence, visibility_scope,
               created_at, updated_at
        FROM memories
        WHERE is_active = 1
      `;
      const params: any[] = [];

      if (since) {
        query += ` AND updated_at > ?`;
        params.push(Math.floor(since.getTime() / 1000));
      }
      if (opts.type) {
        query += ` AND type = ?`;
        params.push(opts.type);
      }

      query += ` ORDER BY updated_at DESC LIMIT ?`;
      params.push(limit);

      const memories = client.prepare(query).all(...params);

      if (memories.length === 0) {
        s.stop('No local memories to sync');
        outro('Nothing to sync.');
        return;
      }

      console.log(c.cyan(`  Found ${memories.length} local memories`));
      if (since) console.log(c.gray(`  Since: ${since.toLocaleDateString()}`));
      if (opts.type) console.log(c.gray(`  Type: ${opts.type}`));
      console.log('');

      if (dryRun) {
        // Show what would be pushed
        for (const mem of memories.slice(0, 20)) {
          const preview = mem.content.substring(0, 60).replace(/\n/g, ' ');
          console.log(`  ${c.gray('[' + (mem.type || 'note') + ']')} ${preview}...`);
        }
        if (memories.length > 20) {
          console.log(c.gray(`  ... and ${memories.length - 20} more`));
        }
        s.stop(`Would push ${memories.length} memories`);
      } else {
        s.message(`Pushing ${memories.length} memories to cloud...`);

        let pushed = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < memories.length; i++) {
          const mem = memories[i];
          const progress = `[${i + 1}/${memories.length}]`;

          // Retry logic
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              const tagsArray = mem.tags
                ? mem.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                : [];

              await apiCall(auth.cloudUrl, '/api/memories', {
                method: 'POST',
                body: {
                  content: mem.content,
                  title: mem.summary || undefined,
                  type: mem.type || 'fact',
                  tags: tagsArray.length > 0 ? tagsArray : undefined,
                  visibility_scope: mem.visibility_scope || 'private',
                  source: mem.source || 'squish-local',
                },
                apiKey: auth.apiKey,
              });
              pushed++;
              break; // Success, no more retries
            } catch (err: any) {
              if (attempt === maxRetries) {
                failed++;
                const msg = err.message || 'unknown error';
                if (!msg.includes('409') && errors.length < 5) {
                  errors.push(`${progress} ${msg}`);
                }
              } else {
                // Wait before retry (exponential backoff)
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
              }
            }
          }

          // Update spinner every 10 memories
          if ((i + 1) % 10 === 0 || i === memories.length - 1) {
            s.message(`Pushing... ${i + 1}/${memories.length} (${pushed} ok, ${failed} failed)`);
          }
        }

        stats.pushed = pushed;
        stats.failed += failed;
        stats.errors.push(...errors);
        s.stop(`Pushed ${pushed} memories to cloud${failed > 0 ? c.yellow(` (${failed} failed)`) : ''}`);
      }
    } catch (err: any) {
      s.stop('Push failed');
      console.error(c.red(`Error: ${err.message}`));
      return;
    }
  }

  // ---- PULL ----
  if (direction === 'pull' || direction === 'both') {
    const s = spinner();
    s.start('Fetching cloud memories...');

    try {
      let allCloudMemories: any[] = [];
      let page = 1;
      const perPage = 100;

      // Paginate through all cloud memories
      while (true) {
        const result = await apiCall(auth.cloudUrl, `/api/memories?limit=${perPage}&page=${page}`, {
          apiKey: auth.apiKey,
        });

        const batch = result.memories || result || [];
        if (batch.length === 0) break;
        allCloudMemories.push(...batch);
        if (batch.length < perPage) break;
        page++;
      }

      if (allCloudMemories.length === 0) {
        s.stop('No cloud memories to pull');
        return;
      }

      // Apply filters
      if (since) {
        allCloudMemories = allCloudMemories.filter((m: any) =>
          new Date(m.updated_at || m.created_at) >= since
        );
      }
      if (opts.type) {
        allCloudMemories = allCloudMemories.filter((m: any) => m.type === opts.type);
      }

      console.log(c.cyan(`  Found ${allCloudMemories.length} cloud memories`));
      console.log('');

      if (dryRun) {
        for (const mem of allCloudMemories.slice(0, 20)) {
          const preview = (mem.content || '').substring(0, 60).replace(/\n/g, ' ');
          console.log(`  ${c.gray('[' + (mem.type || 'note') + ']')} ${preview}...`);
        }
        if (allCloudMemories.length > 20) {
          console.log(c.gray(`  ... and ${allCloudMemories.length - 20} more`));
        }
        s.stop(`Would pull ${allCloudMemories.length} memories`);
      } else {
        s.message(`Pulling ${allCloudMemories.length} memories from cloud...`);

        const { getDb } = await import('../../../../db/index.js');
        const db = await getDb();
        const client = (db as any).$client;

        let pulled = 0;
        let skipped = 0;

        for (let i = 0; i < allCloudMemories.length; i++) {
          const mem = allCloudMemories[i];

          try {
            // Check if exists locally (by content hash or ID)
            const existing = client
              .prepare('SELECT id FROM memories WHERE id = ? OR content = ?')
              .get(mem.id, mem.content);

            if (existing) {
              skipped++;
              continue;
            }

            // Map cloud fields to local schema
            const tagsStr = Array.isArray(mem.tags)
              ? mem.tags.join(', ')
              : (mem.tags || '');

            client
              .prepare(`
                INSERT INTO memories (id, content, type, tags, importance_score, source,
                                      summary, confidence, created_at, updated_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
              `)
              .run(
                mem.id || `cloud-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                mem.content,
                mem.type || 'fact',
                tagsStr,
                mem.importance_score || 50,
                mem.source || 'squish-cloud',
                mem.title || mem.summary || null,
                mem.confidence || null,
                toEpoch(mem.created_at),
                toEpoch(mem.updated_at),
              );
            pulled++;
          } catch {
            skipped++;
          }

          if ((i + 1) % 20 === 0 || i === allCloudMemories.length - 1) {
            s.message(`Pulling... ${i + 1}/${allCloudMemories.length} (${pulled} new, ${skipped} skipped)`);
          }
        }

        stats.pulled = pulled;
        stats.skipped += skipped;
        s.stop(`Pulled ${pulled} new memories from cloud${skipped > 0 ? c.gray(` (${skipped} skipped)`) : ''}`);
      }
    } catch (err: any) {
      s.stop('Pull failed');
      console.error(c.red(`Error: ${err.message}`));
    }
  }

  // ---- Summary ----
  console.log('');
  if (dryRun) {
    console.log(c.yellow('  Dry run complete. Remove --dry-run to execute.'));
  } else {
    console.log(c.green('  Sync complete'));
    if (stats.pushed > 0) console.log(`  ${c.gray('Pushed:')}  ${stats.pushed}`);
    if (stats.pulled > 0) console.log(`  ${c.gray('Pulled:')}  ${stats.pulled}`);
    if (stats.skipped > 0) console.log(`  ${c.gray('Skipped:')} ${stats.skipped}`);
    if (stats.failed > 0) console.log(`  ${c.gray('Failed:')}  ${c.red(String(stats.failed))}`);
  }
  if (stats.errors.length > 0) {
    console.log('');
    console.log(c.yellow('  Errors:'));
    for (const err of stats.errors) {
      console.log(c.red(`    ${err}`));
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Logout command
// ---------------------------------------------------------------------------

async function runLogout() {
  const auth = loadAuth();

  if (!auth) {
    console.log(c.yellow('Not connected to Squish Cloud'));
    return;
  }

  const proceed = await confirm({
    message: `Logout from ${c.cyan(auth.email)}?`,
    initialValue: false,
  });

  if (!proceed) {
    outro('Cancelled.');
    return;
  }

  clearAuth();
  outro(c.green('Logged out from Squish Cloud'));
  console.log(c.gray('  Local memories are preserved.'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Register all cloud subcommands
// ---------------------------------------------------------------------------

export function registerCloudCommand(program: Command) {
  const cloud = program
    .command('cloud')
    .description('Connect to Squish Cloud for sync and team features');

  cloud
    .command('login')
    .description('Login or create a Squish Cloud account')
    .option('-e, --email <email>', 'Email address (skip prompt)')
    .option('-u, --url <url>', 'Cloud API URL', 'https://api.squishplugin.dev')
    .action(runLogin);

  cloud
    .command('status')
    .description('Show cloud connection status')
    .action(runStatus);

  cloud
    .command('sync')
    .description('Sync local memories with Squish Cloud')
    .option('-d, --direction <dir>', 'Sync direction: push, pull, or both', 'push')
    .option('-l, --limit <n>', 'Max memories to sync', '100')
    .action((opts: any) => runSync({ direction: opts.direction, limit: parseInt(opts.limit, 10) || 100 }));

  cloud
    .command('logout')
    .description('Remove cloud credentials')
    .action(runLogout);
}
