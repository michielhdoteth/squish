/**
 * Squish Plugin Wrapper - Hook handlers for Claude Code integration
 */
import 'dotenv/config';
import { captureUserPrompt, captureToolUse, queueForSummarization } from './capture.js';
import { injectContextIntoSession } from './injection.js';
import { generateAndInjectFolderContext } from '../../features/search/folder-context.js';
import { getDb } from '../../db/index.js';
import { startWorker } from '../../core/worker.js';
import { getPinnedMemories } from '../../core/governance.js';
import { summarizeSession } from '../../core/summarization.js';
import { forceLifecycleMaintenance } from '../../core/worker.js';
import { config } from '../../config.js';
<<<<<<< HEAD
import { logger } from '../../core/logger.js';
=======
import { initializeCoreMemory } from '../../core/core-memory.js';
import { initializeContextSession } from '../../core/context-paging.js';
import { ensureProject } from '../../core/projects.js';
>>>>>>> pr-3-branch
function getProjectPath(context) {
    return context.workingDirectory || process.cwd();
}
function isAutoCapture(context) {
    return context.config?.autoCapture !== false;
}
export async function onInstall(_context) {
    logger.info('Installation hook triggered');
    await getDb();
    try {
        if (config.lifecycleEnabled || config.summarizationEnabled) {
            await startWorker();
            logger.info('Background worker initialized');
        }
    }
    catch (error) {
        logger.error('Failed to start background worker', error);
    }
    logger.info('Squish v0.3.0 ready');
}
export async function onSessionStart(context) {
    const projectPath = getProjectPath(context);
<<<<<<< HEAD
    logger.info(`Session started in ${projectPath}`);
=======
    console.error(`[squish] Session started in ${projectPath}`);
    // Initialize core memory and context session for this project
    try {
        const project = await ensureProject(projectPath);
        if (project?.id) {
            // Initialize core memory (creates sections if they don't exist)
            await initializeCoreMemory(project.id);
            console.error('[squish] Core memory initialized');
            // Initialize context session tracking
            if (context.sessionId) {
                await initializeContextSession(context.sessionId, project.id);
                console.error('[squish] Context session initialized');
            }
        }
    }
    catch (error) {
        console.error('[squish] Failed to initialize core memory/session:', error);
    }
>>>>>>> pr-3-branch
    if (context.config?.autoInject !== false) {
        await injectContextIntoSession(context, projectPath).catch(err => logger.error('Context injection error', err));
    }
    if (context.config?.generateFolderContext !== false) {
        await generateAndInjectFolderContext(projectPath).catch(err => logger.error('Folder context error', err));
    }
    if (config.governanceEnabled && context.config?.autoInject !== false) {
        try {
            const pinnedMemories = await getPinnedMemories();
            if (pinnedMemories.length > 0) {
                logger.info(`Injecting ${pinnedMemories.length} pinned memories`);
            }
        }
        catch (error) {
            logger.error('Failed to load pinned memories', error);
        }
    }
}
export async function onUserPromptSubmit(context) {
    if (!isAutoCapture(context) || !context.userMessage)
        return;
    captureUserPrompt(getProjectPath(context), context.userMessage, context).catch(err => logger.info('Prompt capture error', err));
}
export async function onPostToolUse(context) {
    if (!isAutoCapture(context) || !context.toolName)
        return;
    const projectPath = getProjectPath(context);
    captureToolUse(projectPath, context.toolName, context.toolArguments, context.toolResult, context)
        .then(observation => {
        if (observation?.id) {
            queueForSummarization(observation.id, projectPath).catch(err => logger.info('Summarization queue error', err));
        }
    })
        .catch(err => logger.error('Tool capture error', err));
}
export async function onSessionStop(context) {
    const projectPath = getProjectPath(context);
    logger.info(`Session ended in ${projectPath}`);
    if (context.config?.generateFolderContext !== false) {
        await generateAndInjectFolderContext(projectPath).catch(err => logger.error('Final folder context error', err));
    }
    if (config.summarizationEnabled && context.sessionId) {
        try {
            await summarizeSession(context.sessionId, 'final');
            logger.info('Session summarized (final)');
        }
        catch (error) {
            logger.error('Failed to create final summary', error);
        }
    }
    if (config.lifecycleEnabled) {
        try {
            await forceLifecycleMaintenance(projectPath);
            logger.info('Lifecycle maintenance completed on session end');
        }
        catch (error) {
            logger.error('Failed to run lifecycle maintenance', error);
        }
    }
}
export default {
    onInstall,
    onSessionStart,
    onUserPromptSubmit,
    onPostToolUse,
    onSessionStop
};
//# sourceMappingURL=plugin-wrapper.js.map