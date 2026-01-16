/**
 * Unit tests for snapshot comparison utilities
 * Tests diff calculation and comparison logic
 */

import { describe, it, expect } from 'vitest';
import { calculateDiff, MemoryDiff } from '../../core/snapshots/comparison.js';

describe('Snapshot Comparison', () => {
  describe('calculateDiff', () => {
    it('should identify added lines', () => {
      const before = 'Line 1\nLine 2\nLine 3';
      const after = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';

      const diff = calculateDiff(before, after);

      expect(diff.added).toContain('Line 4');
      expect(diff.added).toContain('Line 5');
    });

    it('should identify removed lines', () => {
      const before = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const after = 'Line 1\nLine 2';

      const diff = calculateDiff(before, after);

      expect(diff.removed).toContain('Line 3');
      expect(diff.removed).toContain('Line 4');
      expect(diff.removed).toContain('Line 5');
    });

    it('should identify both added and removed lines', () => {
      const before = 'A\nB\nC';
      const after = 'A\nD\nC';

      const diff = calculateDiff(before, after);

      expect(diff.added).toContain('D');
      expect(diff.removed).toContain('B');
    });

    it('should handle identical content', () => {
      const before = 'Same content\nAnother line';
      const after = 'Same content\nAnother line';

      const diff = calculateDiff(before, after);

      expect(diff.added).toBeUndefined();
      expect(diff.removed).toBeUndefined();
    });

    it('should handle empty before (all added)', () => {
      const before = '';
      const after = 'Line 1\nLine 2\nLine 3';

      const diff = calculateDiff(before, after);

      expect(diff.added).toHaveLength(3);
      expect(diff.removed).toBeUndefined();
    });

    it('should handle empty after (all removed)', () => {
      const before = 'Line 1\nLine 2\nLine 3';
      const after = '';

      const diff = calculateDiff(before, after);

      expect(diff.removed).toHaveLength(3);
      expect(diff.added).toBeUndefined();
    });

    it('should handle whitespace differences', () => {
      const before = 'No extra spaces';
      const after = 'No extra spaces  ';

      const diff = calculateDiff(before, after);

      // Lines are different due to trailing whitespace
      expect(diff.added).toBeDefined();
    });

    it('should handle line order changes', () => {
      const before = 'A\nB\nC';
      const after = 'C\nB\nA';

      const diff = calculateDiff(before, after);

      // All lines removed, all lines added (simple diff)
      expect(diff.added).toHaveLength(3);
      expect(diff.removed).toHaveLength(3);
    });

    it('should handle large text diffs', () => {
      const before = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');
      const after = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');

      const diff = calculateDiff(before, after);

      expect(diff.added).toBeUndefined();
      expect(diff.removed).toBeUndefined();
    });
  });
});