export interface ProjectRecord {
    id: string;
    name: string;
    path: string;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
}
export declare function getProjectByPath(path: string): Promise<ProjectRecord | null>;
export declare function ensureProject(path?: string): Promise<ProjectRecord | null>;
//# sourceMappingURL=projects.d.ts.map