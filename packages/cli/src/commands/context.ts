/**
 * Context Command - Get project context or list projects
 * 
 * Usage: squish context [--list-projects] [--project /path]
 */

import { Command } from 'commander';
import { getAllProjects } from '../../../../core/projects.js';
import { buildContextState, resolveProjectScope } from '../../../../core/runtime/trust-state.js';
import { formatContextReport } from '../../../../core/runtime/trust-report.js';

export function registerContextCommand(program: Command) {
  program
    .command('context')
    .description('Show context or list projects')
    .option('--list-projects', 'List registered projects instead of loading context')
    .option('-p, --project <project>', 'Project path')
    .option('--limit <number>', 'Max memories to return', '10')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
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
