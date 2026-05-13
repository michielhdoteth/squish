/**
 * Memory Report - Static HOT .md from COLD SQLite
 * 
 * Generates .squish/MEMORY.md from the database. The agent reads
 * this file naturally on session start - no injection needed.
 * 
 * Regenerated automatically on:
 *   - rememberMemory() (new memory created)
 *   - pinMemory() / unpinMemory()
 *   - Tier changes (hot->cold or cold->hot)
 * 
 * This is our "GRAPH_REPORT.md" equivalent - but for memories.
 */

import { getDb } from '../../db/index.js';
import { config } from '../../config.js';
import { ensureProject } from '../projects.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../logger.js';

const MAX_RECENT = 5;
const MAX_PINNED = 10;
const MAX_DECISIONS = 3;

export interface MemoryReport {
  recent: MemoryReportEntry[];
  pinned: MemoryReportEntry[];
  decisions: MemoryReportEntry[];
  stats: {
    total: number;
    pinned: number;
    byType: Record<string, number>;
    hotCount: number;
    coldCount: number;
  };
}

interface MemoryReportEntry {
  id: string;
  type: string;
  tier: string;
  content: string;
  tags: string[];
  importance: number;
  createdAt: string;
}

/**
 * Generate the memory report markdown and write to .squish/MEMORY.md
 */
export async function regenerateMemoryReport(projectPath?: string): Promise<void> {
  const project = projectPath || process.cwd();
  
  try {
    const report = await buildMemoryReport(project);
    const markdown = formatMemoryReport(report);
    
    const outputDir = join(project, '.squish');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'MEMORY.md'), markdown, 'utf-8');
  } catch (error) {
    // Fail silently - report is non-critical
    logger.debug('Memory report generation failed:', error);
  }
}

/**
 * Build the report data from SQLite cold storage
 */
async function buildMemoryReport(projectPath: string): Promise<MemoryReport> {
  const drizzle = await getDb();
  const db: any = (drizzle as any).$client ?? drizzle;
  const project = await ensureProject(projectPath);
  
  const emptyReport = (): MemoryReport => ({
    recent: [], pinned: [], decisions: [],
    stats: { total: 0, pinned: 0, byType: {}, hotCount: 0, coldCount: 0 }
  });

  if (!project) return emptyReport();

  try {
    // Recent memories (hot-tier, ordered by importance)
    const recent = (db.prepare(`
      SELECT id, type, tier, content, importance_score, created_at 
      FROM memories 
      WHERE project_id = ? AND (status IS NULL OR status != 'expired')
      ORDER BY created_at DESC LIMIT ?
    `).all(project.id, MAX_RECENT) as any[]).map(parseEntry);

    // Pinned memories
    const pinned = (db.prepare(`
      SELECT id, type, tier, content, importance_score, created_at 
      FROM memories 
      WHERE project_id = ? AND is_pinned = 1 AND (status IS NULL OR status != 'expired')
      ORDER BY importance_score DESC LIMIT ?
    `).all(project.id, MAX_PINNED) as any[]).map(parseEntry);

    // Recent decisions (type = 'decision', most recent)
    const decisions = (db.prepare(`
      SELECT id, type, tier, content, importance_score, created_at 
      FROM memories 
      WHERE project_id = ? AND type = 'decision' AND (status IS NULL OR status != 'expired')
      ORDER BY created_at DESC LIMIT ?
    `).all(project.id, MAX_DECISIONS) as any[]).map(parseEntry);

    // Stats
    const total = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE project_id = ? AND (status IS NULL OR status != \'expired\')').get(project.id) as any)?.c || 0;
    const pinnedCount = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE project_id = ? AND is_pinned = 1').get(project.id) as any)?.c || 0;
    const hotCount = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE project_id = ? AND tier = \'hot\' AND (status IS NULL OR status != \'expired\')').get(project.id) as any)?.c || 0;
    const coldCount = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE project_id = ? AND tier = \'cold\' AND (status IS NULL OR status != \'expired\')').get(project.id) as any)?.c || 0;
    
    // Type breakdown
    const typeRows = db.prepare(`
      SELECT type, COUNT(*) as c FROM memories 
      WHERE project_id = ? AND (status IS NULL OR status != 'expired') 
      GROUP BY type ORDER BY c DESC
    `).all(project.id) as any[];
    const byType: Record<string, number> = {};
    for (const r of typeRows) byType[r.type || 'unknown'] = r.c;

    return {
      recent, pinned, decisions,
      stats: { total, pinned: pinnedCount, byType, hotCount, coldCount }
    };
  } catch {
    return emptyReport();
  }
}

function parseEntry(row: any): MemoryReportEntry {
  const content: string = row.content || '';
  return {
    id: row.id,
    type: row.type || 'memory',
    tier: row.tier || 'cold',
    content: content.length > 200 ? content.substring(0, 200) + '...' : content,
    tags: [],
    importance: row.importance_score || 50,
    createdAt: row.created_at ? new Date(row.created_at * 1000).toISOString().split('T')[0] : 'unknown',
  };
}

/**
 * Format the report as markdown for MEMORY.md
 */
function formatMemoryReport(report: MemoryReport): string {
  const lines: string[] = [];
  
  lines.push('# Memory Report');
  lines.push('');
  lines.push(`> Auto-generated from Squish. Updated on every memory change.`);
  lines.push('');
  lines.push(`**${report.stats.total}** total memories | **${report.stats.pinned}** pinned | **${report.stats.hotCount}** hot / **${report.stats.coldCount}** cold`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Recent memories
  if (report.recent.length > 0) {
    lines.push('## Recent');
    lines.push('');
    for (const m of report.recent) {
      const tag = m.type === 'decision' ? 'dec' : m.type === 'fact' ? 'fact' : m.type === 'observation' ? 'obs' : m.type;
      lines.push(`- [${tag}] ${m.content}`);
    }
    lines.push('');
  }

  // Pinned memories
  if (report.pinned.length > 0) {
    lines.push('## Pinned');
    lines.push('');
    for (const m of report.pinned) {
      const tag = m.type === 'decision' ? 'dec' : m.type === 'fact' ? 'fact' : m.type === 'observation' ? 'obs' : m.type;
      lines.push(`- **${tag}** ${m.content}`);
    }
    lines.push('');
  }

  // Recent decisions
  if (report.decisions.length > 0) {
    lines.push('## Decisions');
    lines.push('');
    for (const m of report.decisions) {
      lines.push(`- ${m.content}`);
    }
    lines.push('');
  }

  // Stats
  lines.push('---');
  lines.push('');
  lines.push('### Stats');
  lines.push('');
  lines.push(`| Type | Count |`);
  lines.push(`|------|-------|`);
  for (const [type, count] of Object.entries(report.stats.byType).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${type} | ${count} |`);
  }
  lines.push('');
  lines.push(`_Updated: ${new Date().toISOString()}_`);

  return lines.join('\n');
}
