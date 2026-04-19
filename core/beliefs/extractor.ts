import type { MemoryType } from '../memory/memories.js';
import type { ExtractedBelief } from './types.js';

function cleanStatement(input: string): string {
  return input
    .replace(/^(decision:|constraint:|state change:|reject(?:ed)?:|failure:|preference:)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitReason(text: string): { statement: string; reason?: string } {
  const match = text.match(/^(.*?)(?:\s+because\s+|\s+due to\s+)(.+)$/i);
  if (!match) return { statement: cleanStatement(text) };
  return {
    statement: cleanStatement(match[1]),
    reason: cleanStatement(match[2]),
  };
}

function deriveConfidence(type: ExtractedBelief['type'], hasReason: boolean): number {
  const base =
    type === 'decision' ? 0.84 :
    type === 'preference' ? 0.8 :
    type === 'failure_cause' ? 0.82 :
    type === 'constraint' ? 0.78 :
    type === 'state_change' ? 0.76 :
    0.74;
  return hasReason ? Math.min(0.95, base + 0.05) : base;
}

export function extractBeliefsFromMemory(input: {
  memoryId: string;
  content: string;
  type: MemoryType | string;
  metadata?: Record<string, unknown> | null;
}): ExtractedBelief[] {
  const text = input.content.trim();
  const lowered = text.toLowerCase();
  const beliefs: ExtractedBelief[] = [];

  const addBelief = (belief: Omit<ExtractedBelief, 'sourceMemoryIds' | 'confidence'> & { confidence?: number }) => {
    const cleanedStatement = cleanStatement(belief.statement);
    if (!cleanedStatement || cleanedStatement.length < 8) return;
    beliefs.push({
      ...belief,
      statement: cleanedStatement,
      confidence: belief.confidence ?? deriveConfidence(belief.type, Boolean(belief.reason)),
      sourceMemoryIds: [input.memoryId],
    });
  };

  if (input.type === 'decision' || /\b(decision:|decided to|we chose|going with|final decision)\b/i.test(text)) {
    const { statement, reason } = splitReason(text);
    addBelief({
      type: 'decision',
      statement,
      reason,
      status: 'active',
      evidenceSummary: text,
    });
  }

  if (input.type === 'preference' || /\b(prefers?|likes?|dislikes?|hates?)\b/i.test(text)) {
    const { statement, reason } = splitReason(text);
    addBelief({
      type: 'preference',
      statement,
      reason,
      status: 'active',
      evidenceSummary: text,
    });
  }

  const failureMatch = text.match(/\b(?:failed|failure|broke|error)\b.*?(?:because|due to)\s+(.+)/i);
  if (failureMatch) {
    addBelief({
      type: 'failure_cause',
      statement: cleanStatement(text.split(/(?:because|due to)/i)[0] ?? text),
      reason: cleanStatement(failureMatch[1]),
      status: 'active',
      evidenceSummary: text,
      edges: [{ type: 'causes', targetStatement: cleanStatement(failureMatch[1]) }],
    });
  }

  if (/\b(constraint:|must not|cannot|can't|blocked by|required to|needs to)\b/i.test(text)) {
    addBelief({
      type: 'constraint',
      statement: text,
      status: 'active',
      evidenceSummary: text,
    });
  }

  const stateMatch = text.match(/\b(?:state changed from|changed from)\s+(.+?)\s+to\s+(.+?)(?:\s+after\s+(.+))?$/i);
  if (stateMatch) {
    addBelief({
      type: 'state_change',
      statement: `${cleanStatement(stateMatch[1])} -> ${cleanStatement(stateMatch[2])}`,
      reason: stateMatch[3] ? cleanStatement(stateMatch[3]) : undefined,
      status: 'active',
      evidenceSummary: text,
    });
  }

  const disputePatterns = [
    /\b(reject|rejected|do not use|don't use|instead of)\b/i,
    /\bbandaid\b/i,
  ];
  if (disputePatterns.some((pattern) => pattern.test(text))) {
    const sentence = text.split(/[.!?]/).find((part) => /reject|bandaid|instead of|do not use|don't use/i.test(part)) ?? text;
    addBelief({
      type: 'dispute',
      statement: sentence,
      status: 'disputed',
      evidenceSummary: text,
    });
  }

  const deduped = new Map<string, ExtractedBelief>();
  for (const belief of beliefs) {
    const key = `${belief.type}:${belief.statement.toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, belief);
  }

  if (deduped.size === 0 && !/\b(because|due to|prefer|decision|constraint|changed from|reject)\b/.test(lowered)) {
    return [];
  }

  return [...deduped.values()];
}
