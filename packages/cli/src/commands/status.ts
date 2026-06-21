import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { probeSchemaHealth } from '../../../../db/schema-health.js';
import { allAgentStores } from '../../../../core/sessions/agent-stores/registry.js';

interface CloudAuth {
  email: string;
  projectName?: string;
  cloudUrl?: string;
}

const AUTH_FILE = path.join(os.homedir(), '.squish', 'auth.json');

function loadCloudAuth(): CloudAuth | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as CloudAuth;
  } catch {
    return null;
  }
}

function outputJson(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

function outputPretty(lines: string[]): void {
  process.stdout.write(lines.join('\n') + '\n');
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show launch readiness status for Squish')
    .option('--json', 'Emit machine-readable output', false)
    .option('--pretty', 'Human-readable output', false)
    .action(async (opts: { json?: boolean; pretty?: boolean }) => {
      const schema = await probeSchemaHealth();
      const stores = await Promise.all(
        allAgentStores().map(async (store) => {
          const status = await store.status();
          return {
            name: store.name,
            available: Boolean(status),
            path: status?.path,
            sessions: status?.sessions,
            messages: status?.messages,
            parts: status?.parts,
          };
        })
      );
      const cloud = loadCloudAuth();

      const payload = {
        ok: true,
        schema: {
          status: schema.status,
          detail: schema.detail,
        },
        cloud: cloud
          ? {
              connected: true,
              email: cloud.email,
              projectName: cloud.projectName ?? null,
              cloudUrl: cloud.cloudUrl ?? null,
            }
          : {
              connected: false,
            },
        stores,
      };

      if (opts.pretty) {
        outputPretty([
          `Schema: ${schema.status}`,
          `Cloud: ${cloud ? `connected (${cloud.email})` : 'disconnected'}`,
          ...stores.map((store) =>
            store.available
              ? `Store ${store.name}: available (${store.sessions ?? 0} sessions)`
              : `Store ${store.name}: unavailable`
          ),
        ]);
        return;
      }

      outputJson(payload);
    });
}
