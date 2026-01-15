/**
 * Squish Plugin Wrapper - Hook handlers for Claude Code integration
 */

import 'dotenv/config';
import type { PluginContext } from './types.js';
import { captureUserPrompt, captureToolUse, queueForSummarization } from './capture.js';
import { injectContextIntoSession } from './injection.js';
import { generateAndInjectFolderContext } from '../../features/search/folder-context.js';
import { getDb } from '../../db/index.js';

function getProjectPath(context: PluginContext): string {
  return context.workingDirectory || process.cwd();
}

function isAutoCapture(context: PluginContext): boolean {
  return context.config?.autoCapture !== false;
}

export async function onInstall(_context: PluginContext): Promise<void> {
  console.error('[squish] Installation hook triggered');
  await getDb();
  console.error('[squish] Squish v0.2.0 ready');
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
}

export default {
  onInstall,
  onSessionStart,
  onUserPromptSubmit,
  onPostToolUse,
  onSessionStop
};
