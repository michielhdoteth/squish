import type { StrategyType, ExtractedStrategy } from './types.js';

/**
 * Regex patterns for strategy detection in text.
 */
const PATTERNS: Array<{ regex: RegExp; type: StrategyType; extract: (match: RegExpMatchArray) => { title: string; description: string; context: string; steps: string[] } }> = [
  {
    // "always do X" / "always use Y" / "always try Z" etc.
    regex: /(?:always|consistently)\s+(?:do|use|try|prefer|start|begin|follow)\s+(.+)/gi,
    type: 'procedure',
    extract: (m) => ({
      title: m[1].trim(),
      description: `Always ${m[1].trim()}`,
      context: 'Established procedure',
      steps: [m[1].trim()],
    }),
  },
  {
    // "never do Y" / "never use Z" etc.
    regex: /(?:never|do not|don't)\s+(?:do|use|try|start|begin|allow|skip)\s+(.+)/gi,
    type: 'constraint',
    extract: (m) => ({
      title: m[1].trim(),
      description: `Never ${m[1].trim()}`,
      context: 'Established constraint',
      steps: [],
    }),
  },
  {
    // "when Z, do W" / "when Z, use W"
    regex: /when\s+(.+?),\s*(?:do|use|try|prefer|apply|run)\s+(.+)/gi,
    type: 'heuristic',
    extract: (m) => ({
      title: `When ${m[1].trim()}, ${m[2].trim()}`,
      description: `When ${m[1].trim()}, do ${m[2].trim()}`,
      context: m[1].trim(),
      steps: [m[2].trim()],
    }),
  },
  {
    // "X works well for Y" / "X works best with Y"
    regex: /(.+?)\s+works?\s+(?:well|great|best|nicely)\s+(?:for|with|when)\s+(.+)/gi,
    type: 'pattern',
    extract: (m) => ({
      title: m[1].trim(),
      description: `${m[1].trim()} works well for ${m[2].trim()}`,
      context: m[2].trim(),
      steps: [],
    }),
  },
  {
    // "workaround for Z" / "workaround to Z"
    regex: /(?:workaround|work-around)\s+(?:for|to)\s+(.+)/gi,
    type: 'workaround',
    extract: (m) => ({
      title: `Workaround for ${m[1].trim()}`,
      description: `Workaround for ${m[1].trim()}`,
      context: 'Discovered workaround',
      steps: [],
    }),
  },
];

/**
 * Derive a confidence score based on strategy type.
 */
function deriveConfidence(type: StrategyType, hasSteps: boolean): number {
  const base =
    type === 'procedure' ? 0.85 :
    type === 'constraint' ? 0.82 :
    type === 'heuristic' ? 0.78 :
    type === 'pattern' ? 0.80 :
    0.72;
  return hasSteps ? Math.min(0.95, base + 0.05) : base;
}

/**
 * Clean a title string for display.
 */
function cleanTitle(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/^[,;:.]+/, '')
    .replace(/[,;:.]+$/, '')
    .trim();
}

/**
 * Extract actionable strategies from a conversation string.
 * Uses regex patterns to detect common English patterns.
 */
export async function extractStrategiesFromConversation(
  conversation: string,
  projectId?: string,
): Promise<ExtractedStrategy[]> {
  const strategies: ExtractedStrategy[] = [];
  const deduped = new Map<string, ExtractedStrategy>();

  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regex
    pattern.regex.lastIndex = 0;
    let match: RegExpMatchArray | null;

    while ((match = pattern.regex.exec(conversation)) !== null) {
      const extracted = pattern.extract(match);
      const title = cleanTitle(extracted.title);

      if (!title || title.length < 4) continue;

      const key = `${pattern.type}:${title.toLowerCase()}`;
      if (deduped.has(key)) continue;

      const hasSteps = extracted.steps.length > 0;
      const strategy: ExtractedStrategy = {
        strategyType: pattern.type,
        title,
        description: extracted.description,
        context: extracted.context,
        steps: extracted.steps,
        successCriteria: '',
        failureIndicators: '',
        confidence: deriveConfidence(pattern.type, hasSteps),
        sourceType: 'conversation',
        sourceId: projectId ?? 'unknown',
      };

      deduped.set(key, strategy);
      strategies.push(strategy);
    }
  }

  return strategies;
}

