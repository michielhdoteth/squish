/**
 * Folder Context Generation
 * Generates and maintains per-folder CLAUDE.md files with session summaries
 */
interface FolderContextData {
    projectPath: string;
    projectName: string;
    gitRemote?: string;
    gitBranch?: string;
    recentConversations: Array<{
        content: string;
        timestamp: string;
    }>;
    keyObservations: Array<{
        summary: string;
        timestamp: string;
        type: string;
    }>;
    lastUpdated: string;
}
export declare function generateAndInjectFolderContext(projectPath: string): Promise<void>;
export declare function readFolderContext(projectPath: string): Promise<FolderContextData | null>;
export declare function injectFolderContextIntoSession(projectPath: string): Promise<string>;
export {};
//# sourceMappingURL=folder-context.d.ts.map