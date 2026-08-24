/**
 * Session Bootstrap Composer - Batch 7.
 *
 * THE single entry point any harness calls to boot a session with squish
 * context. The MCP `squish_context` action `session-start` is canonical;
 * plugin auto-inject paths and hook scripts call this through
 * `squish context --session-start`.
 *
 * Design:
 *   - Hard token ceiling (default ~2000 tokens, chars/4 heuristic).
 *   - Sections are composed in strict priority order:
 *       1. core-memory      distilled, versioned always-in-context blocks
 *       2. beliefs          active failures/constraints/decisions,
 *                           confidence-ordered (state reconstruction)
 *       3. working-set      wake-up summary from real session signals
 *       4. pinned           user-pinned memories
 *       5. recent-decisions high-retention decision-type memories
 *   - Each section has its own budget (fraction of the ceiling). Overflow
 *     drops the lowest-priority section first; items inside a section are
 *   - truncated before a section is dropped. NEVER raw memory dumps:
 *     item counts and per-item char caps are enforced everywhere.
 */

import os from 'node:os';
import path from 'node:path';

import { logger } from '../logger.js';
import { ensureProject, getProjectByPath } from '../projects.js';
import { getCoreMemory } from '../ingestion/core-memory.js';
import {
  getActiveConstraints,
  getActiveDecisions,
  getRecentFailures,
} from '../knowledge/store.js';
import { getPinnedMemoriesForContext } from '../security/governance.js';
import type { StoredBelief } from '../knowledge/types.js';
import { compactSessionWorkingSet, getLatestProjectWorkingSetSummary } from './working-set.js';
import { getRecent } from '../memory/memories.js';

/** chars/4 heuristic - single source of truth lives in context-window.ts */
import { estimateTokens } from '../context/context-window.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BootstrapSectionName =
  | 'core-memory'
  | 'beliefs'
  | 'working-set'
  | 'pinned'
  | 'recent-decisions';

export const BOOTSTRAP_SECTION_PRIORITY: BootstrapSectionName[] = [
  'core-memory',
  'beliefs',
  'working-set',
  'pinned',
  'recent-decisions',
];

/** Fraction of the total ceiling each section may occupy. */
const SECTION_BUDGET_FRACTIONS: Record<BootstrapSectionName, number> = {
  'core-memory': 0.3,
  'beliefs': 0.25,
  'working-set': 0.2,
  'pinned': 0.15,
  'recent-decisions': 0.1,
};

const DEFAULT_TOTAL_TOKEN_CEILING = 2000;

export interface ComposeSessionBootstrapOptions {
  projectPath?: string;
  /** Explicit harness/squish session ID for the working-set lookup. */
  sessionId?: string;
  /** Hard ceiling in estimated tokens (chars/4). Default 2000. */
  totalTokenCeiling?: number;
  /** Max rendered items per section. Default 4. */
  maxItemsPerSection?: number;
}

export interface BootstrapSectionInfo {
  name: BootstrapSectionName;
  priority: number;
  tokens: number;
  included: boolean;
  itemCount: number;
  /** Present when the section was composed but dropped by the ceiling. */
  dropReason?: 'ceiling-exceeded' | 'empty';
}

export interface SessionBootstrapResult {
  /** Single formatted context block ready for injection. */
  block: string;
  totalTokens: number;
  ceilingTokens: number;
  sections: BootstrapSectionInfo[];
}

interface ComposedSection {
  name: BootstrapSectionName;
  header: string;
  body: string;
  itemCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fitToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  return (lastBreak > maxChars * 0.6 ? slice.slice(0, lastBreak) : slice).trimEnd() + '…';
}

