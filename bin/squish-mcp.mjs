#!/usr/bin/env node

/**
 * Squish MCP Server Entry Point
 * 
 * Usage:
 *   squish-mcp                    # STDIO mode (default)
 *   squish-mcp --http            # HTTP mode
 *   squish-mcp --port 8765      # Custom port
 *   squish-mcp --health         # Health check mode
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { attachChildLogging, getDefaultLogFile, resolveRuntimeLaunch } from './runtime-launcher.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
const isHttp = args.includes('--http');
const isHealth = args.includes('--health');
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? parseInt(args[portIndex + 1]) : 8765;

const rootDir = join(__dirname, '..');

const mcpArgs = [];

if (isHttp) {
  mcpArgs.push('--http', '--port', port.toString());
}

if (isHealth) {
  mcpArgs.push('--health');
}

const runtime = resolveRuntimeLaunch({
  rootDir,
  entryRelativePath: 'packages/mcp/src/index.ts',
  extraArgs: mcpArgs,
});

const child = spawn(runtime.command, runtime.args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: rootDir
});

// Relay stdin from OpenCode (or parent) to child MCP server
// Without this, the inherited pipe handle closes on Windows because
// squish-mcp never holds an active listener on stdin.
process.stdin.pipe(child.stdin);
process.stdin.resume();

// Handle pipe errors gracefully (parent stdin closed, etc.)
child.stdin.on('error', () => {});
process.stdin.on('error', () => {});

const logFile = process.env.SQUISH_LOG_FILE || getDefaultLogFile('mcp');
attachChildLogging(child, logFile);
console.error(`[squish-mcp] logging to ${logFile}`);

// Parent-death cleanup.
//
// This wrapper spawns the real MCP server (`bun/node packages/mcp/src/index.ts`)
// as a GRANDCHILD of whatever launched squish-mcp (an MCP client such as
// Claude/Codex/OpenCode, or an agent runtime). The wrapper only handled
// child -> parent death (`child.on('exit')` below): if the server exits, the
// wrapper exits. It did NOT handle parent -> child death. So when the wrapper
// was terminated — signal from the client's MCP teardown, stdin EOF, or an
// ungraceful death of the process that spawned it — the server grandchild was
// reparented to PID 1 and ran forever. Every ungraceful session teardown
// leaked one server process; over days this accumulates into hundreds of
// orphaned processes holding stale DB connections and large amounts of RAM.
//
// Fix: always take the grandchild down with the wrapper, across every exit
// path — catchable signals, stdin close, and (since SIGKILL of the wrapper is
// uncatchable) an orphan poll that watches whether our own spawner is gone.
let terminating = false;
function killChildAndExit(code) {
  if (terminating) return;
  terminating = true;
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
  const escalate = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }, 3000);
  if (typeof escalate.unref === 'function') escalate.unref();
  child.on('exit', () => process.exit(code || 0));
  // Never hang forever waiting on a wedged child.
  const hard = setTimeout(() => process.exit(code || 0), 4000);
  if (typeof hard.unref === 'function') hard.unref();
}

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => killChildAndExit(0));
}
// stdin EOF/close = the MCP client closed the pipe; shut the server down too.
process.stdin.on('end', () => killChildAndExit(0));
process.stdin.on('close', () => killChildAndExit(0));

// Orphan poll: a SIGKILL of THIS wrapper cannot be trapped, and `process.ppid`
// is captured once at startup and never refreshes — so instead probe whether
// the ORIGINAL parent PID still exists. `process.kill(pid, 0)` is a no-op
// existence check that throws ESRCH once the process is gone. The moment our
// spawner dies, reap the server and exit.
const origParent = process.ppid;
const orphanPoll = setInterval(() => {
  let parentGone = false;
  try {
    process.kill(origParent, 0);
  } catch (e) {
    parentGone = e && e.code === 'ESRCH';
  }
  if (parentGone || origParent === 1) {
    clearInterval(orphanPoll);
    killChildAndExit(0);
  }
}, 2000);
if (typeof orphanPoll.unref === 'function') orphanPoll.unref();

child.on('exit', (code) => process.exit(code || 0));
