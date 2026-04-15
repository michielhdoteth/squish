/**
 * Context Command - Get project context or list projects
 * 
 * Usage: squish context [--list-projects] [--project /path]
 */

import { Command } from 'commander';
import { requireProject, getAllProjects } from '../../../../core/projects.js';
import { search } from '../../../../core/memory/memories.js';
import { getLearnings } from '../../../../core/ingestion/learnings.js';

export function registerContextCommand(program: Command) {
  program
    .command('context')
    .description('Show context or list projects')
    .option('--list-projects', 'List registered projects instead of loading context')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .option('--limit <number>', 'Max memories to return', '10')
    .action(async (options: any) => {
      try {
        if (options.listProjects) {
          const projects = await getAllProjects();
          console.log(JSON.stringify({
            ok: true,
            count: projects.length,
            projects: projects.map(p => ({
              id: p.id,
              name: p.name,
              path: p.path
            }))
          }, null, 2));
        } else {
          const projectRecord = await requireProject(options.project);
          const memories = await search({
            query: '',
            project: options.project,
            limit: parseInt(options.limit) || 10
          });
          const learnings = await getLearnings(options.project, 5);
          console.log(JSON.stringify({
            ok: true,
            project: projectRecord,
            recentMemories: memories,
            recentLearnings: learnings
          }, null, 2));
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
