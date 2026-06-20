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

async function runSync(opts: { direction?: string; limit?: number }) {
  const auth = loadAuth();

  if (!auth) {
    console.log(c.yellow('Not connected to Squish Cloud'));
    console.log(`  Run ${c.cyan('squish cloud login')} to connect first`);
    return;
  }

  const direction = opts.direction || 'push';
  const limit = opts.limit || 100;

  const s = spinner();

  if (direction === 'push' || direction === 'both') {
    // Push local memories to cloud
    s.start('Reading local memories...');

    try {
      // Dynamic import to avoid circular deps
      const { getDb } = await import('../../../../db/index.js');
      const db = await getDb();

      // Get recent memories from local DB
      const memories = (db as any).$client
        .prepare(`
          SELECT id, content, type, tags, importance_score, source,
                 created_at, updated_at
          FROM memories
          WHERE is_active = 1
          ORDER BY updated_at DESC
          LIMIT ?
        `)
        .all(limit);

      if (memories.length === 0) {
        s.stop('No local memories to sync');
        outro('Nothing to sync. Create some memories first with `squish remember`.');
        return;
      }

      s.message(`Pushing ${memories.length} memories to cloud...`);

      // Push in batches of 10
      let pushed = 0;
      for (let i = 0; i < memories.length; i += 10) {
        const batch = memories.slice(i, i + 10);
        for (const mem of batch) {
          try {
            const tagsArray = mem.tags ? mem.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
            const result = await apiCall(auth.cloudUrl, '/api/memories', {
              method: 'POST',
              body: {
                content: mem.content,
                type: mem.type || 'insight',
                tags: tagsArray.length > 0 ? tagsArray : undefined,
                importance_score: mem.importance_score || 50,
                source: mem.source || 'squish-cli',
              },
              apiKey: auth.apiKey,
            });
            pushed++;
          } catch (err: any) {
            // Skip duplicates or errors - but log for debugging
            if (err.message && !err.message.includes('409')) {
              console.error(c.gray(`  Skip: ${err.message}`));
            }
          }
        }
      }

      s.stop(`Pushed ${pushed} memories to cloud`);
    } catch (err: any) {
      s.stop('Sync failed');
      console.error(c.red(`Error: ${err.message}`));
      return;
    }
  }

  if (direction === 'pull' || direction === 'both') {
    // Pull cloud memories to local
    s.start('Fetching cloud memories...');

    try {
      const result = await apiCall(auth.cloudUrl, '/api/memories?limit=100', {
        apiKey: auth.apiKey,
      });

      const cloudMemories = result.memories || result || [];

      if (cloudMemories.length === 0) {
        s.stop('No cloud memories to pull');
        return;
      }

      s.message(`Pulling ${cloudMemories.length} memories from cloud...`);

      // Dynamic import
      const { getDb } = await import('../../../../db/index.js');
      const db = await getDb();
      const client = (db as any).$client;

      let pulled = 0;
      for (const mem of cloudMemories) {
        try {
          // Check if exists locally
          const existing = client
            .prepare('SELECT id FROM memories WHERE id = ?')
            .get(mem.id);

          if (!existing) {
            client
              .prepare(`
                INSERT INTO memories (id, content, type, tags, importance_score, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `)
              .run(
                mem.id,
                mem.content,
                mem.type || 'insight',
                mem.tags || '',
                mem.importance_score || 50,
                mem.source || 'squish-cloud',
                toEpoch(mem.created_at),
                toEpoch(mem.updated_at),
              );
            pulled++;
          }
        } catch {
          // Skip errors
        }
      }

      s.stop(`Pulled ${pulled} new memories from cloud`);
    } catch (err: any) {
      s.stop('Pull failed');
      console.error(c.red(`Error: ${err.message}`));
    }
  }

  outro(c.green('Sync complete'));
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
