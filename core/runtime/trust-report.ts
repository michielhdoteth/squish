export interface CurrentProjectSummary {
  id: string;
  name: string;
  path: string;
  resolution: 'explicit' | 'inferred' | 'auto-created' | 'legacy-placeholder';
}

export interface ContextReportInput {
  currentProject: CurrentProjectSummary;
  otherProjects: CurrentProjectSummary[];
  runtime: {
    sessionSummary: string;
    activePlaces: string[];
    signalSummary: {
      captured: number;
      suppressed: number;
      sessionOnly: number;
      durable: number;
      durableWithRaw: number;
    };
    graphSummary: string;
  };
  durableMemories: Array<{
    id: string;
    type: string;
    content: string;
    place?: string | null;
  }>;
  beliefs?: Array<{
    type: string;
    statement: string;
    status: string;
  }>;
  nextStep: string | null;
}

export interface HealthReportInput {
  severity: 'ok' | 'degraded' | 'broken';
  currentProject: string;
  checks: Array<{ name: string; status: 'ok' | 'degraded' | 'broken'; detail: string }>;
  diagnostics?: Array<{ name: string; status: 'ok' | 'degraded' | 'broken'; detail: string; fix?: string }>;
  nextStep: string | null;
}

export interface StatsReportInput {
  currentProject: string;
  totals: { memories: number; durable: number; sessionLocal: number };
  signal: {
    captured: number;
    suppressed: number;
    sessionOnly: number;
    durable: number;
    durableWithRaw: number;
    tokensSaved: number;
    placeRouted: number;
    graphEnriched: number;
  };
  places: { active: number; named: string[] };
  graph: { status: string; enrichments: number };
  wakeUp: string;
  signalNote?: string | null;
}

export interface InspectReportInput {
  id: string;
  classification: string;
  storageReason: string;
  durability: 'session-only' | 'durable';
  place?: string | null;
  placeType?: string | null;
  graphStatus?: string | null;
  rawFallback?: string | null;
  wakeUpPriority?: string | null;
  metadataAvailability?: string | null;
  beliefs?: Array<{
    id: string;
    type: string;
    statement: string;
    status: string;
    confidence: number;
  }>;
}

export function formatContextReport(input: ContextReportInput): string {
  const lines = [
    'Current project',
    `- ${input.currentProject.name} (${input.currentProject.path})`,
    `- resolution: ${input.currentProject.resolution}`,
    '',
    'Runtime state',
    `- session working set: ${input.runtime.sessionSummary || 'none'}`,
    `- active places: ${input.runtime.activePlaces.join(', ') || 'none'}`,
    `- signals: captured ${input.runtime.signalSummary.captured}, suppressed ${input.runtime.signalSummary.suppressed}, session-only ${input.runtime.signalSummary.sessionOnly}, durable ${input.runtime.signalSummary.durable}, durable+raw ${input.runtime.signalSummary.durableWithRaw}`,
    `- graph: ${input.runtime.graphSummary}`,
    '',
    'Recent durable memories',
  ];

  if (input.durableMemories.length === 0) {
    lines.push('- none yet');
  } else {
    for (const memory of input.durableMemories) {
      lines.push(`- [${memory.type}] ${memory.content}${memory.place ? ` @ ${memory.place}` : ''}`);
    }
  }

  if (input.otherProjects.length > 0) {
    lines.push('', 'Other projects');
    for (const project of input.otherProjects) {
      lines.push(`- ${project.name} (${project.path}) [${project.resolution}]`);
    }
  }

  if (input.beliefs && input.beliefs.length > 0) {
    lines.push('', 'Derived beliefs');
    for (const belief of input.beliefs) {
      lines.push(`- [${belief.type}] ${belief.statement} (${belief.status})`);
    }
  }

  if (input.nextStep) {
    lines.push('', `Next step: ${input.nextStep}`);
  }

  return lines.join('\n');
}

export function formatHealthReport(input: HealthReportInput): string {
  const lines = [
    `Status: ${input.severity}`,
    `Current project: ${input.currentProject}`,
    '',
    'Subsystems',
    ...input.checks.map((check) => `- ${check.name}: ${check.status} (${check.detail})`),
  ];
  if (input.diagnostics && input.diagnostics.length > 0) {
    lines.push('', 'Diagnostics');
    for (const diagnostic of input.diagnostics) {
      lines.push(`- ${diagnostic.name}: ${diagnostic.status} (${diagnostic.detail})`);
      if (diagnostic.fix) {
        lines.push(`  fix: ${diagnostic.fix}`);
      }
    }
  }
  if (input.nextStep) lines.push('', `Next step: ${input.nextStep}`);
  return lines.join('\n');
}

export function formatStatsReport(input: StatsReportInput): string {
  const lines = [
    `Current project: ${input.currentProject}`,
    `Memory totals: ${input.totals.memories} total, ${input.totals.durable} durable, ${input.totals.sessionLocal} session-local`,
    '',
    'Capture-era signals',
    `- captured: ${input.signal.captured}`,
    `- suppressed: ${input.signal.suppressed}`,
    `- session-only: ${input.signal.sessionOnly}`,
    `- signal-tracked durable: ${input.signal.durable}`,
    `- signal-tracked durable+raw: ${input.signal.durableWithRaw}`,
    `- token savings: ${input.signal.tokensSaved}`,
    `- place routed: ${input.signal.placeRouted}`,
    `- graph enriched: ${input.signal.graphEnriched}`,
    '',
    `Places: ${input.places.active} active (${input.places.named.join(', ') || 'none'})`,
    `Graph: ${input.graph.status}; ${input.graph.enrichments} enrichments`,
    `Wake-up: ${input.wakeUp}`,
  ];
  if (input.signalNote) {
    lines.push(`Signal note: ${input.signalNote}`);
  }
  return lines.join('\n');
}

export function formatInspectReport(input: InspectReportInput): string {
  const lines = [
    `Memory ${input.id}`,
    `Classification: ${input.classification}`,
    `Storage reason: ${input.storageReason}`,
    `Durability: ${input.durability}`,
    `Place: ${input.place ?? 'none'}${input.placeType ? ` (${input.placeType})` : ''}`,
    `Graph: ${input.graphStatus ?? 'none'}`,
    `Raw fallback: ${input.rawFallback ?? 'none'}`,
    `Wake-up priority: ${input.wakeUpPriority ?? 'n/a'}`,
  ];
  if (input.metadataAvailability) {
    lines.push(`Metadata: ${input.metadataAvailability}`);
  }
  if (input.beliefs && input.beliefs.length > 0) {
    lines.push('Beliefs:');
    for (const belief of input.beliefs) {
      lines.push(`- [${belief.type}] ${belief.statement} (${belief.status}, c=${belief.confidence.toFixed(2)})`);
    }
  }
  return lines.join('\n');
}
