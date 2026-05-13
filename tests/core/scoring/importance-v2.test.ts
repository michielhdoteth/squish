/**
 * Tests for 3-factor importance scoring v2
 * TDD: Write tests first, then implement
 */

import { describe, test, expect } from 'bun:test';
import {
  calculateImportanceV2,
  detectSurprise,
  detectEmotion,
  ImportanceFactors,
} from '../../../core/scoring/importance-v2.js';

describe('calculateImportanceV2', () => {
  test('should calculate with default weights', () => {
    const factors: ImportanceFactors = {
      baseImportance: 0.8,
      surprise: 0.5,
      emotion: 0.3,
    };

    const result = calculateImportanceV2(factors);

    // Expected: 0.5*0.8 + 0.3*0.5 + 0.2*0.3 = 0.4 + 0.15 + 0.06 = 0.61
    expect(result).toBeCloseTo(0.61, 2);
  });

  test('should calculate with custom weights', () => {
    const factors: ImportanceFactors = {
      baseImportance: 0.8,
      surprise: 0.5,
      emotion: 0.3,
    };

    const result = calculateImportanceV2(factors, {
      base: 0.6,
      surprise: 0.3,
      emotion: 0.1,
    });

    // Expected: 0.6*0.8 + 0.3*0.5 + 0.1*0.3 = 0.48 + 0.15 + 0.03 = 0.66
    expect(result).toBeCloseTo(0.66, 2);
  });

  test('should clamp to 0 minimum', () => {
    const factors: ImportanceFactors = {
      baseImportance: -0.5,
      surprise: -0.5,
      emotion: -0.5,
    };

    const result = calculateImportanceV2(factors);
    expect(result).toBe(0);
  });

  test('should clamp to 1 maximum', () => {
    const factors: ImportanceFactors = {
      baseImportance: 1.5,
      surprise: 1.5,
      emotion: 1.5,
    };

    const result = calculateImportanceV2(factors);
    expect(result).toBe(1);
  });

  test('should handle zero values', () => {
    const factors: ImportanceFactors = {
      baseImportance: 0,
      surprise: 0,
      emotion: 0,
    };

    const result = calculateImportanceV2(factors);
    expect(result).toBe(0);
  });

  test('should handle all max values', () => {
    const factors: ImportanceFactors = {
      baseImportance: 1,
      surprise: 1,
      emotion: 1,
    };

    const result = calculateImportanceV2(factors);
    expect(result).toBe(1);
  });
});

describe('detectSurprise', () => {
  test('should return 0.5 for first memory (empty existing)', () => {
    const newMemory = { content: 'This is a new decision', type: 'decision' };
    const existingMemories: { content: string; type: string }[] = [];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBe(0.5);
  });

  test('should detect contradiction with yes/no', () => {
    const newMemory = { content: 'The answer is yes', type: 'fact' };
    const existingMemories = [
      { content: 'The answer is no', type: 'fact' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('should detect contradiction with true/false', () => {
    const newMemory = { content: 'The statement is true', type: 'fact' };
    const existingMemories = [
      { content: 'The statement is false', type: 'fact' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBeGreaterThan(0);
  });

  test('should detect contradiction with always/never', () => {
    const newMemory = { content: 'We always use this approach', type: 'decision' };
    const existingMemories = [
      { content: 'We never use this approach', type: 'decision' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBeGreaterThan(0);
  });

  test('should detect contradiction with increase/decrease', () => {
    const newMemory = { content: 'We need to increase the budget', type: 'decision' };
    const existingMemories = [
      { content: 'We need to decrease the budget', type: 'decision' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBeGreaterThan(0);
  });

  test('should return 0 when no contradictions', () => {
    const newMemory = { content: 'The sky is blue', type: 'fact' };
    const existingMemories = [
      { content: 'The grass is green', type: 'fact' },
      { content: 'Water is wet', type: 'fact' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBe(0);
  });

  test('should handle multiple contradictions (capped at 1)', () => {
    const newMemory = { content: 'yes true always increase up good', type: 'fact' };
    const existingMemories = [
      { content: 'no', type: 'fact' },
      { content: 'false', type: 'fact' },
      { content: 'never', type: 'fact' },
      { content: 'decrease', type: 'fact' },
      { content: 'down', type: 'fact' },
      { content: 'bad', type: 'fact' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('should be case-insensitive', () => {
    const newMemory = { content: 'YES', type: 'fact' };
    const existingMemories = [
      { content: 'no', type: 'fact' },
    ];

    const result = detectSurprise(newMemory, existingMemories);
    expect(result).toBeGreaterThan(0);
  });
});

describe('detectEmotion', () => {
  test('should detect urgent keywords', () => {
    const content = 'This is an urgent issue that needs immediate attention';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should detect critical keywords', () => {
    const content = 'Critical error in production system';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should detect ASAP keywords', () => {
    const content = 'Please fix this ASAP';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should detect emergency keywords', () => {
    const content = 'Emergency: System is down';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should detect broken keywords', () => {
    const content = 'The build is broken';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should detect error keywords', () => {
    const content = 'Error occurred during deployment';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should detect fail keywords', () => {
    const content = 'The test did not fail';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);  // "fail" is present as a whole word
  });

  test('should detect important keywords', () => {
    const content = 'This is an important decision for the project';
    const result = detectEmotion(content);
    expect(result).toBe(0.3);
  });

  test('should detect key keywords', () => {
    const content = 'This is a key component of the system';
    const result = detectEmotion(content);
    expect(result).toBe(0.3);
  });

  test('should detect crucial keywords', () => {
    const content = 'This is crucial for the release';
    const result = detectEmotion(content);
    expect(result).toBe(0.3);
  });

  test('should detect decision keywords', () => {
    const content = 'We made a decision to refactor';
    const result = detectEmotion(content);
    expect(result).toBe(0.3);
  });

  test('should detect milestone keywords', () => {
    const content = 'We reached a milestone in development';
    const result = detectEmotion(content);
    expect(result).toBe(0.3);
  });

  test('should detect release keywords', () => {
    const content = 'The release is scheduled for tomorrow';
    const result = detectEmotion(content);
    expect(result).toBe(0.3);
  });

  test('should combine urgent and important (capped at 1)', () => {
    const content = 'Urgent: This important decision is crucial for the release';
    const result = detectEmotion(content);
    expect(result).toBe(0.8);  // 0.5 + 0.3 = 0.8
  });

  test('should return 0 for neutral content', () => {
    const content = 'The sky is blue';
    const result = detectEmotion(content);
    expect(result).toBe(0);
  });

  test('should be case-insensitive', () => {
    const content = 'URGENT: This is Critical';
    const result = detectEmotion(content);
    expect(result).toBe(0.5);
  });

  test('should cap at 1.0 maximum', () => {
    const content = 'urgent important crucial decision milestone release emergency';
    const result = detectEmotion(content);
    expect(result).toBeLessThanOrEqual(1.0);
  });
});
