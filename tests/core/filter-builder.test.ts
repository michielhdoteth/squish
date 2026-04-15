/**
 * Unit tests for filter builder utilities
 * Tests memory criteria filter construction
 */

import { describe, it, expect } from 'vitest';
import { buildMemoryFilters, buildMemoryFiltersPartial } from '../../core/utils/filter-builder.js';

describe('Filter Builder', () => {
  describe('buildMemoryFilters', () => {
    it('should build filters for type criteria', () => {
      const schema = {
        memories: {
          type: { type: 'text' },
        },
      } as any;

      const filters = buildMemoryFilters({ type: 'fact' }, schema);

      expect(filters.length).toBe(1);
    });

    it('should build filters for sector criteria', () => {
      const schema = {
        memories: {
          sector: { type: 'text' },
        },
      } as any;

      const filters = buildMemoryFilters({ sector: 'semantic' }, schema);

      expect(filters.length).toBe(1);
    });

    it('should build filters for confidence criteria', () => {
      const schema = {
        memories: {
          confidence: { type: 'integer' },
          relevanceScore: { type: 'integer' },
        },
      } as any;

      const filters = buildMemoryFilters({ minConfidence: 80 }, schema);

      expect(filters.length).toBe(1);
    });

    it('should build filters for relevance criteria', () => {
      const schema = {
        memories: {
          confidence: { type: 'integer' },
          relevanceScore: { type: 'integer' },
        },
      } as any;

      const filters = buildMemoryFilters({ minRelevance: 0.5 }, schema);

      expect(filters.length).toBe(1);
    });

    it('should build filters for projectId criteria', () => {
      const schema = {
        memories: {
          projectId: { type: 'uuid' },
        },
      } as any;

      const filters = buildMemoryFilters({ projectId: 'proj-123' }, schema);

      expect(filters.length).toBe(1);
    });

    it('should build filters for agentId criteria', () => {
      const schema = {
        memories: {
          agentId: { type: 'uuid' },
        },
      } as any;

      const filters = buildMemoryFilters({ agentId: 'agent-456' }, schema);

      expect(filters.length).toBe(1);
    });

    it('should combine multiple criteria', () => {
      const schema = {
        memories: {
          type: { type: 'text' },
          sector: { type: 'text' },
          confidence: { type: 'integer' },
          projectId: { type: 'uuid' },
        },
      } as any;

      const filters = buildMemoryFilters({
        type: 'fact',
        sector: 'semantic',
        minConfidence: 70,
        projectId: 'proj-123',
      }, schema);

      expect(filters.length).toBe(4);
    });

    it('should return empty array for no criteria', () => {
      const schema = {
        memories: {},
      } as any;

      const filters = buildMemoryFilters({}, schema);

      expect(filters.length).toBe(0);
    });
  });

  describe('buildMemoryFiltersPartial', () => {
    it('should build filters for type criteria only', () => {
      const schema = {
        memories: {
          type: { type: 'text' },
        },
      } as any;

      const filters = buildMemoryFiltersPartial({ type: 'fact' }, schema);

      expect(filters.length).toBe(1);
    });

    it('should ignore non-type criteria', () => {
      const schema = {
        memories: {
          type: { type: 'text' },
          sector: { type: 'text' },
          confidence: { type: 'integer' },
        },
      } as any;

      const filters = buildMemoryFiltersPartial({
        type: 'fact',
        sector: 'semantic',
        minConfidence: 80,
      }, schema);

      expect(filters.length).toBe(1);
    });

    it('should return empty array for no type criteria', () => {
      const schema = {
        memories: {},
      } as any;

      const filters = buildMemoryFiltersPartial({ sector: 'semantic' }, schema);

      expect(filters.length).toBe(0);
    });
  });
});