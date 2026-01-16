export declare function getDataDir(): string;
export declare const config: {
    isTeamMode: boolean;
    redisEnabled: boolean;
    dataDir: string;
    embeddingsProvider: "openai" | "ollama" | "none";
    openAiApiKey: string;
    openAiApiUrl: string;
    openAiEmbeddingModel: string;
    ollamaUrl: string;
    ollamaEmbeddingModel: string;
    lifecycleEnabled: boolean;
    lifecycleInterval: number;
    summarizationEnabled: boolean;
    incrementalThreshold: number;
    rollingWindowSize: number;
    agentIsolationEnabled: boolean;
    defaultVisibilityScope: "private" | "project" | "team" | "global";
    governanceEnabled: boolean;
    consolidationEnabled: boolean;
    consolidationSimilarityThreshold: number;
};
export default config;
//# sourceMappingURL=config.d.ts.map