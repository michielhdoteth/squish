/**
 * Squish Plugin Wrapper - Hook handlers for Claude Code integration
 */

import 'dotenv/config';
import type { PluginContext } from './types.js';
import { captureUserPrompt, captureToolUse, queueForSummarization } from './capture.js';
import { injectContextIntoSession } from './injection.js';
import { generateAndInjectFolderContext } from '../../core/search/folder-context.js';
import { getDb } from '../../db/index.js';
import { startWorker, stopWorker, forceLifecycleMaintenance } from '../../core/worker.js';
import { getPinnedMemories } from '../../core/governance.js';
import { summarizeSession } from '../../core/summarization.js';
import { config } from '../../config.js';
import { logger } from '../../core/logger.js';
import { initializeCoreMemory, formatCoreMemoryForInjection } from '../../core/core-memory.js';
import { initializeContextSession } from '../../core/context-paging.js';
import { ensureProject } from '../../core/projects.js';
import { hybridSearch } from '../../core/memory/hybrid-retrieval.js';
import { extractFacts } from '../../core/memory/fact-extractor.js';

function getProjectPath(context: PluginContext): string {
  return context.workingDirectory || process.cwd();
}

/**
 * Helper to log errors without breaking execution
 */
function logError(message: string, error: unknown): void {
  logger.error(message, error);
}

/**
 * Hybrid search configuration for smart context retrieval
 */
const SMART_SEARCH_CONFIG = {
  candidateLimit: 50,
  resultLimit: 3,
  hybridOptions: {
    weights: {
      semantic: 0.35,
      recency: 0.25,
      coactivation: 0.20,
      importance: 0.20,
    },
    decayDays: 7,
  },
};

function isAutoCapture(context: PluginContext): boolean {
  return context.config?.autoCapture !== false;
}

/**
 * Detect if user message looks like it's asking a question or seeking information
 */
function shouldSmartSearch(userMessage: string): boolean {
  if (!userMessage || userMessage.length < 3) return false;

  // Question detection: explicit question mark or question keywords
  const isExplicitQuestion = userMessage.includes('?');
  const questionKeywords = [
    'what ', 'where ', 'when ', 'how ', 'why ',
    'remember', 'recall', 'tell me', 'explain', 'show me',
    'find ', 'search ', 'look for', 'do you know'
  ];
  const isQuestionLike = questionKeywords.some(kw => userMessage.toLowerCase().includes(kw));

  // Context clue detection: user is trying to solve a problem or understand code
  const contextKeywords = [
    'debug', 'error', 'issue', 'problem', 'fix ',
    'broken', 'not working', 'why is', 'what went',
    'help', 'stuck', 'confused', 'doesn\'t work'
  ];
  const hasContextClue = contextKeywords.some(kw => userMessage.toLowerCase().includes(kw));

  return isExplicitQuestion || isQuestionLike || hasContextClue;
}

/**
 * Format memory search results for injection
 */
function formatMemoriesForInjection(memories: any[]): string {
  if (memories.length === 0) return '';

  const MAX_CONTENT_LENGTH = 150;
  const parts: string[] = ['## Relevant Memory\n'];

  memories.slice(0, 3).forEach((memory, index) => {
    const content = memory.content || '';
    const type = memory.type || 'memory';

    const truncated = content.length > MAX_CONTENT_LENGTH
      ? content.substring(0, MAX_CONTENT_LENGTH) + '...'
      : content;

    parts.push(`${index + 1}. [${type}] ${truncated.replace(/\n/g, ' ')}`);
  });

  return parts.join('\n');
}

