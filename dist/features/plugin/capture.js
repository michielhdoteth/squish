/**
 * Auto-Capture System
 * Captures tool usage and user prompts as observations
 */
import { createObservation } from '../../core/observations.js';
import { shouldStore, stripPrivateTags } from '../../core/privacy.js';
function truncate(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}
function createObservationResult(id, type, action, target, summary, projectPath, details) {
    return { id, type, action, target, summary, timestamp: new Date(), projectPath, details };
}
async function captureObservation(projectPath, type, action, target, summary, details, context) {
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
    return createObservationResult(observation.id, type, action, target, summary, projectPath, details);
}
export async function captureUserPrompt(projectPath, prompt, context) {
    const cleanPrompt = stripPrivateTags(prompt);
    const summary = truncate(cleanPrompt, 500);
    return captureObservation(projectPath, 'user_prompt', 'user_submitted_prompt', projectPath, summary, { fullPrompt: cleanPrompt, length: cleanPrompt.length, tags: ['auto-captured', 'user-prompt'] }, context);
}
export async function captureToolUse(projectPath, toolName, toolArgs, toolResult, context) {
    const argsSummary = toolArgs ? truncate(JSON.stringify(toolArgs), 200) : 'none';
    const resultSummary = typeof toolResult === 'string'
        ? truncate(toolResult, 200)
        : toolResult ? truncate(JSON.stringify(toolResult), 200) : 'no result';
    const summary = `Tool ${toolName} executed with args: ${argsSummary}`;
    return captureObservation(projectPath, 'tool_use', toolName, projectPath, summary, { toolName, arguments: toolArgs, result: toolResult, tags: ['auto-captured', 'tool-use', toolName] }, context);
}
export async function queueForSummarization(observationId) {
    console.error(`[squish] Queued observation ${observationId} for summarization`);
}
export async function captureFileChange(projectPath, filePath, changeType, context) {
    const summary = `File ${changeType}: ${filePath}`;
    return captureObservation(projectPath, 'file_change', changeType, filePath, summary, { filePath, changeType, tags: ['auto-captured', 'file-change', changeType] }, context);
}
export async function captureError(projectPath, error, errorContext, pluginContext) {
    const summary = `Error in ${errorContext}: ${error.message}`;
    return captureObservation(projectPath, 'error', 'error_occurred', errorContext, summary, { errorMessage: error.message, errorStack: error.stack, context: errorContext, tags: ['auto-captured', 'error'] }, pluginContext);
}
//# sourceMappingURL=capture.js.map