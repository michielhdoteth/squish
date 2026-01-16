/**
 * Auto-Context Injection System
 * Injects relevant context into sessions
 */
import type { PluginContext } from './types.js';
export interface InjectionBudget {
    maxItems: number;
    maxTokens: number;
    relevanceThreshold: number;
    maxAge: number;
}
interface ContextItem {
    id: string;
    content: string;
    score: number;
}
export interface SelectedContext {
    memories: ContextItem[];
    conversations: ContextItem[];
    totalItems: number;
    estimatedTokens: number;
    injectionText: string;
}
export declare function injectContextIntoSession(context: PluginContext, projectPath: string): Promise<void>;
export declare function selectContextToInject(projectPath: string, budget: InjectionBudget): Promise<SelectedContext>;
export declare function applyAgeDecay(score: number, createdAt: Date, halfLife?: number): number;
export declare function rankByRelevance<T extends {
    score: number;
    createdAt?: Date;
}>(items: T[]): Array<T & {
    rankedScore: number;
}>;
export {};
//# sourceMappingURL=injection.d.ts.map