export interface MemorySignals {
  explicitTriggers: string[];
  implicit: {
    decision: boolean;
    correction: boolean;
    preference: boolean;
    workflowRule: boolean;
    lesson: boolean;
  };
  suggestedType: 'observation' | 'fact' | 'decision' | 'context' | 'preference';
  priority: 'normal' | 'high';
}

const EXPLICIT_TRIGGER_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'remember', regex: /\bremember\b/i },
  { label: 'dont-forget', regex: /\b(?:don'?t\s+forget|do\s+not\s+forget)\b/i },
  { label: 'keep-in-mind', regex: /\bkeep\s+in\s+mind\b/i },
  { label: 'note-that', regex: /\bnote\s+that\b/i },
  { label: 'from-now-on', regex: /\bfrom\s+now\s+on\b/i },
  { label: 'going-forward', regex: /\bgoing\s+forward\b/i },
  { label: 'save-this', regex: /\bsave\s+this\b/i },
  { label: 'log-this', regex: /\blog\s+this\b/i },
  { label: 'important', regex: /\bimportant\s*:/i },
];

export function detectMemorySignals(content: string): MemorySignals {
  const text = content.trim();
  const explicitTriggers = EXPLICIT_TRIGGER_PATTERNS.filter((p) => p.regex.test(text)).map((p) => p.label);

  const implicit = {
    decision:
      /\b(?:decided|choose|chose|going with|picked|selected|final decision)\b/i.test(text) ||
      /\b(?:x over y|option\s+[a-z0-9]+\s+over)\b/i.test(text),
    correction: /\b(?:no,?\s+i\s+meant|actually,?\s+that'?s\s+not|correction:|i\s+meant)\b/i.test(text),
    preference:
      /\b(?:i\s+like|i\s+don'?t\s+like|i\s+hate|my\s+preference\s+is|prefer)\b/i.test(text) ||
      /\b(?:always|never)\b/i.test(text),
    workflowRule: /\b(?:let'?s\s+always\s+do\s+it\s+this\s+way|standard\s+workflow|runbook)\b/i.test(text),
    lesson:
      /\b(?:failed\s+because|lesson\s+learned|next\s+time|do\s+not\s+repeat|root\s+cause)\b/i.test(text),
  };

  let suggestedType: MemorySignals['suggestedType'] = 'observation';
  if (implicit.preference) suggestedType = 'preference';
  if (implicit.decision) suggestedType = 'decision';
  if (implicit.workflowRule || implicit.lesson) suggestedType = 'context';
  if (!implicit.decision && !implicit.preference && /\b(?:is|are|was|were|uses|has|have)\b/i.test(text)) {
    suggestedType = 'fact';
  }

  const priority: MemorySignals['priority'] = explicitTriggers.length > 0 || implicit.correction ? 'high' : 'normal';

  return {
    explicitTriggers,
    implicit,
    suggestedType,
    priority,
  };
}
