/**
 * Context Command - Get project context or list projects
 * 
 * Usage: squish context [--list-projects] [--project /path] [--pinned]
 */

import { Command } from 'commander';
import { getAllProjects } from '../../../../core/projects.js';
import { buildContextState, resolveProjectScope } from '../../../../core/runtime/trust-state.js';
import { formatContextReport } from '../../../../core/runtime/trust-report.js';
import { getPinnedMemories } from '../../../../core/security/governance.js';
import { getTierStats } from '../../../../core/memory/tiers.js';

export function registerContextCommand(program: Command) {
  program
    .command('context')
    .description('Show context or list projects')
    .option('--list-projects', 'List registered projects instead of loading context')
    .option('-p, --project <project>', 'Project path')
    .option('--limit <number>', 'Max memories to return', '10')
    .option('--json', 'Emit machine-readable output', false)
    .option('--pinned', 'Show pinned memories instead of full context', false)
    .option('--tiers', 'Show memory count per tier', false)
    .action(async (options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        // Handle --tiers flag: show memory count per tier
        if (options.tiers) {
          const tiers = await getTierStats(options.project);
          if (options.json) {
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

        // Handle --pinned flag: show pinned memories
        if (options.pinned) {
          const pinned = await getPinnedMemories(options.project);
          if (options.json) {
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

        if (options.listProjects) {
          const projects = await getAllProjects();
          const scope = await resolveProjectScope(options.project);
          const payload = {
            ok: true,
            count: projects.length,
            currentProject: scope.currentProject,
            otherProjects: scope.otherProjects,
            projects: projects.map((project) => ({
              id: project.id,
              name: project.name,
              path: project.path,
              resolution: project.path === '.' ? 'legacy-placeholder' : (project.metadata?.source === 'mcp' ? 'auto-created' : 'inferred'),
            })),
            nextStep: scope.nextStep,
          };
          if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
          }
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
        } else {
          const context = await buildContextState(options.project, parseInt(options.limit) || 10);
          if (options.json) {
            console.log(JSON.stringify({ ok: true, ...context }, null, 2));
            return;
          }
          console.log(formatContextReport(context));
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      } finally {
        if (options.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });
}
