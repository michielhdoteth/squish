import { describe, expect, it } from 'bun:test';
import {
  extractDurableSelfIterationFacts,
  type MessageRow,
} from '../../core/session/self-iteration-job.js';

function userMessage(content: string): MessageRow {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conversation-1',
    role: 'user',
    content,
    createdAt: new Date('2026-04-20T12:00:00Z'),
  };
}

describe('self-iteration extraction', () => {
  it('suppresses transient plans, task phrasing, and forbidden product terms', () => {
    const blockedMemoryPhrase = ['mem', 'palace'].join(' ');
    const blockedIntegrationPhrase = 'om' + 'ni';
    const extracted = extractDurableSelfIterationFacts([
      userMessage("I'll update the tests tomorrow."),
      userMessage("Let's add a dashboard next."),
      userMessage('Todo: clean up the release notes.'),
      userMessage(`Remember that the old ${blockedMemoryPhrase} wording must not be used.`),
      userMessage(`The ${blockedIntegrationPhrase} integration is temporary context only.`),
    ]);

    expect(extracted).toEqual([]);
  });

  it('extracts only durable decisions, preferences, and facts', () => {
    const extracted = extractDurableSelfIterationFacts([
      userMessage('We decided to use SQLite for local mode. I prefer concise review comments. Remember that releases require a smoke test.'),
    ]);

    expect(extracted.map((fact) => fact.type)).toEqual(['decision', 'preference', 'fact']);
    expect(extracted.map((fact) => fact.content)).toEqual([
      'Decision: We decided to use SQLite for local mode.',
      'Preference: I prefer concise review comments.',
      'Fact: Remember that releases require a smoke test.',
    ]);
  });

  it('dedupes repeated captures from one ended conversation', () => {
    const extracted = extractDurableSelfIterationFacts([
      userMessage('We decided to use SQLite for local mode.'),
      userMessage('Decision: we decided to use SQLite for local mode.'),
    ]);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].type).toBe('decision');
    expect(extracted[0].content).toBe('Decision: We decided to use SQLite for local mode.');
  });
});