/**
 * Convert a learning entry into extracted strategies.
 * Successes become patterns/procedures, failures become constraints.
 */
export async function extractStrategiesFromLearning(
  learning: { content: string; type: string },
  projectId?: string,
): Promise<ExtractedStrategy[]> {
  const strategies: ExtractedStrategy[] = [];
  const text = learning.content.trim();

  if (!text || text.length < 8) return strategies;

  if (learning.type === 'success' || learning.type === 'insight') {
    // Successes become patterns or procedures
    const hasAction = /\b(always|consistently|tried|used|applied)\b/i.test(text);
    const strategyType: StrategyType = hasAction ? 'procedure' : 'pattern';

    strategies.push({
      strategyType,
      title: text.slice(0, 120),
      description: text,
      context: `Learning from ${learning.type}`,
      steps: [],
      successCriteria: learning.type === 'success' ? text : '',
      failureIndicators: '',
      confidence: deriveConfidence(strategyType, false),
      sourceType: 'learning',
      sourceId: projectId ?? 'unknown',
    });
  }

  if (learning.type === 'failure') {
    // Failures become constraints or workarounds
    const hasWorkaround = /\b(workaround|work-around|instead|fixed by)\b/i.test(text);
    const strategyType: StrategyType = hasWorkaround ? 'workaround' : 'constraint';

    strategies.push({
      strategyType,
      title: text.slice(0, 120),
      description: text,
      context: `Learning from failure`,
      steps: [],
      successCriteria: '',
      failureIndicators: text,
      confidence: deriveConfidence(strategyType, false),
      sourceType: 'learning',
      sourceId: projectId ?? 'unknown',
    });
  }

  if (learning.type === 'fix') {
    // Fixes become procedures
    strategies.push({
      strategyType: 'procedure',
      title: text.slice(0, 120),
      description: text,
      context: 'Fix applied',
      steps: [text],
      successCriteria: '',
      failureIndicators: '',
      confidence: deriveConfidence('procedure', true),
      sourceType: 'learning',
      sourceId: projectId ?? 'unknown',
    });
  }

  return strategies;
}

/**
 * Convert a belief into an extracted strategy when it is actionable.
 * Decisions and constraints are most likely to yield strategies.
 */
export async function extractStrategiesFromBelief(
  belief: { statement: string; beliefType: string },
  projectId?: string,
): Promise<ExtractedStrategy[]> {
  const strategies: ExtractedStrategy[] = [];
  const text = belief.statement.trim();

  if (!text || text.length < 8) return strategies;

  if (belief.beliefType === 'decision') {
    strategies.push({
      strategyType: 'procedure',
      title: text.slice(0, 120),
      description: text,
      context: 'Derived from decision belief',
      steps: [],
      successCriteria: '',
      failureIndicators: '',
      confidence: 0.75,
      sourceType: 'belief',
      sourceId: projectId ?? 'unknown',
    });
  }

  if (belief.beliefType === 'constraint') {
    strategies.push({
      strategyType: 'constraint',
      title: text.slice(0, 120),
      description: text,
      context: 'Derived from constraint belief',
      steps: [],
      successCriteria: '',
      failureIndicators: text,
      confidence: 0.78,
      sourceType: 'belief',
      sourceId: projectId ?? 'unknown',
    });
  }

  if (belief.beliefType === 'preference') {
    strategies.push({
      strategyType: 'heuristic',
      title: text.slice(0, 120),
      description: text,
      context: 'Derived from preference belief',
      steps: [],
      successCriteria: '',
      failureIndicators: '',
      confidence: 0.72,
      sourceType: 'belief',
      sourceId: projectId ?? 'unknown',
    });
  }

  return strategies;
}
