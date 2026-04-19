import { createHash } from 'crypto';

export type SignalClassification =
  | 'discard'
  | 'session-only'
  | 'durable-distilled'
  | 'durable-raw+distilled';

export interface SignalEventInput {
  toolName: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  sessionId?: string | null;
}

export interface SignalDecision {
  classification: SignalClassification;
  reasons: string[];
  storeRaw: boolean;
  importance: 'low' | 'medium' | 'high';
  wakeUpPriority: 'low' | 'medium' | 'high';
  placeHint: {
    placeType: 'inbox' | 'ref' | 'wip' | 'sandbox' | 'board' | 'sparks' | 'archive' | null;
    confidence: number;
  };
  graphHint: {
    shouldEnrich: boolean;
    entityTerms: string[];
    reason?: string;
  };
  content: string;
  contentHash: string;
  estimatedSavings: number;
}

export interface DistillInput {
  toolName: string;
  command?: string;
  content: string;
  classification: SignalClassification;
}

function normalizeContent(toolResult: unknown): string {
  if (typeof toolResult === 'string') return toolResult;
  if (toolResult == null) return '';
  if (typeof toolResult === 'object') {
    try {
      return JSON.stringify(toolResult, null, 2);
    } catch {
      return String(toolResult);
    }
  }
  return String(toolResult);
}

function estimateNoiseSavings(raw: string, distilled: string): number {
  return Math.max(0, raw.length - distilled.length);
}

function extractEntityTerms(content: string): string[] {
  const matches = content.match(/\b([A-Z][A-Za-z0-9]+|[a-z]+(?:\.[a-z0-9_-]+)+|[A-Za-z0-9_-]+\.ts)\b/g) ?? [];
  return [...new Set(matches.filter((term) => term.length > 2))].slice(0, 6);
}

function inferPlaceHint(toolName: string, normalized: string): SignalDecision['placeHint'] {
  if (['write', 'edit', 'multiedit'].includes(toolName.toLowerCase()) || /\b(fix|bug|implement|refactor|edited|wrote)\b/.test(normalized)) {
    return { placeType: 'wip', confidence: 0.88 };
  }
  if (/\b(test|assertionerror|traceback|exception|experiment|verify)\b/.test(normalized)) {
    return { placeType: 'sandbox', confidence: 0.92 };
  }
  if (/\b(hypothesis|plan|decided|roadmap|task|todo|investigate)\b/.test(normalized)) {
    return { placeType: 'board', confidence: 0.74 };
  }
  if (/\b(research|docs|pattern|reference|api|architecture)\b/.test(normalized)) {
    return { placeType: 'ref', confidence: 0.72 };
  }
  if (/\b(idea|explore|future|concept)\b/.test(normalized)) {
    return { placeType: 'sparks', confidence: 0.68 };
  }
  return { placeType: null, confidence: 0 };
}

function inferGraphHint(normalized: string, content: string, classification: SignalClassification): SignalDecision['graphHint'] {
  if (classification === 'discard' || classification === 'session-only') {
    return { shouldEnrich: false, entityTerms: [], reason: 'non-durable signal' };
  }

  const entityTerms = extractEntityTerms(content);
  const hasStructuredSignal = entityTerms.length > 0 || /\b(fix|decision|preference|error|graph|ranking|entity|relationship)\b/.test(normalized);
  if (!hasStructuredSignal) {
    return { shouldEnrich: false, entityTerms: [], reason: 'no graph-worthy entities' };
  }

  return {
    shouldEnrich: true,
    entityTerms,
    reason: 'durable signal with identifiable entities',
  };
}

