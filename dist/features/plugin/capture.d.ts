/**
 * Auto-Capture System
 * Captures tool usage and user prompts as observations
 */
import type { PluginContext, CapturedObservation } from './types.js';
export declare function captureUserPrompt(projectPath: string, prompt: string, context: PluginContext): Promise<CapturedObservation | null>;
export declare function captureToolUse(projectPath: string, toolName: string, toolArgs: Record<string, unknown> | undefined, toolResult: string | Record<string, unknown> | undefined, context: PluginContext): Promise<CapturedObservation | null>;
export declare function queueForSummarization(observationId: string): Promise<void>;
export declare function captureFileChange(projectPath: string, filePath: string, changeType: 'created' | 'modified' | 'deleted', context: PluginContext): Promise<CapturedObservation | null>;
export declare function captureError(projectPath: string, error: Error, errorContext: string, pluginContext: PluginContext): Promise<CapturedObservation | null>;
//# sourceMappingURL=capture.d.ts.map