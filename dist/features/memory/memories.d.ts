export type MemoryType = 'observation' | 'fact' | 'decision' | 'context' | 'preference';
export interface RememberInput {
    content: string;
    type?: MemoryType;
    tags?: string[];
    project?: string;
    metadata?: Record<string, unknown>;
    source?: string;
}
export interface SearchInput {
    query: string;
    type?: MemoryType;
    tags?: string[];
    limit?: number;
    project?: string;
}
export interface MemoryRecord {
    id: string;
    projectId?: string | null;
    type: MemoryType;
    content: string;
    summary?: string | null;
    tags: string[];
    metadata?: Record<string, unknown> | null;
    createdAt?: string | null;
}
export declare function rememberMemory(input: RememberInput): Promise<MemoryRecord>;
export declare function getMemoryById(id: string): Promise<MemoryRecord | null>;
export declare function getRecentMemories(projectPath: string, limit: number): Promise<MemoryRecord[]>;
export declare function searchMemories(input: SearchInput): Promise<MemoryRecord[]>;
//# sourceMappingURL=memories.d.ts.map