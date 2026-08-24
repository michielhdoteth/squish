/**
 * Context Command - Show full project context (memories, beliefs, signals)
 *
 * First-class public surface restored in v2. Plugin hooks and scripts shell
 * out to this command; `squish status --context` remains the absorbed alias.
 *
 * Usage:
 *   squish context [--project /path] [--limit N] [--json]
 *   squish context --pinned
 *   squish context --tiers
 *   squish context --list-projects
 */

import { Command } from 'commander';

import { buildContextState, resolveProjectScope } from '../../../../core/runtime/trust-state.js';
import { formatContextReport } from '../../../../core/runtime/trust-report.js';
import { client } from '../program.js';
import { colors } from '../colors.js';

export function registerContextCommand(program: Command): void {
  program
    .command('context')
    .description('Show full project context (memories, beliefs, signals)')
    .option('--json', 'Emit machine-readable output', false)
    // Flags kept for compatibility with plugin tool wrappers that pass them
    // through to this command (same behavior as the status sub-modes).
    .option('--pinned', 'Show pinned memories instead of full context')
    .option('--tiers', 'Show memory count per tier instead of full context')
    .option('--projects', 'List registered projects')
    .option('--list-projects', 'Alias for --projects')
    .option('-p, --project <project>', 'Project path')
    .option('--limit <number>', 'Max memories to return', '10')
    .action(async (opts: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (opts.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        // Plugin hooks pass their working directory via --project. Auto-
        // register unknown paths instead of failing, mirroring how
        // `remember --project` scopes writes.
        if (opts.project) {
          const { ensureProject } = await import('../../../../core/projects.js');
          await ensureProject(opts.project);
        }

        if (opts.tiers) {
          const tiers = await client.getTierStats(opts.project);
          if (opts.json) {
            console.log(JSON.stringify({ ok: true, tiers }, null, 2));
            return;
          }
          console.log('Memory tiers:');
          for (const [tier, count] of Object.entries(tiers)) {
            console.log(`  ${tier}: ${count}`);
          }
          const total = Object.values(tiers).reduce((a, b) => a + b, 0);
          console.log(`  total: ${total}`);
          return;
        }

        if (opts.pinned) {
          const pinned = await client.getPinnedMemories(opts.project);
          if (opts.json) {
            console.log(JSON.stringify({ ok: true, count: pinned.length, pinned }, null, 2));
            return;
          }
          if (pinned.length === 0) {
            console.log('No pinned memories found.');
            return;
          }
          console.log(`Pinned memories (${pinned.length}):\n`);
          for (const m of pinned) {
            const content = (m.content || '(no content)').substring(0, 200);
            const tags = m.tags ? ` [${m.tags.join(', ')}]` : '';
            console.log(`  ${m.id}${tags}`);
            console.log(`  -> ${content}`);
            console.log();
          }
          return;
        }

        if (opts.projects || opts.listProjects) {
          const projects = await client.listProjects();
          const scope = await resolveProjectScope(opts.project);
          const payload = {
            ok: true,
            count: projects.length,
            currentProject: scope.currentProject,
            otherProjects: scope.otherProjects,
            projects: projects.map((project: any) => ({
              id: project.id,
              name: project.name,
              path: project.path,
              resolution: project.path === '.' ? 'legacy-placeholder' : (project.metadata?.source === 'mcp' ? 'auto-created' : 'inferred'),
            })),
            nextStep: scope.nextStep,
          };
          if (opts.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
          }
          console.log(colors.bold('Project Context'));
          console.log(colors.dim('─'.repeat(40)));
          console.log(formatContextReport({
            currentProject: scope.currentProject,
            otherProjects: scope.otherProjects,
            runtime: {
              sessionSummary: 'Project listing only',
              activePlaces: [],
              signalSummary: { captured: 0, suppressed: 0, sessionOnly: 0, durable: 0, durableWithRaw: 0 },
              graphSummary: 'Not loaded in list-only mode',
            },
            durableMemories: [],
            nextStep: scope.nextStep,
          }));
          return;
        }

        const context = await buildContextState(opts.project, parseInt(opts.limit) || 10);
        if (opts.json) {
          console.log(JSON.stringify({ ok: true, ...context }, null, 2));
          return;
        }
        console.log(colors.bold('Project Context'));
        console.log(colors.dim('─'.repeat(40)));
        console.log(formatContextReport(context));
      } catch (error: any) {
        if (opts.json) {
          console.error(JSON.stringify({ ok: false, error: error.message }));
        } else {
          console.error(`Error: ${error.message}`);
        }
        process.exit(1);
      } finally {
        if (opts.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });
}
