// Types for MemoryBench

export interface MemoryProvider {
  name: string;
  ingest(session: ConversationSession): Promise<void>;
  index(): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  clear(): Promise<void>;
}

export interface SearchOptions {
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationSession {
  id: string;
  turns: ConversationTurn[];
  metadata?: Record<string, unknown>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface BenchmarkDataset {
  name: string;
  description: string;
  sessions: ConversationSession[];
  questions: BenchmarkQuestion[];
  getSessionById?(id: string): ConversationSession | undefined;
}

export interface BenchmarkQuestion {
  id: string;
  sessionId: string;
  question: string;
  groundTruth: string;
  answerType: 'fact' | 'summary' | 'temporal' | 'entity';
  difficulty: 'easy' | 'medium' | 'hard';
  requiresContext: boolean;
}

export interface Judge {
  name: string;
  evaluate(answer: string, groundTruth: string, question: string): Promise<EvaluationResult>;
}

export interface EvaluationResult {
  score: number; // 0-1
  correct: boolean;
  reasoning: string;
  confidence: number;
}

export interface RunConfig {
  provider: string;
  benchmark: string;
  judge: string;
  answeringModel: string;
  runId: string;
  limit: number;
  questionId?: string;
  force?: boolean;
}

export interface RunCheckpoint {
  runId: string;
  config: RunConfig;
  status: 'pending' | 'ingesting' | 'indexing' | 'searching' | 'answering' | 'evaluating' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  currentPhase: string;
  completedPhases: string[];
  results: QuestionResult[];
  startTime: string;
  lastUpdated: string;
}

export interface QuestionResult {
  questionId: string;
  question: string;
  groundTruth: string;
  retrievedContext: SearchResult[];
  generatedAnswer: string;
  evaluation: EvaluationResult;
  latency: {
    search: number;
    answer: number;
    evaluate: number;
  };
}

export interface BenchmarkReport {
  runId: string;
  config: RunConfig;
  summary: {
    totalQuestions: number;
    answered: number;
    correct: number;
    accuracy: number;
    avgLatency: number;
    totalTime: number;
  };
  byDifficulty: Record<string, { accuracy: number; count: number }>;
  byType: Record<string, { accuracy: number; count: number }>;
  results: QuestionResult[];
}
