import { getProjectByPath } from './projects.js';
import { getRecent } from './memory/memories.js';
import { getObservations } from './observations.js';
import { getEntitiesForProject } from './search/entities.js';

export interface ContextInput {
  project: string;
  include?: Array<'memories' | 'observations' | 'entities'>;
  limit?: number;
}

export async function getProjectContext(input: ContextInput): Promise<Record<string, unknown>> {
  const project = await getProjectByPath(input.project);
  const include = input.include ?? ['memories', 'observations'];
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);

  if (!project) {
    return { project: null, memories: [], observations: [] };
  }

  const result: Record<string, unknown> = { project };

  if (include.includes('memories')) {
    result.memories = await getRecent(project.path, limit);
  }

  if (include.includes('observations')) {
    result.observations = await getObservations(project.path, limit);
  }

  if (include.includes('entities')) {
    result.entities = await getEntitiesForProject(project.path, limit);
  }

  return result;
}


