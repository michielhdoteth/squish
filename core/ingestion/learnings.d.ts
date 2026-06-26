/**
 * Learnings Module
 * Agent learnings: success, failure, fix, insight
 * With auto-linking to similar memories and learnings
 */
export type LearningType = 'success' | 'failure' | 'fix' | 'insight';
export interface LearningInput {
    type: LearningType;
    content: string;
    context?: string;
    action?: string;
    target?: string;
    project?: string;
    memoryId?: string;
    autoLink?: boolean;
}
export interface LearningRecord {
    id: string;
    projectId?: string | null;
    conversationId?: string | null;
    type: LearningType;
    action: string;
    target?: string | null;
    summary: string;
    details?: Record<string, unknown> | null;
    memoryId?: string | null;
    isImported?: boolean;
    createdAt?: string | null;
}
/**
 * Create a learning and optionally auto-link to similar memories/learnings
 */
export declare function createLearning(input: LearningInput): Promise<LearningRecord>;
/**
 * Get learnings for a project
 */
export declare function getLearnings(projectPath: string, limit: number): Promise<LearningRecord[]>;
/**
 * Get recent learnings
 */
export declare function getRecentLearnings(projectPath: string, limit?: number): Promise<LearningRecord[]>;
/**
 * Get learning by ID
 */
export declare function getLearningById(learningId: string): Promise<LearningRecord | null>;
/**
 * Get learnings linked to a specific memory
 */
export declare function getLearningsForMemory(memoryId: string): Promise<LearningRecord[]>;
/**
 * Delete a learning
 */
export declare function deleteLearning(learningId: string): Promise<boolean>;
export declare const getObservations: typeof getLearnings;
export declare const getRecentObservations: typeof getRecentLearnings;
export declare const getObservationById: typeof getLearningById;
//# sourceMappingURL=learnings.d.ts.map