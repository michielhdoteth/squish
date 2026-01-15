/**
 * Plugin Context Types
 * Defines the interface between Claude Code and Squish plugin
 */
export interface PluginConfig {
    autoCapture?: boolean;
    autoInject?: boolean;
    generateFolderContext?: boolean;
    privacyMode?: 'strict' | 'moderate' | 'off';
    maxContextItems?: number;
    maxContextTokens?: number;
}
export interface PluginContext {
    workingDirectory?: string;
    sessionId?: string;
    conversationId?: string;
    userMessage?: string;
    userRole?: 'user' | 'assistant';
    toolName?: string;
    toolArguments?: Record<string, any>;
    toolResult?: string | Record<string, any>;
    config?: PluginConfig;
    pluginVersion?: string;
    pluginPath?: string;
}
export interface SessionContext {
    id: string;
    workingDirectory: string;
    startTime: Date;
    conversationId: string;
    projectPath: string;
    gitRemote?: string;
    gitBranch?: string;
}
export interface CapturedObservation {
    id: string;
    type: 'tool_use' | 'user_prompt' | 'file_change' | 'error' | 'pattern' | 'insight';
    action: string;
    target: string;
    summary: string;
    details?: Record<string, any>;
    timestamp: Date;
    projectPath: string;
    sessionId?: string;
}
//# sourceMappingURL=types.d.ts.map