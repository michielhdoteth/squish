import { Command } from 'commander';
import { intro, outro, multiselect, isCancel, spinner, confirm } from '@clack/prompts';
import picocolors from 'picocolors';
import os from 'node:os';

import {
  detectClients,
  getClientName,
  checkShadowIssues,
  installAll,
  uninstallAll,
  getInstalledClients,
  SUPPORTED_AGENTS,
} from '../../../../bin/installer-core.mjs';

const c = picocolors;
const isTTY = process.stdin.isTTY;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function printLogo() {
  console.log(c.cyan(`
██████╗ ██████╗ ██╗   ██╗██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██║██╔════╝██║  ██║
██████╗██║   ██║██║   ██║██║███████╗███████║
╚════██║██║   ██║██║   ██║██║╚════██║██╔══██║
██████║╚██████╔╝╚██████╔╝██║███████║██║  ██║
╚═════╝ ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝
  `));
  console.log(c.gray('   Universal Memory System for AI Agents\n'));
}

function printHelp(cmd: 'install' | 'uninstall') {
  const prefix = cmd === 'install' ? 'Install' : 'Uninstall';
  const action = cmd === 'install' ? 'install' : 'remove';

  console.log(c.white(`${prefix} Squish integrations for AI clients:\n`));
  console.log(c.white('Usage:'));
  console.log(`  ${c.cyan(`squish ${cmd}`)}                 ${cmd === 'install' ? 'Interactive wizard' : 'Interactive uninstall wizard'}`);
  console.log(`  ${c.cyan(`squish ${cmd} --all`)}            ${action} for all detected clients`);
  console.log(`  ${c.cyan(`squish ${cmd} --clients=a,b`)}    ${action} for specific clients`);
  console.log(`  ${c.cyan(`squish ${cmd} --dry-run`)}        Preview without making changes\n`);
  console.log(c.white('Options:'));
  console.log(`  ${c.cyan('--all')}          ${action} for all supported clients`);
  console.log(`  ${c.cyan('--clients=')}     Comma-separated list of clients`);
  console.log(`  ${c.cyan('--dry-run')}      Preview changes without ${cmd === 'install' ? 'installing' : 'removing'}`);
  console.log(`  ${c.cyan('--help')}         Show this help message\n`);
  console.log(c.white('Supported clients:'));
  console.log(`  ${SUPPORTED_AGENTS.join(', ')}\n`);
}

interface CliOptions {
  all?: boolean;
  clients?: string;
  dryRun?: boolean;
  help?: boolean;
}

function parseOptions(opts: CliOptions) {
  return {
    all: opts.all === true,
    clients: opts.clients ? opts.clients.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
    dryRun: opts.dryRun === true,
    help: opts.help === true,
  };
}

// ---------------------------------------------------------------------------
// Install command
// ---------------------------------------------------------------------------

