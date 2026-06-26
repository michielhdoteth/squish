/**
 * Agent Preferences - Accumulate and retrieve agent preferences from learnings
 * Enables agents to learn and evolve over time
 */
/**
 * Update agent preference from a learning
 */
export declare function updateAgentPreference(projectId: string, content: string, sourceMemoryId?: string): Promise<void>;
/**
 * Get all agent preferences for a project
 */
export declare function getAgentPreferences(projectId: string): Promise<Array<{
    key: string;
    value: string;
}>>;
//# sourceMappingURL=agent-preferences.d.ts.map