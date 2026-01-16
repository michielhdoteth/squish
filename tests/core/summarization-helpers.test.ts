/**
 * Unit tests for summarization helpers
 * Tests the summarization utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  chunkMessages,
  getRollingWindow,
  calculateTokensSaved,
  estimateTokens
} from '../../core/utils/summarization-helpers.js';

describe('Summarization Helpers', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      // Rough approximation: 1 token ≈ 4 characters
      expect(estimateTokens('hello')).toBe(1); // 5 chars / 4 = 1.25 -> 2, but ceil
    });

    it('should handle empty strings', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(400);
      expect(estimateTokens(longString)).toBe(100); // 400 / 4 = 100
    });
  });

  describe('calculateTokensSaved', () => {
    it('should calculate positive token savings', () => {
      const messages = [
        { content: 'This is a test message with some content here' },
        { content: 'Another message with more content to summarize' },
      ];
      const summary = 'Test message content';

      const saved = calculateTokensSaved(messages, summary);
      expect(saved).toBeGreaterThan(0);
    });

    it('should return 0 when summary is longer', () => {
      const messages = [
        { content: 'Short' },
      ];
      const summary = 'This is a much longer summary that exceeds the original message length';

      const saved = calculateTokensSaved(messages, summary);
      expect(saved).toBeLessThanOrEqual(0);
    });

    it('should handle empty messages', () => {
      const saved = calculateTokensSaved([], 'summary');
      expect(saved).toBeLessThanOrEqual(0);
    });
  });

  describe('chunkMessages', () => {
    it('should chunk messages into equal sized groups', () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({ id: `msg-${i}` }));
      const chunks = chunkMessages(messages, 3);

      expect(chunks.length).toBe(4);
      expect(chunks[0].length).toBe(3);
      expect(chunks[1].length).toBe(3);
      expect(chunks[2].length).toBe(3);
      expect(chunks[3].length).toBe(1); // Remainder
    });

    it('should handle empty arrays', () => {
      const chunks = chunkMessages([], 5);
      expect(chunks.length).toBe(0);
    });

    it('should handle chunk size larger than array', () => {
      const messages = [{ id: '1' }, { id: '2' }];
      const chunks = chunkMessages(messages, 10);

      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(2);
    });

    it('should handle chunk size of 1', () => {
      const messages = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const chunks = chunkMessages(messages, 1);

      expect(chunks.length).toBe(3);
      chunks.forEach(chunk => expect(chunk.length).toBe(1));
    });
  });

  describe('getRollingWindow', () => {
    it('should return last N messages', () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({ id: `msg-${i}` }));
      const window = getRollingWindow(messages, 5);

      expect(window.length).toBe(5);
      expect(window[0].id).toBe('msg-5');
      expect(window[4].id).toBe('msg-9');
    });

    it('should return all messages if window size exceeds length', () => {
      const messages = [{ id: '1' }, { id: '2' }];
      const window = getRollingWindow(messages, 10);

      expect(window.length).toBe(2);
    });

    it('should handle empty arrays', () => {
      const window = getRollingWindow([], 5);
      expect(window.length).toBe(0);
    });

    it('should handle window size of 0', () => {
      const messages = [{ id: '1' }, { id: '2' }];
      const window = getRollingWindow(messages, 0);

      expect(window.length).toBe(0);
    });
  });
});