/**
 * Squish Plugin Wrapper - Hook handlers for Claude Code integration
 */

import 'dotenv/config';
import type { PluginContext } from './types.js';
import { captureUserPrompt, captureToolUse, queueForSummarization } from './capture.js';
import { injectContextIntoSession } from './injection.js';
import { generateAndInjectFolderContext } from '../../features/search/folder-context.js';
import { getDb } from '../../db/index.js';
import { startWorker, stopWorker } from '../../core/worker.js';
import { getPinnedMemories } from '../../core/governance.js';
import { summarizeSession } from '../../core/summarization.js';
import { forceLifecycleMaintenance } from '../../core/worker.js';
import { config } from '../../config.js';

function getProjectPath(context: PluginContext): string {
  return context.workingDirectory || process.cwd();
}

function isAutoCapture(context: PluginContext): boolean {
  return context.config?.autoCapture !== false;
}

export async function onInstall(_context: PluginContext): Promise<void> {
  console.error('[squish] Installation hook triggered');
  await getDb();

  try {
    if (config.lifecycleEnabled || config.summarizationEnabled) {
      await startWorker();
      console.error('[squish] Background worker initialized');
    }
  } catch (error) {
    console.error('[squish] Failed to start background worker:', error);
  }

  console.error('[squish] Squish v0.3.0 ready');
}

export async function onSessionStart(context: PluginContext): Promise<void> {
  const projectPath = getProjectPath(context);
  console.error(`[squish] Session started in ${projectPath}`);

  if (context.config?.autoInject !== false) {
    await injectContextIntoSession(context, projectPath).catch(err =>
      console.error('[squish] Context injection error:', err)
    );
  }

  if (context.config?.generateFolderContext !== false) {
    await generateAndInjectFolderContext(projectPath).catch(err =>
      console.error('[squish] Folder context error:', err)
    );
  }

  if (config.governanceEnabled && context.config?.autoInject !== false) {
    try {
      const pinnedMemories = await getPinnedMemories();
      if (pinnedMemories.length > 0) {
        console.error(`[squish] Injecting ${pinnedMemories.length} pinned memories`);
      }
    } catch (error) {
      console.error('[squish] Failed to load pinned memories:', error);
    }
  }
}

export async function onUserPromptSubmit(context: PluginContext): Promise<void> {
  if (!isAutoCapture(context) || !context.userMessage) return;

  captureUserPrompt(getProjectPath(context), context.userMessage, context).catch(err =>
    console.error('[squish] Prompt capture error:', err)
  );
}

export async function onPostToolUse(context: PluginContext): Promise<void> {
  if (!isAutoCapture(context) || !context.toolName) return;

  const projectPath = getProjectPath(context);

  captureToolUse(projectPath, context.toolName, context.toolArguments, context.toolResult, context)
    .then(observation => {
      if (observation?.id) {
        queueForSummarization(observation.id).catch(err =>
          console.error('[squish] Summarization queue error:', err)
        );
      }
    })
    .catch(err => console.error('[squish] Tool capture error:', err));
}

export async function onSessionStop(context: PluginContext): Promise<void> {
  const projectPath = getProjectPath(context);
  console.error(`[squish] Session ended in ${projectPath}`);

  if (context.config?.generateFolderContext !== false) {
    await generateAndInjectFolderContext(projectPath).catch(err =>
      console.error('[squish] Final folder context error:', err)
    );
  }

  if (config.summarizationEnabled && context.sessionId) {
    try {
      await summarizeSession(context.sessionId, 'final');
      console.error('[squish] Session summarized (final)');
    } catch (error) {
      console.error('[squish] Failed to create final summary:', error);
    }
  }

  if (config.lifecycleEnabled) {
    try {
      await forceLifecycleMaintenance(projectPath);
      console.error('[squish] Lifecycle maintenance completed on session end');
    } catch (error) {
      console.error('[squish] Failed to run lifecycle maintenance:', error);
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
