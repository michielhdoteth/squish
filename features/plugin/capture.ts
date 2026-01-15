/**
 * Auto-Capture System
 * Captures tool usage and user prompts as observations
 */

import type { PluginContext, CapturedObservation } from './types.js';
import { createObservation } from '../../core/observations.js';
import { shouldStore, stripPrivateTags } from '../../core/privacy.js';

type ObservationType = CapturedObservation['type'];

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function createObservationResult(
  id: string,
  type: ObservationType,
  action: string,
  target: string,
  summary: string,
  projectPath: string,
  details?: Record<string, unknown>
): CapturedObservation {
  return { id, type, action, target, summary, timestamp: new Date(), projectPath, details };
}

async function captureObservation(
  projectPath: string,
  type: ObservationType,
  action: string,
  target: string,
  summary: string,
  details: Record<string, unknown>,
  context: PluginContext
): Promise<CapturedObservation | null> {
  if (!(await shouldStore(summary, projectPath))) {
    console.error(`[squish] ${type} blocked by privacy filter`);
    return null;
  }

  const observation = await createObservation({
    type: type === 'user_prompt' ? 'insight' : type,
    action,
    target,
    summary,
    details: { ...details, timestamp: new Date().toISOString() },
    session: context.sessionId,
    project: projectPath
  });

  console.error(`[squish] Captured ${type}: ${observation.id}`);
  return createObservationResult(observation.id as string, type, action, target, summary, projectPath, details);
}

export async function captureUserPrompt(
  projectPath: string,
  prompt: string,
  context: PluginContext
): Promise<CapturedObservation | null> {
  const cleanPrompt = stripPrivateTags(prompt);
  const summary = truncate(cleanPrompt, 500);

  return captureObservation(
    projectPath,
    'user_prompt',
    'user_submitted_prompt',
    projectPath,
    summary,
    { fullPrompt: cleanPrompt, length: cleanPrompt.length, tags: ['auto-captured', 'user-prompt'] },
    context
  );
}

export async function captureToolUse(
  projectPath: string,
  toolName: string,
  toolArgs: Record<string, unknown> | undefined,
  toolResult: string | Record<string, unknown> | undefined,
  context: PluginContext
): Promise<CapturedObservation | null> {
  const argsSummary = toolArgs ? truncate(JSON.stringify(toolArgs), 200) : 'none';
  const resultSummary = typeof toolResult === 'string'
    ? truncate(toolResult, 200)
    : toolResult ? truncate(JSON.stringify(toolResult), 200) : 'no result';

  const summary = `Tool ${toolName} executed with args: ${argsSummary}`;

  return captureObservation(
    projectPath,
    'tool_use',
    toolName,
    projectPath,
    summary,
    { toolName, arguments: toolArgs, result: toolResult, tags: ['auto-captured', 'tool-use', toolName] },
    context
  );
}

export async function queueForSummarization(observationId: string): Promise<void> {
  console.error(`[squish] Queued observation ${observationId} for summarization`);
}

export async function captureFileChange(
  projectPath: string,
  filePath: string,
  changeType: 'created' | 'modified' | 'deleted',
  context: PluginContext
): Promise<CapturedObservation | null> {
  const summary = `File ${changeType}: ${filePath}`;

  return captureObservation(
    projectPath,
    'file_change',
    changeType,
    filePath,
    summary,
    { filePath, changeType, tags: ['auto-captured', 'file-change', changeType] },
    context
  );
}

export async function captureError(
  projectPath: string,
  error: Error,
  errorContext: string,
  pluginContext: PluginContext
): Promise<CapturedObservation | null> {
  const summary = `Error in ${errorContext}: ${error.message}`;

  return captureObservation(
    projectPath,
    'error',
    'error_occurred',
    errorContext,
    summary,
    { errorMessage: error.message, errorStack: error.stack, context: errorContext, tags: ['auto-captured', 'error'] },
    pluginContext
  );
}