async function runInstall(opts: ReturnType<typeof parseOptions>) {
  // Check for shadow issues first
  const shadowIssues = checkShadowIssues();
  if (shadowIssues.length > 0) {
    console.error(c.red('Stale Bun global install is shadowing the current Squish binary.\n'));
    for (const issue of shadowIssues) {
      console.error(c.red(`  - ${issue.command}: ${issue.first}`));
      console.error(c.yellow(`    alternates: ${issue.alternates.join(', ')}\n`));
    }
    console.error(c.white('Fix:'));
    console.error(`  ${c.cyan('bun uninstall -g squish-memory')}`);
    console.error(`  ${c.cyan('Restart your shell and rerun to verify')}\n`);
    process.exit(1);
  }

  const availableAgents = detectClients();
  let clients: string[] = [];

  // Determine which clients to install for
  if (opts.all) {
    clients = availableAgents.length > 0 ? availableAgents : [...SUPPORTED_AGENTS];
    console.log(c.cyan(`Auto-installing for ${clients.length} clients...\n`));
  } else if (opts.clients.length > 0) {
    clients = opts.clients;
    // Warn about unsupported clients
    const unsupported = clients.filter((c) => !SUPPORTED_AGENTS.includes(c));
    if (unsupported.length > 0) {
      console.log(c.yellow(`Warning: unsupported clients ignored: ${unsupported.join(', ')}`));
    }
    clients = clients.filter((c) => SUPPORTED_AGENTS.includes(c));
    console.log(c.cyan(`Installing for: ${clients.join(', ')}\n`));
  } else if (isTTY) {
    // Interactive selection
    printLogo();
    intro(c.cyan('Squish Installer'));

    const options = availableAgents.map((agent) => ({
      value: agent,
      label: getClientName(agent),
      hint: 'Detected on system',
    }));

    if (options.length === 0) {
      // No clients detected, offer defaults
      const proceed = await confirm({
        message: 'No AI clients detected. Install for all supported clients?',
        initialValue: true,
      });

      if (isCancel(proceed) || !proceed) {
        outro(c.yellow('Install cancelled.'));
        process.exit(0);
      }

      clients = [...SUPPORTED_AGENTS];
    } else {
      const selected = await multiselect({
        message: 'Which AI agents do you want to install Squish for?',
        options,
        required: false,
      });

      if (isCancel(selected) || !selected || selected.length === 0) {
        outro(c.yellow('No clients selected. Install cancelled.'));
        process.exit(0);
      }

      clients = selected as string[];
    }
  } else {
    // No TTY, no flags - show help
    printHelp('install');
    process.exit(0);
  }

  // Execute install
  if (opts.dryRun) {
    console.log(c.yellow('\n--- DRY RUN ---\n'));
    for (const client of clients) {
      console.log(c.white(`  ${getClientName(client)}:`));
      console.log(`    MCP config     -> ${getTargetPath('mcp', client)}`);
      console.log(`    Plugin         -> ${getTargetPath('plugin', client)}`);
      console.log(`    Hooks          -> ${getTargetPath('hooks', client)}`);
    }
    console.log('');
    process.exit(0);
  }

  const s = spinner();
  s.start('Installing Squish integrations...');

  const results = installAll(clients);

  s.stop(c.green('Installation complete!'));

  // Report results
  let anyFailure = false;
  for (const [client, steps] of Object.entries(results)) {
    console.log(c.white(`\n${getClientName(client)}:`));
    for (const step of steps as Array<{ type: string; ok: boolean; error?: string; path?: string }>) {
      if (step.ok) {
        console.log(c.green(`  ✓ ${step.type.padEnd(8)} ${step.path || ''}`));
      } else {
        console.log(c.red(`  x ${step.type.padEnd(8)} ${step.error || 'failed'}`));
        anyFailure = true;
      }
    }
  }

  console.log('');
  console.log(c.white('What next?'));
  console.log(`  ${c.cyan('->')} Restart your AI assistant(s) to activate Squish`);
  console.log(`  ${c.cyan('->')} Try: squish remember "Your first memory"`);
  console.log(`  ${c.cyan('->')} Verify: squish-mcp --health`);
  console.log(`  ${c.cyan('->')} To remove: squish uninstall`);
  console.log('');

  outro(c.green('Squish installed!'));

  if (anyFailure) {
    process.exit(1);
  }
}

