import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

export function resolveRuntimeLaunch({ rootDir, entryRelativePath, env = process.env, extraArgs = [] }) {
  const entryPath = path.join(rootDir, entryRelativePath);
  const bunPath = env.BUN ? normalizePath(env.BUN) : null;

  if (bunPath) {
    return {
      command: bunPath,
      args: [normalizePath(entryPath), ...extraArgs],
    };
  }

  const tsxCliPath = resolveTsxCliPath(rootDir);
  if (!tsxCliPath) {
    throw new Error('Missing runtime dependency: tsx. Install squish-memory with bundled dependencies before running the CLI.');
  }

  return {
    command: process.execPath,
    args: [normalizePath(tsxCliPath), normalizePath(entryPath), ...extraArgs],
  };
}

function resolveTsxCliPath(rootDir) {
  try {
    const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
    const tsxPackageJsonPath = requireFromRoot.resolve('tsx/package.json');
    const tsxCliPath = path.join(path.dirname(tsxPackageJsonPath), 'dist', 'cli.mjs');
    if (fs.existsSync(tsxCliPath)) return tsxCliPath;
  } catch {
    // Fall through to path-based lookup below.
  }

  const fallbackCandidates = [
    path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(rootDir, '..', 'tsx', 'dist', 'cli.mjs'),
    path.join(rootDir, '..', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
  ];

  for (const candidate of fallbackCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function getDefaultLogFile(serverName = 'mcp') {
  const logDir = path.join(os.homedir(), '.squish', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, `${serverName}.log`);
}

export function attachChildLogging(child, logFilePath) {
  const logPath = logFilePath || getDefaultLogFile('mcp');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const writeLog = (chunk) => {
    const text = chunk.toString();
    logStream.write(`[${new Date().toISOString()}] ${text}`);
  };

  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
    writeLog(chunk);
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });

  child.on('close', () => {
    logStream.end();
  });

  return logPath;
}
