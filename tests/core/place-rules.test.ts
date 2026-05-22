import { describe, expect, test } from 'bun:test';

describe('place rules engine', () => {
  test('exports all rule functions and constants', async () => {
    const mod = await import('../../core/places/rules.ts');
    expect(typeof mod.matchesRule).toBe('function');
    expect(typeof mod.findMatchingPlace).toBe('function');
    expect(typeof mod.createPlaceRule).toBe('function');
    expect(typeof mod.getProjectRules).toBe('function');
    expect(typeof mod.initializeDefaultRules).toBe('function');
    expect(typeof mod.deletePlaceRule).toBe('function');
    expect(typeof mod.updatePlaceRule).toBe('function');
    expect(Array.isArray(mod.DEFAULT_RULES)).toBe(true);
  });

  test('DEFAULT_RULES has at least 10 rules', async () => {
    const { DEFAULT_RULES } = await import('../../core/places/rules.ts');
    expect(DEFAULT_RULES.length).toBeGreaterThanOrEqual(10);
  });

  test('matchesRule returns boolean', async () => {
    const { matchesRule, DEFAULT_RULES } = await import('../../core/places/rules.ts');
    const rule = DEFAULT_RULES[0];
    const result = matchesRule(rule as any, {
      toolName: 'test',
      content: '',
      tags: [],
      memoryType: 'observation'
    });
    expect(typeof result).toBe('boolean');
  });

  test('getProjectRules returns array', async () => {
    const { getProjectRules } = await import('../../core/places/rules.ts');
    const rules = await getProjectRules();
    expect(Array.isArray(rules)).toBe(true);
  });
});
