import { describe, test, expect } from 'bun:test';

import { calculateRecencyBonus } from '../../../core/search/graph-boost.js';

describe('Graph Boost - calculateRecencyBonus', () => {
  test('should return 1.5x bonus for today', () => {
    const today = new Date().toISOString();
    const bonus = calculateRecencyBonus(today);
    expect(bonus).toBe(1.5);
  });

  test('should return 1.2x bonus for yesterday', () => {
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const bonus = calculateRecencyBonus(yesterday);
    expect(bonus).toBe(1.2);
  });

  test('should return 1.0x bonus for older dates', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const bonus = calculateRecencyBonus(threeDaysAgo);
    expect(bonus).toBe(1.0);
  });

  test('should handle Date object input', () => {
    const today = new Date();
    const bonus = calculateRecencyBonus(today);
    expect(bonus).toBe(1.5);
  });

  test('should handle string date input', () => {
    const today = new Date().toISOString();
    const bonus = calculateRecencyBonus(today);
    expect(bonus).toBe(1.5);
  });
});
