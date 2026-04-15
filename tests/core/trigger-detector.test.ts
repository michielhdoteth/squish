import { describe, expect, it } from 'bun:test';
import { detectMemorySignals } from '../../core/memory/trigger-detector.js';

describe('trigger-detector', () => {
  it('detects explicit trigger phrases', () => {
    const signals = detectMemorySignals('Remember this: from now on always use bun.');
    expect(signals.explicitTriggers.length).toBeGreaterThan(0);
    expect(signals.priority).toBe('high');
  });

  it('detects decision intent and suggests decision type', () => {
    const signals = detectMemorySignals('We decided to use PostgreSQL over SQLite for remote mode.');
    expect(signals.implicit.decision).toBe(true);
    expect(signals.suggestedType).toBe('decision');
  });

  it('detects correction and marks high priority', () => {
    const signals = detectMemorySignals('No, I meant use token auth first and oauth second.');
    expect(signals.implicit.correction).toBe(true);
    expect(signals.priority).toBe('high');
  });
});
