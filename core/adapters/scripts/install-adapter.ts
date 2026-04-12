/**
 * Install Adapter Script
 * 
 * Installs Squish MCP configuration for various AI coding agents.
 * Run with: bun run core/adapters/scripts/install-adapter.ts --agent claude-code
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

interface InstallOptions {
  agent: 'claude-code' | 'opencode' | 'cursor' | 'windsurf';
  projectRoot?: string;
  dryRun?: boolean;
}

// Config paths per agent
const AGENT_CONFIG_PATHS: Record<string, { dir: string; file: string }> = {
  'claude-code': {
    dir: '.claude',
    file: 'settings.json',
  },
  'opencode': {
    dir: '.opencode',
    file: 'settings.json',
  },
  'cursor': {
    dir: '.cursor',
    file: 'mcp.json',
  },
  'windsurf': {
    dir: '.windsurf',
    file: 'config.json',
  },
};

// MCP config templates
const MCP_CONFIGS: Record<string, object> = {
  'claude-code': {
    mcpServers: {
      squish: {
        command: 'node',
        args: ['dist/core/commands/mcp-server.js'],
        env: { NODE_ENV: 'production' }
      }
    }
  },
  'opencode': {
    mcpServers: {
      squish: {
        command: 'node',
        args: ['dist/core/commands/mcp-server.js']
      }
    }
  },
  'cursor': {
    mcpServers: {
      squish: {
        command: 'node',
        args: ['dist/core/commands/mcp-server.js'],
        env: { NODE_ENV: 'production' }
      }
    }
  },
  'windsurf': {
    mcpServers: {
      squish: {
        command: 'node',
        args: ['dist/core/commands/mcp-server.js'],
        env: { NODE_ENV: 'production' }
      }
    }
  }
};

function getConfigPath(agent: string): string {
  const home = homedir();
  const config = AGENT_CONFIG_PATHS[agent];
  return join(home, config.dir, config.file);
}

function installAdapter(options: InstallOptions): void {
  const { agent, projectRoot, dryRun } = options;
  
  const configPath = projectRoot 
    ? join(projectRoot, AGENT_CONFIG_PATHS[agent].dir, AGENT_CONFIG_PATHS[agent].file)
    : getConfigPath(agent);
    
  const configDir = dirname(configPath);
  const config = MCP_CONFIGS[agent];
  
  console.log(`Installing Squish MCP for ${agent}...`);
  console.log(`Config path: ${configPath}`);
  
  if (dryRun) {
    console.log(`[DRY RUN] Would write:`);
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  
  // Create directory if needed
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    console.log(`Created directory: ${configDir}`);
  }
  
  // Check if file exists and merge
  let existingConfig: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const existing = require('fs').readFileSync(configPath, 'utf-8');
      existingConfig = JSON.parse(existing);
      console.log(`Merging with existing config...`);
    } catch {
      console.log(`Warning: Could not parse existing config, overwriting`);
    }
  }
  
  // Merge configs - simplified
  const mergedConfig = {
    ...existingConfig,
    mcpServers: {
      ...((existingConfig as any).mcpServers || {}),
      ...(MCP_CONFIGS[agent] as any).mcpServers
    }
  };
  
  // Write config
  writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
  console.log(`Config written to: ${configPath}`);
  console.log(`\nTo activate:`);
  console.log(`  1. Restart ${agent}`);
  console.log(`  2. Or reload settings`);
}

// CLI handler
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let agent: string = 'claude-code';
  let dryRun = false;
  let projectRoot: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agent = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--project' && args[i + 1]) {
      projectRoot = args[i + 1];
      i++;
    }
  }
  
  if (!['claude-code', 'opencode', 'cursor', 'windsurf'].includes(agent)) {
    console.error(`Unknown agent: ${agent}`);
    console.log(`Usage: install-adapter.ts --agent [claude-code|opencode|cursor|windsurf] [--dry-run] [--project <path>]`);
    process.exit(1);
  }
  
  installAdapter({ 
    agent: agent as InstallOptions['agent'], 
    projectRoot,
    dryRun 
  });
}

export { installAdapter, AGENT_CONFIG_PATHS, MCP_CONFIGS };