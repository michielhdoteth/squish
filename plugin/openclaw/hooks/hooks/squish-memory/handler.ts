/**
 * Squish Memory Hook Handler for OpenClaw
 *
 * Runs on session lifecycle events to inject and capture memories.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface HookEvent {
  event: string;
  workspace?: string;
  messages?: Array<{ role: string; content?: string }>;
}

async function runSquish(args: string[], cwd: string): Promise<string> {
  const cmd = process.platform === 'win32' ? 'squish.cmd' : 'squish';
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      cwd,
      env: { ...process.env, SQUISH_QUIET: '1' },
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });
    return stdout;
  } catch {
    return '';
  }
}

export async function handleEvent(event: HookEvent, workspace: string) {
  switch (event.event) {
    case 'session.start': {
      const result = await runSquish(['context', '--json', '--limit', '5', '--project', workspace], workspace);
      if (result) {
        try {
          const parsed = JSON.parse(result);
          const memories = parsed?.durableMemories || [];
          if (memories.length > 0) {
            return {
              prepend: memories.map((m: any) => `[Memory] ${m.content.slice(0, 200)}`).join('\n'),
            };
          }
        } catch {
          // Non-JSON output, ignore
        }
      }
      break;
    }

    case 'session.end': {
      const important = (event.messages || [])
        .filter((m) => m.role === 'user' && (m.content?.length || 0) > 20)
        .slice(-5)
        .map((m) => m.content?.slice(0, 100))
        .join(' | ');

      if (important) {
        await runSquish(
          ['remember', important, '--type', 'context', '--project', workspace, '--place', 'inbox'],
          workspace
        ).catch(() => null);
      }
      break;
    }
  }
}
