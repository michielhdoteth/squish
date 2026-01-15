export interface OverrideCodecType {
}
export type ResolvedCodecType<TDbTypeName, TDefaultTsType> = TDbTypeName extends keyof OverrideCodecType ? OverrideCodecType[TDbTypeName] : TDefaultTsType;
