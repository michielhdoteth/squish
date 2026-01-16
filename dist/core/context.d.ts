export interface ContextInput {
    project: string;
    include?: Array<'memories' | 'observations' | 'entities'>;
    limit?: number;
}
export declare function getProjectContext(input: ContextInput): Promise<Record<string, unknown>>;
//# sourceMappingURL=context.d.ts.map