/**
 * Pretty printers for chunks and session groups.
 *
 * No chalk / picocolors dep - plain text with indent. Caller is
 * expected to pipe to stdout / log.
 */

import type { Chunk, ChunkResult, ChunkType, SessionGroup } from './types.js';

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  } catch {
    return iso;
  }
}

function singleLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function chunkHeader(c: Chunk): string {
  return `[${c.type}] ${fmtDate(c.timestamp)} - ${c.session_title || c.session_id}`;
}

export function formatChunkCard(chunk: Chunk, opts?: { score?: number; why?: string }): string {
  const lines: string[] = [];
  const header = chunkHeader(chunk);
  const scorePart = typeof opts?.score === 'number' ? ` [score ${opts.score.toFixed(2)}]` : '';
  lines.push(`- ${header}${scorePart}`);
  if (opts?.why) lines.push(`    why: ${opts.why}`);
  lines.push(`    agent: ${chunk.agent}   branch: ${chunk.branch || '-'}`);
  if (chunk.files && chunk.files.length > 0) {
    lines.push(`    files: ${chunk.files.join(', ')}`);
  }
  lines.push(`    ${singleLine(chunk.content)}`);
  return lines.join('\n');
}

export function formatChunkResults(results: ChunkResult[]): string {
  if (results.length === 0) return '(no matching chunks)';
  return results
    .map((r, i) => `${i + 1}. ${formatChunkCard(r.chunk, { score: r.score, why: r.why })}`)
    .join('\n\n');
}

const GROUP_ORDER: ChunkType[] = ['summary', 'decision', 'command', 'file', 'error', 'todo'];

export function formatSessionDetail(session: SessionGroup): string {
  const lines: string[] = [];
  lines.push(`Session: ${session.session_id}`);
  lines.push(`  title:        ${session.title || '(untitled)'}`);
  lines.push(`  project:      ${session.project}`);
  lines.push(`  repo_path:    ${session.repo_path}`);
  lines.push(`  branch:       ${session.branch}`);
  lines.push(`  agent:        ${session.agent}`);
  lines.push(`  status:       ${session.status}`);
  lines.push(`  started_at:   ${fmtDate(session.started_at)}`);
  lines.push(`  ended_at:     ${fmtDate(session.ended_at)}`);
  lines.push(`  chunk_count:  ${session.chunk_count}`);

  if (session.chunks && session.chunks.length > 0) {
    const byType: Record<ChunkType, Chunk[]> = {
      summary: [],
      decision: [],
      command: [],
      file: [],
      error: [],
      todo: [],
    };
    for (const c of session.chunks) byType[c.type].push(c);
    for (const t of GROUP_ORDER) {
      if (byType[t].length === 0) continue;
      lines.push('');
      lines.push(`  ${t}s (${byType[t].length}):`);
      for (const c of byType[t]) {
        lines.push(`    - ${fmtDate(c.timestamp)} ${singleLine(c.content)}`);
      }
    }
  }
  return lines.join('\n');
}

export function formatSessionList(sessions: SessionGroup[]): string {
  if (sessions.length === 0) return '(no sessions)';
  const lines: string[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    lines.push(
      `${i + 1}. ${s.session_id}   ${s.title || '(untitled)'}   [${s.chunk_count} chunks]`
    );
    lines.push(
      `    ${s.project}   ${s.repo_path}   branch: ${s.branch || '-'}   agent: ${s.agent}   status: ${s.status}`
    );
    lines.push(
      `    started: ${fmtDate(s.started_at)}   ended: ${fmtDate(s.ended_at)}`
    );
  }
  return lines.join('\n');
}
