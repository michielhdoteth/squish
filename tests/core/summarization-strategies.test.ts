/**
 * Unit tests for summarization strategies
 * Tests different summarization algorithms
 */

import { describe, it, expect } from 'vitest';
import {
  createIncrementalSummary,
  createRollingSummary,
  createFinalSummary,
  SummarizationConfig
} from '../../core/summarization/strategies.js';

describe('Summarization Strategies', () => {
  describe('createIncrementalSummary', () => {
    it('should create summaries for each chunk', async () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i} with some content here`,
        createdAt: new Date(),
      }));

      const config: SummarizationConfig = {
        incrementalThreshold: 5,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createIncrementalSummary(messages, config);

      // Should have 3 chunks (15 / 5 = 3)
      expect(summary).toContain('---');
      const chunks = summary.split('---');
      expect(chunks.length).toBe(3);
    });

    it('should handle empty messages', async () => {
      const config: SummarizationConfig = {
        incrementalThreshold: 5,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createIncrementalSummary([], config);

      expect(summary).toBe('');
    });

    it('should handle messages fewer than threshold', async () => {
      const messages = [
        { role: 'user', content: 'Single message', createdAt: new Date() },
      ];

      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createIncrementalSummary(messages, config);

      expect(summary).toContain('User prompts: 1');
    });
  });

  describe('createRollingSummary', () => {
    it('should only include last N messages', async () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000),
      }));

      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 5,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createRollingSummary(messages, config);

      // Should only contain last 5 messages
      expect(summary).toContain('Message 15');
      expect(summary).toContain('Message 19');
      expect(summary).not.toContain('Message 0');
    });

    it('should handle messages fewer than window size', async () => {
      const messages = [
        { role: 'user', content: 'Message 1', createdAt: new Date() },
        { role: 'user', content: 'Message 2', createdAt: new Date() },
      ];

      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createRollingSummary(messages, config);

      expect(summary).toContain('Message 1');
      expect(summary).toContain('Message 2');
    });

    it('should handle empty messages', async () => {
      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createRollingSummary([], config);

      expect(summary).toBe('');
    });
  });

  describe('createFinalSummary', () => {
    it('should summarize entire conversation', async () => {
      const messages = [
        { role: 'user', content: 'I need help with TypeScript', createdAt: new Date() },
        { role: 'assistant', content: 'Sure, what specific help do you need?', createdAt: new Date() },
        { role: 'user', content: 'How do I use generics', createdAt: new Date() },
        { role: 'assistant', content: 'Generics allow you to write reusable code', createdAt: new Date() },
      ];

      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createFinalSummary(messages, config);

      expect(summary).toContain('User prompts: 2');
      expect(summary).toContain('Assistant responses: 2');
    });

    it('should handle empty messages', async () => {
      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createFinalSummary([], config);

      expect(summary).toBe('');
    });

    it('should extract tool calls from conversation', async () => {
      const messages = [
        {
          role: 'assistant',
          content: 'Let me search for that',
          toolCalls: [{ name: 'search', arguments: {} }],
          createdAt: new Date(),
        },
        {
          role: 'user',
          content: 'What did you find?',
          createdAt: new Date(),
        },
      ];

      const config: SummarizationConfig = {
        incrementalThreshold: 10,
        rollingWindowSize: 50,
        compressionRatio: 0.2,
        enabled: true,
      };

      const summary = await createFinalSummary(messages, config);

      expect(summary).toContain('Tools used: search');
    });
  });
});