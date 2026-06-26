export interface ProjectRecord {
    id: string;
    name: string;
    path: string;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
}
export declare function getProjectByPath(path: string): Promise<ProjectRecord | null>;
export declare function ensureProject(path?: string): Promise<ProjectRecord | null>;
export declare class ProjectNotFoundError extends Error {
    constructor(path: string);
}
export declare function requireProject(path: string): Promise<ProjectRecord>;
export declare function getOrCreateProject(path?: string): Promise<ProjectRecord | null>;
export declare function getAllProjects(): Promise<ProjectRecord[]>;
export declare function getProjectById(id: string): Promise<ProjectRecord | null>;
//# sourceMappingURL=projects.d.ts.map