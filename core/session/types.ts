/** Session Auto-Load Types */

export interface AutoLoadConfig {
  enabled: boolean;
  includeCoreMemory: boolean;
  includeRecentMemories: boolean;
  recentMemoryCount: number;
  importanceThreshold: number;
  includeProjectContext: boolean;
  includeStrategies: boolean;
}

export interface AutoLoadResult {
  coreMemoryLoaded: boolean;
  memoriesLoaded: number;
  strategiesLoaded: number;
  projectContextLoaded: boolean;
  tokensUsed: number;
  duration: number;
  warnings: string[];
}

export interface SessionState {
  sessionId: string;
  projectId: string;
  autoLoaded: boolean;
  startedAt: Date;
  lastActivityAt: Date;
}

export const DEFAULT_AUTO_LOAD_CONFIG: AutoLoadConfig = {
  enabled: true,
  includeCoreMemory: true,
  includeRecentMemories: true,
  recentMemoryCount: 5,
  importanceThreshold: 70,
  includeProjectContext: true,
  includeStrategies: true,
};
