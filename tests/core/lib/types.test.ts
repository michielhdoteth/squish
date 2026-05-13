import { describe, it, expect } from 'bun:test';
import { MemoryRecord, MemoryType } from './types.js';

describe('MemoryRecord type', () => {
  it('should allow all required fields', () => {
    const record: MemoryRecord = {
      id: 'test-id',
      type: 'observation',
      content: 'Test content',
      tags: [],
    };
    expect(record.id).toBe('test-id');
    expect(record.type).toBe('observation');
    expect(record.content).toBe('Test content');
  });

  it('should allow optional fields', () => {
    const record: MemoryRecord = {
      id: 'test-id',
      type: 'fact',
      content: 'Test content',
      tags: ['tag1'],
      projectId: 'project-1',
      summary: 'Summary',
      metadata: { key: 'value' },
      createdAt: '2024-01-01T00:00:00Z',
      validFrom: '2024-01-01T00:00:00Z',
      validTo: '2024-12-31T00:00:00Z',
      recordedAt: '2024-01-01T00:00:00Z',
      similarity: 0.95,
      importance: 0.8,
      confidenceLevel: 'certain',
    };
    expect(record.projectId).toBe('project-1');
    expect(record.summary).toBe('Summary');
    expect(record.metadata?.key).toBe('value');
    expect(record.similarity).toBe(0.95);
    expect(record.importance).toBe(0.8);
    expect(record.confidenceLevel).toBe('certain');
  });

  it('should allow nullable optional fields', () => {
    const record: MemoryRecord = {
      id: 'test-id',
      type: 'decision',
      content: 'Test content',
      tags: [],
      projectId: null,
      summary: null,
      metadata: null,
      createdAt: null,
      confidenceLevel: null,
    };
    expect(record.projectId).toBeNull();
    expect(record.summary).toBeNull();
  });
});

describe('MemoryType', () => {
  it('should include all valid memory types', () => {
    const validTypes: MemoryType[] = [
      'observation',
      'fact',
      'decision',
      'context',
      'preference',
      'note',
      'task',
    ];
    expect(validTypes).toHaveLength(7);
  });
});