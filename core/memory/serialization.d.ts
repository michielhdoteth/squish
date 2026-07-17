export declare function normalizeTags(tags?: string[]): string[];
export declare function toSqliteJson(value: unknown): string | null;
export declare function fromSqliteJson<T>(value: string | null | undefined): T | null;
export declare function toSqliteTags(tags?: string[]): string | null;
export declare function fromSqliteTags(value: string | null | undefined): string[];
export declare function serializeTags(tags?: string[]): string | null;
export declare function deserializeTags(value: string | string[] | null | undefined): string[];
export declare function serializeMetadata(metadata: Record<string, unknown> | null | undefined): string | null;
export declare function deserializeMetadata(value: string | Record<string, unknown> | null | undefined): Record<string, unknown> | null;
//# sourceMappingURL=serialization.d.ts.map