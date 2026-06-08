export type StrategyType = 'procedure' | 'heuristic' | 'pattern' | 'constraint' | 'workaround';
export type StrategyStatus = 'active' | 'superseded' | 'deprecated' | 'experimental';
export type StrategyEdgeType = 'supersedes' | 'extends' | 'conflicts' | 'depends_on' | 'related_to';
export type StrategyBeliefEdgeType = 'informed_by' | 'contradicts' | 'supports';

export interface Strategy {
  id: string;
  projectId: string | null;
  userId: string | null;
  agentId: string | null;
  strategyType: StrategyType;
  title: string;
  description: string;
  context: string | null;
  steps: string | null; // JSON array
  successCriteria: string | null;
  failureIndicators: string | null;
  confidence: number;
  usageCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  status: StrategyStatus;
  supersededBy: string | null;
  tags: string | null;
  metadata: Record<string, unknown> | null;
  visibilityScope: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStrategyInput {
  projectId?: string;
  userId?: string;
  agentId?: string;
  strategyType: StrategyType;
  title: string;
  description: string;
  context?: string;
  steps?: string[];
  successCriteria?: string;
  failureIndicators?: string;
  tags?: string[];
  visibilityScope?: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractedStrategy {
  strategyType: StrategyType;
  title: string;
  description: string;
  context: string;
  steps: string[];
  successCriteria: string;
  failureIndicators: string;
  confidence: number;
  sourceType: 'conversation' | 'learning' | 'belief' | 'trace';
  sourceId: string;
}
