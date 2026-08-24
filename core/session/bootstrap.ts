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
 *   - Each section has its own budget (fraction of the ceiling), enforced
 *     by item-level trimming inside each builder: lowest-value items are
 *     dropped whole until the section fits (Batch 7 review, M-3). The
 *     ceiling clamp remains only as a final backstop.
 *   - Project rows are NOT created on read paths; pass ensureProject:true
 *     from explicit write-ish entry points (Batch 7 review, M-5). NEVER
 *     raw memory dumps: item counts and per-item char caps are enforced
 *     everywhere.
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
export const SECTION_BUDGET_FRACTIONS: Record<BootstrapSectionName, number> = {
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
  /**
   * Batch 7 review (M-5): create the project row when the path is unknown.
   * Default OFF so read paths (bootstrap composition) never register
   * projects as a side effect; explicit write-ish entry points
   * (e.g. MCP squish_context action=session-start) opt in.
   */
  ensureProject?: boolean;
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

/**
 * Batch 7 review (M-3): belief group titles like "AVOID:" or "CONSTRAINTS:"
 * are structure, not items - they must not be counted or left dangling
 * when the items under them are trimmed away.
 */
const GROUP_TITLE_RE = /^[A-Za-z][A-Za-z ]{0,30}:\s*$/;

function countRenderedItems(body: string): number {
  return body
    .split('\n')
    .filter((l) => l.trim().length > 0 && !GROUP_TITLE_RE.test(l.trim()))
    .length;
}

/**
 * Batch 7 review (M-3): enforce a real per-section token budget by
 * dropping lowest-value items (trailing lines) until the section renders
 * within budget. Lines must arrive in priority order so popping from the
 * end discards the least valuable items first. Orphaned group titles are
 * cleaned up as items disappear. The single highest-priority item is
 * always kept (hard-fitted via chars/4) so a section never vanishes just
 * because its top item alone exceeds the budget.
 */
function fitItemsToBudget(
  header: string,
  lines: string[],
  budgetTokens: number,
): { body: string; itemCount: number } | null {
  if (budgetTokens <= 0 || lines.length === 0) return null;

  const renderTokens = (ls: string[]) => estimateTokens(`${header}\n${ls.join('\n')}`);
  const working = [...lines];

  while (working.length > 1 && renderTokens(working) > budgetTokens) {
    working.pop();
    while (working.length > 1 && GROUP_TITLE_RE.test(working[working.length - 1].trim())) {
      working.pop();
    }
  }

  let body: string;
  if (renderTokens(working) <= budgetTokens) {
    body = working.join('\n');
  } else {
    // Only the top item remains and it alone exceeds the budget.
    body = fitToTokens(working.join('\n'), budgetTokens);
  }
  const itemCount = Math.max(1, countRenderedItems(body));
  if (itemCount === 0) return null;
  return { body, itemCount };
}

async function resolveProjectId(
  projectPath: string | undefined,
  options: { ensure?: boolean } = {}
): Promise<{ path: string; id: string | null }> {
  const resolved = projectPath || process.cwd();
  try {
    // Batch 7 review (M-5): read paths must not create project rows as a
    // side effect. ensureProject runs only when explicitly requested.
    if (options.ensure) {
      await ensureProject(resolved);
    }
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
  budgetTokens: number
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
  for (const [key, label] of Object.entries(labels)) {
    const value = (content as unknown as Record<string, string>)[key]?.trim();
    if (!value) continue;
    // M-3: collect all candidate items first; the budget fitter drops the
    // lowest-priority ones instead of a fixed count.
    lines.push(`${label}: ${truncateItem(value, 400)}`);
  }
  if (lines.length === 0) return null;
  const fitted = fitItemsToBudget('## Core memory', lines.slice(0, maxItems), budgetTokens);
  if (!fitted) return null;
  return { name: 'core-memory', header: '## Core memory', body: fitted.body, itemCount: fitted.itemCount };
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
  budgetTokens: number
): Promise<ComposedSection | null> {
  if (!projectId) return null;
  const [failures, constraints, decisions] = await Promise.all([
    getRecentFailures(projectId, maxItems),
    getActiveConstraints(projectId),
    getActiveDecisions(projectId),
  ]);

  // M-3: flatten groups into priority-ordered lines so the budget fitter
  // can drop trailing (lowest-confidence) items across group boundaries.
  const flatLines: string[] = [];
  const pushGroup = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    flatLines.push(`${title}:`, ...lines);
  };
  pushGroup('AVOID', beliefLines(failures as BeliefStatementRow[], maxItems));
  pushGroup('CONSTRAINTS', beliefLines(constraints as BeliefStatementRow[], maxItems));
  pushGroup('DECISIONS', beliefLines(decisions as BeliefStatementRow[], maxItems));

  if (flatLines.length === 0) return null;
  const header = '## Active beliefs (state reconstruction)';
  const fitted = fitItemsToBudget(header, flatLines, budgetTokens);
  if (!fitted) return null;
  return { name: 'beliefs', header, body: fitted.body, itemCount: fitted.itemCount };
}

async function buildWorkingSetSection(
  projectPath: string,
  sessionId: string | undefined,
  _maxItems: number,
  budgetTokens: number
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
  // M-3: trim line-by-line instead of mid-line truncation so wake-up
  // facts are dropped whole rather than cut in half.
  const header = '## Working set (wake-up)';
  const lines = summary.split('\n').filter((l) => l.trim().length > 0);
  const fitted = fitItemsToBudget(header, lines, budgetTokens);
  if (!fitted) return null;
  return { name: 'working-set', header, body: fitted.body, itemCount: fitted.itemCount };
}

async function buildPinnedSection(
  projectId: string | null,
  maxItems: number,
  budgetTokens: number
): Promise<ComposedSection | null> {
  try {
    const pinned = await getPinnedMemoriesForContext(projectId ?? undefined);
    if (pinned.length === 0) return null;
    const header = '## Pinned memories';
    const lines = pinned
      .slice(0, maxItems)
      .map((p) => `- ${truncateItem(p.replace(/^\[Pinned\]\s*/, ''), 260)}`);
    const fitted = fitItemsToBudget(header, lines, budgetTokens);
    if (!fitted) return null;
    return { name: 'pinned', header, body: fitted.body, itemCount: fitted.itemCount };
  } catch {
    return null;
  }
}

async function buildRecentDecisionsSection(
  projectPath: string,
  maxItems: number,
  budgetTokens: number
): Promise<ComposedSection | null> {
  try {
    const recent = await getRecent(projectPath, 25);
    const decisions = recent.filter((m: any) => m.type === 'decision').slice(0, maxItems);
    if (decisions.length === 0) return null;
    const header = '## Recent decisions';
    const lines = decisions.map((m: any, i: number) => `${i + 1}. ${truncateItem(m.content ?? '', 240)}`);
    const fitted = fitItemsToBudget(header, lines, budgetTokens);
    if (!fitted) return null;
    return { name: 'recent-decisions', header, body: fitted.body, itemCount: fitted.itemCount };
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

  const { path: projectPath, id: projectId } = await resolveProjectId(options.projectPath, {
    ensure: options.ensureProject ?? false,
  });

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
      // Batch 7 review (M-3): builders already fit sections to their own
      // budgets, so this branch is a backstop for ceiling pressure from
      // earlier sections. Trim item-by-item (never mid-section) before
      // dropping outright.
      const remaining = ceiling - result.totalTokens - 2; // leave headroom
      const bodyLines = section.body.split('\n').filter((l) => l.trim().length > 0);
      const fitted = fitItemsToBudget(section.header, bodyLines, Math.min(budgetTokens, remaining));
      if (fitted) {
        const trimmedTokens = estimateTokens(`${section.header}\n${fitted.body}`);
        if (result.totalTokens + trimmedTokens <= ceiling) {
          const trimmed: ComposedSection = { ...section, body: fitted.body, itemCount: fitted.itemCount };
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
