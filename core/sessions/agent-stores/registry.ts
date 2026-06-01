/**
 * Registry of agent session stores.
 *
 * Each store knows how to read one agent's local session history
 * (e.g. opencode.db, claude-code's JSONL files, codex's session
 * store). The public `core/sessions/store.ts` layer iterates
 * these stores when answering search/list/get/related queries.
 *
 * To add a new agent: implement `AgentSessionStore`, add a key
 * to `stores`, and (if its name is not in the spec) add the
 * name to `AgentName` in `types.ts`.
 */
import { OpenCodeSessionStore } from './opencode.js';
import { ClaudeCodeSessionStore } from './claude-code.js';
import { CodexSessionStore } from './codex.js';
import type { AgentName, AgentSessionStore } from './types.js';

const stores: Record<AgentName, AgentSessionStore> = {
  'opencode': new OpenCodeSessionStore(),
  'claude-code': new ClaudeCodeSessionStore(),
  'codex': new CodexSessionStore(),
};

export function getAgentStore(name: AgentName): AgentSessionStore {
  return stores[name];
}

export function availableAgentStores(): AgentName[] {
  return Object.keys(stores) as AgentName[];
}

export function allAgentStores(): AgentSessionStore[] {
  return Object.values(stores);
}