export function hashSignalContent(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

export function classifySignalEvent(input: SignalEventInput): SignalDecision {
  const toolName = input.toolName;
  const command = String(input.toolInput?.command ?? input.toolInput?.cmd ?? '');
  const content = normalizeContent(input.toolResult);
  const normalized = `${command}\n${content}`.toLowerCase();
  const reasons: string[] = [];

  const noisyCommand =
    /\b(npm|bun|pnpm|yarn)\s+(install|add)\b/.test(normalized) ||
    /\bdownload(ed|ing)?\b|\bfetch(ed|ing)?\b|\bprogress\b|\bresolved\b/.test(normalized);
  if (noisyCommand) {
    const placeHint = inferPlaceHint(toolName, normalized);
    reasons.push('noise filtered from install/build output');
    return {
      classification: 'discard',
      reasons,
      storeRaw: false,
      importance: 'low',
      wakeUpPriority: 'low',
      placeHint,
      graphHint: inferGraphHint(normalized, content, 'discard'),
      content,
      contentHash: hashSignalContent(normalized),
      estimatedSavings: content.length,
    };
  }

  if (/\b(current hypothesis|hypothesis:|investigate|trying next)\b/.test(normalized)) {
    const placeHint = inferPlaceHint(toolName, normalized);
    reasons.push('active session hypothesis');
    return {
      classification: 'session-only',
      reasons,
      storeRaw: false,
      importance: 'medium',
      wakeUpPriority: 'high',
      placeHint,
      graphHint: inferGraphHint(normalized, content, 'session-only'),
      content,
      contentHash: hashSignalContent(normalized),
      estimatedSavings: 0,
    };
  }

  if (/\bcorrection:|actually\b|\binstead of\b|\bprefer(s)?\b/.test(normalized)) {
    const placeHint = inferPlaceHint(toolName, normalized);
    reasons.push('correction or preference worth durable retention');
    return {
      classification: 'durable-distilled',
      reasons,
      storeRaw: false,
      importance: 'high',
      wakeUpPriority: 'high',
      placeHint,
      graphHint: inferGraphHint(normalized, content, 'durable-distilled'),
      content,
      contentHash: hashSignalContent(normalized),
      estimatedSavings: estimateNoiseSavings(content, distillSignalEvent({
        toolName,
        command,
        content,
        classification: 'durable-distilled',
      })),
    };
  }

  if (
    /\b(fail|failed|failing|assertionerror|stack trace|traceback|exception)\b/.test(normalized) ||
    /\b(test|pytest|vitest|jest|bun test)\b/.test(normalized)
  ) {
    const placeHint = inferPlaceHint(toolName, normalized);
    reasons.push('test or debugging signal with nuance-sensitive output');
    return {
      classification: 'durable-raw+distilled',
      reasons,
      storeRaw: true,
      importance: 'high',
      wakeUpPriority: 'high',
      placeHint,
      graphHint: inferGraphHint(normalized, content, 'durable-raw+distilled'),
      content,
      contentHash: hashSignalContent(normalized),
      estimatedSavings: estimateNoiseSavings(content, distillSignalEvent({
        toolName,
        command,
        content,
        classification: 'durable-raw+distilled',
      })),
    };
  }

  if (['write', 'edit', 'multiedit'].includes(toolName.toLowerCase())) {
    const placeHint = inferPlaceHint(toolName, normalized);
    reasons.push('meaningful file modification');
    return {
      classification: 'durable-distilled',
      reasons,
      storeRaw: false,
      importance: 'medium',
      wakeUpPriority: 'medium',
      placeHint,
      graphHint: inferGraphHint(normalized, content, 'durable-distilled'),
      content,
      contentHash: hashSignalContent(normalized),
      estimatedSavings: estimateNoiseSavings(content, distillSignalEvent({
        toolName,
        command,
        content,
        classification: 'durable-distilled',
      })),
    };
  }

  reasons.push('session-scoped operational context');
  const placeHint = inferPlaceHint(toolName, normalized);
  return {
    classification: 'session-only',
    reasons,
    storeRaw: false,
    importance: 'low',
    wakeUpPriority: 'low',
    placeHint,
    graphHint: inferGraphHint(normalized, content, 'session-only'),
    content,
    contentHash: hashSignalContent(normalized),
    estimatedSavings: 0,
  };
}

export function distillSignalEvent(input: DistillInput): string {
  const lines = input.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const important = lines.filter((line) =>
    /\b(fail|error|exception|traceback|assert|stack|correction|prefer|decision|fix|edited|wrote)\b/i.test(line)
  );

  const selected = important.length > 0 ? important : lines.slice(0, 4);
  const cleaned = selected.filter(
    (line) => !/\b(pass(ing)?|resolved|download(ed|ing)?|progress|packages? added)\b/i.test(line)
  );

  if (/assertionerror|traceback|exception|stack/i.test(input.content) && !cleaned.some((line) => /assertionerror|traceback|exception|stack/i.test(line))) {
    const extra = lines.find((line) => /assertionerror|traceback|exception|stack/i.test(line));
    if (extra) cleaned.push(extra);
  }

  return cleaned.slice(0, 6).join('\n');
}

export function shouldReturnRawFallback(input: {
  query: string;
  hasRawFallback: boolean;
  nuanceSuppressed: boolean;
}): boolean {
  if (!input.hasRawFallback) return false;
  if (input.nuanceSuppressed) return true;
  return /\b(raw|original|full|stack trace|traceback|stderr|stdout|rewind)\b/i.test(input.query);
}
