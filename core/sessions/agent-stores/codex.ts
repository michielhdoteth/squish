/**
 * Codex session store - stub.
 *
 * Not yet implemented. Returns `available: false` so the registry
 * skips it cleanly.
 */
import type { Chunk, SessionGroup } from '../types.js';
import type { AgentName, AgentSessionStore } from './types.js';

export class CodexSessionStore implements AgentSessionStore {
  readonly name: AgentName = 'codex';

  async available(): Promise<{ ok: boolean; reason?: string; meta?: Record<string, unknown> }> {
    return { ok: false, reason: 'codex not yet implemented' };
  }

  async status(): Promise<{ path: string; size: number; sessions: number; messages: number; parts: number } | null> {
    return null;
  }

  async listSessions(_opts?: { limit?: number; offset?: number; directory_glob?: string }): Promise<SessionGroup[]> {
    return [];
  }

  async searchSessions(_opts: { query: string; limit?: number; depth?: 'text' | 'deep'; directory_glob?: string; per_session_chunks?: number }): Promise<Chunk[]> {
    return [];
  }

  async getSession(_id: string): Promise<{ group: SessionGroup; chunks: Chunk[] } | null> {
    return null;
  }

  async findRelatedSessions(_opts: { repo_path?: string; files?: string[]; limit?: number }): Promise<Array<{ group: SessionGroup; score: number; reason: string }>> {
    return [];
  }
}