function truncateItem(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars)}…` : clean;
}

async function resolveProjectId(projectPath?: string): Promise<{ path: string; id: string | null }> {
  const resolved = projectPath || process.cwd();
  try {
    await ensureProject(resolved);
    const project = await getProjectByPath(resolved);
    return { path: resolved, id: project?.id ?? null };
  } catch {
    return { path: resolved, id: null };
  }
}

// ---------------------------------------------------------------------------
// Section builders (each returns null when there is nothing to show)
// ---------------------------------------------------------------------------

async function buildCoreMemorySection(
  projectId: string | null,
  maxItems: number,
  _budgetTokens: number
): Promise<ComposedSection | null> {
  if (!projectId) return null;
  const content = await getCoreMemory(projectId);
  const labels: Record<string, string> = {
    persona: 'Persona',
    user_info: 'User',
    project_context: 'Project',
    working_notes: 'Notes',
  };
  const lines: string[] = [];
  let count = 0;
  for (const [key, label] of Object.entries(labels)) {
    if (count >= maxItems) break;
    const value = (content as unknown as Record<string, string>)[key]?.trim();
    if (!value) continue;
    lines.push(`${label}: ${truncateItem(value, 400)}`);
    count++;
  }
  if (lines.length === 0) return null;
  return { name: 'core-memory', header: '## Core memory', body: lines.join('\n'), itemCount: count };
}

interface BeliefStatementRow extends Partial<StoredBelief> {
  statement?: string;
  confidence?: number;
}

function beliefLines(rows: BeliefStatementRow[], max: number, prefix?: string): string[] {
  const sorted = [...rows]
    .filter((r) => typeof r?.statement === 'string' && r.statement.trim().length > 0)
    .sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5))
    .slice(0, max);
  return sorted.map(
    (r, i) => `  ${i + 1}. ${truncateItem(r.statement!, 220)}${prefix ? ` (${prefix})` : ''}`
  );
}

async function buildBeliefsSection(
  projectId: string | null,
  maxItems: number,
  _budgetTokens: number
): Promise<ComposedSection | null> {
  if (!projectId) return null;
  const [failures, constraints, decisions] = await Promise.all([
    getRecentFailures(projectId, maxItems),
    getActiveConstraints(projectId),
    getActiveDecisions(projectId),
  ]);

  const built: Array<{ title: string; lines: string[] }> = [];
  const avoidLines = beliefLines(failures as BeliefStatementRow[], maxItems);
  if (avoidLines.length > 0) built.push({ title: 'AVOID', lines: avoidLines });
  const constraintLines = beliefLines(constraints as BeliefStatementRow[], maxItems);
  if (constraintLines.length > 0) built.push({ title: 'CONSTRAINTS', lines: constraintLines });
  const decisionLines = beliefLines(decisions as BeliefStatementRow[], maxItems);
  if (decisionLines.length > 0) built.push({ title: 'DECISIONS', lines: decisionLines });

  if (built.length === 0) return null;
  const body = built.map((g) => `${g.title}:\n${g.lines.join('\n')}`).join('\n');
  const itemCount = built.reduce((sum, g) => sum + g.lines.length, 0);
  return { name: 'beliefs', header: '## Active beliefs (state reconstruction)', body, itemCount };
}

async function buildWorkingSetSection(
  projectPath: string,
  sessionId: string | undefined,
  _maxItems: number,
  _budgetTokens: number
): Promise<ComposedSection | null> {
  let summary = '';
  if (sessionId) {
    try {
      summary = (await compactSessionWorkingSet(sessionId, projectPath)).summary;
    } catch {
      summary = '';
    }
  }
  if (!summary) {
    try {
      summary = await getLatestProjectWorkingSetSummary(projectPath);
    } catch {
      summary = '';
    }
  }
  if (!summary) return null;
  return {
    name: 'working-set',
    header: '## Working set (wake-up)',
    body: fitToTokens(summary, _budgetTokens),
    itemCount: summary.split('\n').length,
  };
}

async function buildPinnedSection(
  projectId: string | null,
  maxItems: number,
  _budgetTokens: number
): Promise<ComposedSection | null> {
  try {
    const pinned = await getPinnedMemoriesForContext(projectId ?? undefined);
    if (pinned.length === 0) return null;
    const lines = pinned.slice(0, maxItems).map((p) => `- ${truncateItem(p.replace(/^\[Pinned\]\s*/, ''), 260)}`);
    return { name: 'pinned', header: '## Pinned memories', body: lines.join('\n'), itemCount: lines.length };
  } catch {
    return null;
  }
}

async function buildRecentDecisionsSection(
  projectPath: string,
  maxItems: number,
  _budgetTokens: number
): Promise<ComposedSection | null> {
  try {
    const recent = await getRecent(projectPath, 25);
    const decisions = recent.filter((m: any) => m.type === 'decision').slice(0, maxItems);
    if (decisions.length === 0) return null;
    const lines = decisions.map((m: any, i: number) => `${i + 1}. ${truncateItem(m.content ?? '', 240)}`);
    return {
      name: 'recent-decisions',
      header: '## Recent decisions',
      body: lines.join('\n'),
      itemCount: lines.length,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

/**
 * Compose the canonical session-bootstrap context block under a hard token
 * ceiling. Never throws - failures degrade to an empty block with section
 * diagnostics so callers (MCP tool, CLI, hooks) always get a response.
 */
export async function composeSessionBootstrap(
  options: ComposeSessionBootstrapOptions = {}
): Promise<SessionBootstrapResult> {
  const ceiling = Math.max(64, options.totalTokenCeiling ?? DEFAULT_TOTAL_TOKEN_CEILING);
  const maxItems = Math.max(1, options.maxItemsPerSection ?? 4);

  const result: SessionBootstrapResult = {
    block: '',
    totalTokens: 0,
    ceilingTokens: ceiling,
    sections: [],
  };

  const { path: projectPath, id: projectId } = await resolveProjectId(options.projectPath);

  const builders: Array<(budgetTokens: number) => Promise<ComposedSection | null>> = [
    (budget) => buildCoreMemorySection(projectId, maxItems, budget),
    (budget) => buildBeliefsSection(projectId, maxItems, budget),
    (budget) => buildWorkingSetSection(projectPath, options.sessionId, maxItems, budget),
    (budget) => buildPinnedSection(projectId, maxItems, budget),
    (budget) => buildRecentDecisionsSection(projectPath, maxItems, budget),
  ];

  const included: Array<{ section: ComposedSection; tokens: number }> = [];

  for (let i = 0; i < BOOTSTRAP_SECTION_PRIORITY.length; i++) {
    const name = BOOTSTRAP_SECTION_PRIORITY[i];
    const budgetTokens = Math.floor(ceiling * SECTION_BUDGET_FRACTIONS[name]);

    let section: ComposedSection | null = null;
    try {
      section = await builders[i](budgetTokens);
    } catch (err) {
      logger.debug(`[bootstrap] section ${name} failed: ${err}`);
    }

    if (!section) {
      result.sections.push({
        name,
        priority: i + 1,
        tokens: 0,
        included: false,
        itemCount: 0,
        dropReason: 'empty',
      });
      continue;
    }

    const rendered = `${section.header}\n${section.body}`;
    const tokens = estimateTokens(rendered);

    if (result.totalTokens + tokens <= ceiling) {
      included.push({ section, tokens });
      result.totalTokens += tokens;
      result.sections.push({
        name,
        priority: i + 1,
        tokens,
        included: true,
        itemCount: section.itemCount,
      });
    } else {
      // Try a truncated variant before dropping outright.
      const remaining = ceiling - result.totalTokens - 2; // leave headroom
      const fittedBody = fitToTokens(section.body, Math.min(budgetTokens, remaining));
      if (fittedBody && remaining > 16) {
        const trimmed: ComposedSection = { ...section, body: fittedBody };
        const trimmedTokens = estimateTokens(`${trimmed.header}\n${trimmed.body}`);
        if (result.totalTokens + trimmedTokens <= ceiling) {
          included.push({ section: trimmed, tokens: trimmedTokens });
          result.totalTokens += trimmedTokens;
          result.sections.push({
            name,
            priority: i + 1,
            tokens: trimmedTokens,
            included: true,
            itemCount: trimmed.itemCount,
          });
          continue;
        }
      }
      result.sections.push({
        name,
        priority: i + 1,
        tokens,
        included: false,
        itemCount: section.itemCount,
        dropReason: 'ceiling-exceeded',
      });
    }
  }

  if (included.length === 0) {
    result.block = '# Session bootstrap\n\n(no context available yet)';
    result.totalTokens = estimateTokens(result.block);
    return result;
  }

  const blockParts = included.map(({ section }) => `${section.header}\n${section.body}`);
  result.block = `# Session bootstrap\n\n${blockParts.join('\n\n')}`;
  result.totalTokens = estimateTokens(result.block);
  if (result.totalTokens > ceiling) {
    // Final safety clamp (headers/rounding drift).
    result.block = fitToTokens(result.block, ceiling);
    result.totalTokens = estimateTokens(result.block);
  }
  return result;
}

/** Expand `~` in a project path argument coming from CLI/hooks. */
export function expandHomePath(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}
