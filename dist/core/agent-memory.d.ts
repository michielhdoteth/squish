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
/**
 * Search memories accessible to an agent
 */
export declare function searchAgentMemories(query: string, context: AgentContext, options?: {
    includeShared?: boolean;
    limit?: number;
    type?: string;
}): Promise<any[]>;
/**
 * Get pinned memories for an agent
 */
export declare function getPinnedMemories(context: AgentContext, limit?: number): Promise<any[]>;
/**
 * Check if an agent can access a memory
 */
export declare function canAgentAccessMemory(memoryId: string, context: AgentContext): Promise<boolean>;
/**
 * List all agents that have stored memories
 */
export declare function listAgents(): Promise<any[]>;
/**
 * Get memory statistics for an agent
 */
export declare function getAgentStats(context: AgentContext): Promise<{
    totalMemories: number;
    byType: Record<string, number>;
    bySector: Record<string, number>;
    sharedMemories: number;
}>;
//# sourceMappingURL=agent-memory.d.ts.map