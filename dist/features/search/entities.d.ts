export interface EntityRecord {
    id: string;
    projectId?: string | null;
    name: string;
    type: string;
    description?: string | null;
    properties?: Record<string, unknown> | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}
export declare function getEntitiesForProject(projectPath: string, limit: number): Promise<EntityRecord[]>;
//# sourceMappingURL=entities.d.ts.map