/**
 * Tests for contradiction detection v2 with LLM-as-Validator
 * TDD: Write tests first, then implement
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  detectContradictionLLM,
  checkContradictions,
  ContradictionResult,
} from '../../../core/consolidation/contradiction-v2.js';

// Mock the db-client module
let dbClientMock: any;

// Mock logger
mock.module('../../../core/logger.js', () => ({
  logger: {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  },
}));

// Mock db-client
mock.module('../../../core/lib/db-client.js', () => ({
  getDbClient: mock(() => dbClientMock),
}));

describe('detectContradictionLLM', () => {
  beforeEach(() => {
    // Reset mocks
    dbClientMock = null;
  });

  test('should detect contradiction with keyword-based (non-LLM)', async () => {
    const memory1 = { id: 'mem-1', content: 'The answer is yes' };
    const memory2 = { id: 'mem-2', content: 'The answer is no' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
    expect(result.confidence).toBe(0.8);
    expect(result.reason).toContain('opposite keywords');
    expect(result.suggestedResolution).toBe('merge or mark superseded');
  });

  test('should return no contradiction for similar content', async () => {
    const memory1 = { id: 'mem-1', content: 'The sky is blue' };
    const memory2 = { id: 'mem-2', content: 'The ocean is blue' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(false);
    expect(result.confidence).toBe(0.95);
  });

  test('should detect true/false contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'The statement is true' };
    const memory2 = { id: 'mem-2', content: 'The statement is false' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should detect always/never contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'We always use this approach' };
    const memory2 = { id: 'mem-2', content: 'We never use this approach' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should detect increase/decrease contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'Increase the budget' };
    const memory2 = { id: 'mem-2', content: 'Decrease the budget' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should detect up/down contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'Prices are going up' };
    const memory2 = { id: 'mem-2', content: 'Prices are going down' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should detect good/bad contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'This is a good solution' };
    const memory2 = { id: 'mem-2', content: 'This is a bad solution' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should detect success/failure contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'The deployment was a success' };
    const memory2 = { id: 'mem-2', content: 'The deployment was a failure' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should detect working/broken contradiction', async () => {
    const memory1 = { id: 'mem-1', content: 'The system is working' };
    const memory2 = { id: 'mem-2', content: 'The system is broken' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should be case-insensitive', async () => {
    const memory1 = { id: 'mem-1', content: 'YES' };
    const memory2 = { id: 'mem-2', content: 'no' };

    const result = await detectContradictionLLM(memory1, memory2, false);

    expect(result.hasContradiction).toBe(true);
  });

  test('should handle LLM fallback on error', async () => {
    // This test verifies that even with useLLM=true, it falls back to keyword
    // since we don't have actual LLM in tests
    const memory1 = { id: 'mem-1', content: 'yes' };
    const memory2 = { id: 'mem-2', content: 'no' };

    const result = await detectContradictionLLM(memory1, memory2, true);

    // Should still detect contradiction via keyword fallback
    expect(result.hasContradiction).toBe(true);
  });
});

describe('checkContradictions', () => {
  beforeEach(() => {
    // Setup mock database client
  });

  test('should return empty array when no contradictions found', async () => {
    // Mock database to return no matching memories
    dbClientMock = {
      db: {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => Promise.resolve([])),
          })),
        })),
      },
      schema: {},
    };

    const newMemory = {
      id: 'new-mem',
      content: 'The sky is blue',
      projectId: 'proj-1',
    };

    const results = await checkContradictions(newMemory, false);
    expect(results).toEqual([]);
  });

  test('should detect contradictions against existing memories', async () => {
    const existingMemories = [
      { id: 'existing-1', content: 'The answer is no' },
      { id: 'existing-2', content: 'The sky is blue' },
    ];

    dbClientMock = {
      db: {
        query: mock(() => Promise.resolve({ rows: existingMemories })),
      },
      schema: {},
    };

    const newMemory = {
      id: 'new-mem',
      content: 'The answer is yes',
      projectId: 'proj-1',
    };

    const results = await checkContradictions(newMemory, false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].hasContradiction).toBe(true);
  });

  test('should skip comparing with itself', async () => {
    const existingMemories = [
      { id: 'same-id', content: 'Same content' },
    ];

    dbClientMock = {
      db: {
        query: mock(() => Promise.resolve({ rows: existingMemories })),
      },
      schema: {},
    };

    const newMemory = {
      id: 'same-id',  // Same ID - should be skipped
      content: 'Same content',
      projectId: 'proj-1',
    };

    const results = await checkContradictions(newMemory, false);
    expect(results).toEqual([]);
  });

  test('should handle database errors gracefully', async () => {
    dbClientMock = {
      db: {
        query: mock(() => Promise.reject(new Error('DB error'))),
      },
      schema: {},
    };

    const newMemory = {
      id: 'new-mem',
      content: 'Some content',
      projectId: 'proj-1',
    };

    const results = await checkContradictions(newMemory, false);
    expect(results).toEqual([]);
  });

  test('should work without projectId', async () => {
    const existingMemories = [
      { id: 'existing-1', content: 'no' },
    ];

    dbClientMock = {
      db: {
        prepare: mock(() => ({
          all: mock(() => existingMemories),
        })),
      },
      schema: {},
    };

    const newMemory = {
      id: 'new-mem',
      content: 'yes',
    };

    const results = await checkContradictions(newMemory, false);
    expect(results.length).toBeGreaterThan(0);
  });
});
