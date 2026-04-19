export type BeliefType =
  | 'decision'
  | 'preference'
  | 'failure_cause'
  | 'constraint'
  | 'state_change'
  | 'dispute';

export type BeliefStatus = 'active' | 'superseded' | 'disputed';

export type BeliefEdgeType = 'causes' | 'supports' | 'rejects' | 'supersedes' | 'depends_on';

export interface ExtractedBelief {
  type: BeliefType;
  statement: string;
  confidence: number;
  sourceMemoryIds: string[];
  status: BeliefStatus;
  reason?: string;
  context?: string;
  evidenceSummary?: string;
  edges?: Array<{
    type: BeliefEdgeType;
    targetStatement: string;
  }>;
}

export interface StoredBelief extends ExtractedBelief {
  id: string;
  projectId: string;
  normalizedKey: string;
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
  // Decay fields
  lastConfirmedAt?: Date | string | number | null;
  sourceCount?: number;
  beliefDecayRate?: number;
}
