import { getProjectByPath } from '../features/search/entities.js';
import { getRecentMemories } from '../features/memory/memories.js';
import { getObservationsForProject } from './observations.js';
import { getEntitiesForProject } from '../features/search/entities.js';
import { getRecentMessagesForProject } from '../db/schema.js';
export async function getProjectContext(input) {
    const project = await getProjectByPath(input.project);
    const include = input.include ?? ['memories', 'observations'];
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
    if (!project) {
        return { project: null, memories: [], observations: [] };
    }
    const result = { project };
    if (include.includes('memories')) {
        result.memories = await getRecentMemories(project.path, limit);
    }
    if (include.includes('observations')) {
        result.observations = await getObservationsForProject(project.path, limit);
    }
    if (include.includes('entities')) {
        result.entities = await getEntitiesForProject(project.path, limit);
    }
    if (include.includes('messages')) {
        result.messages = await getRecentMessagesForProject(project.path, limit);
    }
    return result;
}
//# sourceMappingURL=context.js.map