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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
const isHttp = args.includes('--http');
const isHealth = args.includes('--health');
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? parseInt(args[portIndex + 1]) : 8765;

// Use bun to run the MCP server
const bunPath = process.env.BUN?.replace(/\\/g, '/') || 'bun';
const mcpPath = join(__dirname, '..', 'packages', 'mcp', 'src', 'index.ts');

const mcpArgs = [];

if (isHttp) {
  mcpArgs.push('--http', '--port', port.toString());
}

if (isHealth) {
  mcpArgs.push('--health');
}

const child = spawn(bunPath, [mcpPath, ...mcpArgs], {
  stdio: 'inherit',
  cwd: join(__dirname, '..')
});

child.on('exit', (code) => process.exit(code || 0));
