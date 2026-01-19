/**
 * Agent-Aware Memory Management
 * Provides agent isolation and visibility rules
 */
export type VisibilityScope = 'private' | 'project' | 'team' | 'global';
export interface AgentContext {
    agentId: string;
    agentRole?: string;
    userId?: string;
    projectId?: string;
}
/**
 * Store a memory with agent context
 */
export declare function storeAgentMemory(content: string, context: AgentContext, options?: {
    type?: string;
    sector?: string;
    visibilityScope?: VisibilityScope;
    tags?: string[];
    metadata?: Record<string, unknown>;
}): Promise<string>;
//# sourceMappingURL=agent-memory.d.ts.map