/**
 * Wrap async function with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  defaultValue: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(defaultValue), timeoutMs))
  ]);
}

export async function onInstall(_context: PluginContext): Promise<void> {
  logger.info('Installation hook triggered');
  await getDb();

  try {
    if (config.lifecycleEnabled || config.summarizationEnabled) {
      await startWorker();
      logger.info('Background worker initialized');
    }
  } catch (error) {
    logger.error('Failed to start background worker', error);
  }

  logger.info('Squish v0.6.0 ready');
}

export async function onSessionStart(context: PluginContext): Promise<string> {
  const projectPath = getProjectPath(context);
  logger.info(`Session started in ${projectPath}`);

  let coreMemoryText = '';

  // Initialize core memory and context session for this project
  try {
    const project = await ensureProject(projectPath);
    if (project?.id) {
      // Initialize core memory (creates sections if they don't exist)
      await initializeCoreMemory(project.id);

      // NEW: Retrieve and format core memory for injection
      coreMemoryText = await withTimeout(
        formatCoreMemoryForInjection(project.id),
        2000,
        'Core memory loading timed out'
      );

      // Initialize context session tracking
      if (context.sessionId) {
        await initializeContextSession(context.sessionId, project.id);
      }
    }
  } catch (error) {
    logger.error('Failed to retrieve core memory:', error);
    return 'Core memory unavailable (database initialization in progress)';
  }

  if (context.config?.autoInject !== false) {
    await injectContextIntoSession(context, projectPath).catch(err =>
      logError('Context injection error', err)
    );
  }

  if (context.config?.generateFolderContext !== false) {
    await generateAndInjectFolderContext(projectPath).catch(err =>
      logError('Folder context error', err)
    );
  }

  if (config.governanceEnabled && context.config?.autoInject !== false) {
    try {
      const pinnedMemories = await getPinnedMemories();
      if (pinnedMemories.length > 0) {
        logger.info(`Injecting ${pinnedMemories.length} pinned memories`);
      }
    } catch (error) {
      logError('Failed to load pinned memories', error);
    }
  }

  // Return formatted core memory for hook injection
  return coreMemoryText || 'Core memory initialized (empty)';
}

export async function onUserPromptSubmit(context: PluginContext): Promise<string> {
  const projectPath = getProjectPath(context);

  // Keep existing auto-capture (background operation) - records user prompts for later analysis
  if (isAutoCapture(context) && context.userMessage) {
    captureUserPrompt(projectPath, context.userMessage, context).catch(err =>
      logger.info('Prompt capture error', err)
    );
  }

  // Smart heuristic search: Look for relevant memories only when user is asking questions or seeking help
  // This balances automation with user control - Claude still has final say via explicit /squish:search
  if (!context.userMessage || !shouldSmartSearch(context.userMessage)) {
    return '';
  }

  try {
    const project = await ensureProject(projectPath);
    if (!project?.id) {
      return '';
    }

    // Smart search with HYBRID scoring: semantic + recency + coactivation + importance
    // Fetches 50 candidates, re-ranks using multi-factor scoring, returns top 3
    const relevantMemories = await withTimeout(
      hybridSearch({
        query: context.userMessage,
        project: projectPath,
        ...SMART_SEARCH_CONFIG,
      }),
      2000,
      []
    );

    if (relevantMemories.length === 0) {
      return '';
    }

    const formattedMemories = formatMemoriesForInjection(relevantMemories);
    logger.info(`Smart search: Injecting ${relevantMemories.length} relevant memories`);

    return formattedMemories;
  } catch (error) {
    logger.error('Smart search failed:', error);
    return '';
  }
}

export async function onPostToolUse(context: PluginContext): Promise<void> {
  if (!isAutoCapture(context) || !context.toolName) return;

  const projectPath = getProjectPath(context);

  captureToolUse(projectPath, context.toolName, context.toolArguments, context.toolResult, context)
    .then(observation => {
      if (observation?.id) {
        queueForSummarization(observation.id, projectPath).catch(err =>
          logger.info('Summarization queue error', err)
        );
      }
    })
    .catch(err => logger.error('Tool capture error', err));
}

export async function onSessionStop(context: PluginContext): Promise<void> {
  const projectPath = getProjectPath(context);
  logger.info(`Session ended in ${projectPath}`);

  if (context.config?.generateFolderContext !== false) {
    await generateAndInjectFolderContext(projectPath).catch(err =>
      logger.error('Final folder context error', err)
    );
  }

  if (config.summarizationEnabled && context.sessionId) {
    try {
      await summarizeSession(context.sessionId, 'final');
      logger.info('Session summarized (final)');
    } catch (error) {
      logger.error('Failed to create final summary', error);
    }
  }

  if (config.lifecycleEnabled) {
    try {
      await forceLifecycleMaintenance(projectPath);
      logger.info('Lifecycle maintenance completed on session end');
    } catch (error) {
      logger.error('Failed to run lifecycle maintenance', error);
    }
  }
}

const SQUISH_VERSION = '0.6.0';

export async function onUpdate(context: PluginContext): Promise<string> {
  logger.info('Squish plugin update triggered');

  // The postinstall script should handle rebuilding
  // Just provide user feedback
  return `Squish v${SQUISH_VERSION} updated successfully. The MCP server will reconnect automatically.`;
}

export default {
  onInstall,
  onUpdate,
  onSessionStart,
  onUserPromptSubmit,
  onPostToolUse,
  onSessionStop
};