function getTargetPath(type: string, client: string): string {
  const homeDir = os.homedir();
  switch (type) {
    case 'mcp': {
      const paths: Record<string, string> = {
        'claude-code': `${homeDir}/.claude/mcp.json`,
        'opencode': `${homeDir}/.config/opencode/mcp-servers.json`,
        'openclaw': `${homeDir}/.openclaw/mcporter.json`,
        'codex': `${homeDir}/.codex/config.toml`,
      };
      return paths[client] || 'unknown';
    }
    case 'plugin': {
      const paths: Record<string, string> = {
        'claude-code': `${homeDir}/.claude/plugins/squish-memory/`,
        'opencode': `${homeDir}/.config/opencode/plugins/squish-memory/`,
        'openclaw': `${homeDir}/.openclaw/plugins/squish-memory/`,
      };
      return paths[client] || '(no plugin support)';
    }
    case 'hooks': {
      const paths: Record<string, string> = {
        'claude-code': `${homeDir}/.claude/settings.local.json (hooks)`,
        'opencode': `${homeDir}/.config/opencode/opencode.json (hooks)`,
      };
      return paths[client] || '(no hook support)';
    }
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Uninstall command
// ---------------------------------------------------------------------------

async function runUninstall(opts: ReturnType<typeof parseOptions>) {
  const installed = getInstalledClients();
  const detectedAgents = detectClients();

  let clients: string[] = [];

  // Determine which clients to uninstall
  if (opts.all) {
    clients = installed.length > 0
      ? installed.map((i: { client: string }) => i.client)
      : [...SUPPORTED_AGENTS];
    console.log(c.cyan(`Removing Squish for ${clients.length} clients...\n`));
  } else if (opts.clients.length > 0) {
    clients = opts.clients;
    console.log(c.cyan(`Removing for: ${clients.join(', ')}\n`));
  } else if (isTTY) {
    printLogo();
    intro(c.yellow('Squish Uninstaller'));

    // Show what's installed
    if (installed.length > 0) {
      console.log(c.white('Currently installed:'));
      for (const entry of installed as Array<{ client: string; installed: string[] }>) {
        console.log(`  ${c.green(getClientName(entry.client))}: ${entry.installed.join(', ')}`);
      }
      console.log('');
    }

    const allKnown = [...new Set([...detectedAgents, ...installed.map((i: { client: string }) => i.client), ...SUPPORTED_AGENTS])];
    const options = allKnown.map((agent) => ({
      value: agent,
      label: getClientName(agent),
      hint: installed.find((i: { client: string }) => i.client === agent) ? 'installed' : 'detected',
    }));

    const selected = await multiselect({
      message: 'Which clients do you want to remove Squish from?',
      options,
      required: true,
    });

    if (isCancel(selected) || !selected || selected.length === 0) {
      outro(c.yellow('Uninstall cancelled.'));
      process.exit(0);
    }

    clients = selected as string[];

    // Confirm
    const confirmed = await confirm({
      message: `Remove Squish from ${clients.length} client(s)? This cannot be undone.`,
      initialValue: false,
    });

    if (isCancel(confirmed) || !confirmed) {
      outro(c.yellow('Uninstall cancelled.'));
      process.exit(0);
    }
  } else {
    printHelp('uninstall');
    process.exit(0);
  }

  // Execute uninstall
  if (opts.dryRun) {
    console.log(c.yellow('\n--- DRY RUN ---\n'));
    for (const client of clients) {
      console.log(c.white(`  ${getClientName(client)}:`));
      const targets = getTargetPath('mcp', client);
      const pluginTarget = getTargetPath('plugin', client);
      console.log(`    MCP config     -> ${targets}`);
      if (pluginTarget !== '(no plugin support)') console.log(`    Plugin         -> ${pluginTarget}`);
    }
    console.log('');
    process.exit(0);
  }

  const s = spinner();
  s.start('Removing Squish integrations...');

  const results = uninstallAll(clients);

  s.stop(c.green('Uninstall complete!'));

  let anyFailure = false;
  for (const [client, steps] of Object.entries(results)) {
    console.log(c.white(`\n${getClientName(client)}:`));
    for (const step of steps as Array<{ type: string; ok: boolean; error?: string; path?: string }>) {
      if (step.ok) {
        console.log(c.green(`  ✓ ${step.type.padEnd(8)} removed`));
      } else {
        console.log(c.red(`  x ${step.type.padEnd(8)} ${step.error || 'failed'}`));
        anyFailure = true;
      }
    }
  }

  console.log('');
  outro(c.green('Squish removed from selected clients.'));

  if (anyFailure) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerInstallCommand(program: Command): void {
  const installCommand = new Command('install')
    .description('Install Squish integrations (MCP config + plugins + hooks) for AI clients')
    .option('--all', 'Install for all detected clients')
    .option('--clients <list>', 'Comma-separated list of clients (claude-code,opencode,openclaw,codex)')
    .option('--dry-run', 'Preview changes without installing')
    .action(async (opts: CliOptions) => {
      const parsed = parseOptions(opts);
      await runInstall(parsed);
    });

  program.addCommand(installCommand);
}

export function registerUninstallCommand(program: Command): void {
  const uninstallCommand = new Command('uninstall')
    .description('Remove Squish integrations (MCP config + plugins + hooks) from AI clients')
    .option('--all', 'Remove from all clients')
    .option('--clients <list>', 'Comma-separated list of clients (claude-code,opencode,openclaw,codex)')
    .option('--dry-run', 'Preview changes without removing')
    .action(async (opts: CliOptions) => {
      const parsed = parseOptions(opts);
      await runUninstall(parsed);
    });

  program.addCommand(uninstallCommand);
}
