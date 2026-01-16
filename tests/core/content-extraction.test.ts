/**
 * Unit tests for content extraction utilities
 * Tests message content analysis functions
 */

import { describe, it, expect } from 'vitest';
import {
  extractMessageContent,
  generateExtractiveSummary
} from '../../core/utils/content-extraction.js';

describe('Content Extraction', () => {
  describe('extractMessageContent', () => {
    it('should extract user and assistant messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const result = extractMessageContent(messages);

      expect(result.userMessages.length).toBe(2);
      expect(result.assistantMessages.length).toBe(1);
    });

    it('should extract tool calls from messages', () => {
      const messages = [
        {
          role: 'assistant',
          content: 'Let me search for that',
          toolCalls: [
            { name: 'search', arguments: {} },
            { name: 'database_query', arguments: {} },
          ],
        },
      ];

      const result = extractMessageContent(messages);

      expect(result.toolCalls.has('search')).toBe(true);
      expect(result.toolCalls.has('database_query')).toBe(true);
    });

    it('should extract topics from first and last user messages', () => {
      const messages = [
        {
          role: 'user',
          content: 'How do I configure PostgreSQL connection settings',
        },
        { role: 'assistant', content: 'You can set DATABASE_URL...' },
        {
          role: 'user',
          content: 'What about connection pooling options',
        },
      ];

      const result = extractMessageContent(messages);

      expect(result.topics.size).toBe(2);
      expect(result.topics.has('How do I configure PostgreSQL connection settings')).toBe(true);
      expect(result.topics.has('What about connection pooling options')).toBe(true);
    });

    it('should handle empty messages array', () => {
      const result = extractMessageContent([]);

      expect(result.userMessages.length).toBe(0);
      expect(result.assistantMessages.length).toBe(0);
      expect(result.toolCalls.size).toBe(0);
      expect(result.topics.size).toBe(0);
    });

    it('should extract timestamp from last message', () => {
      const timestamp = new Date('2024-01-15T10:30:00Z').toISOString();
      const messages = [
        { role: 'user', content: 'Test', createdAt: timestamp },
      ];

      const result = extractMessageContent(messages);

      expect(result.timestamp).toBe(timestamp);
    });
  });

  describe('generateExtractiveSummary', () => {
    it('should generate summary with counts', () => {
      const extracted = {
        userMessages: [
          { role: 'user', content: 'First message' },
          { role: 'user', content: 'Second message' },
        ] as any[],
        assistantMessages: [
          { role: 'assistant', content: 'Response 1' },
        ] as any[],
        toolCalls: new Set(['search', 'read_file']),
        topics: new Set(['topic1', 'topic2']),
        timestamp: new Date().toISOString(),
      };

      const summary = generateExtractiveSummary(extracted);

      expect(summary).toContain('User prompts: 2');
      expect(summary).toContain('Assistant responses: 1');
      expect(summary).toContain('Tools used: search, read_file');
      expect(summary).toContain('Topics: topic1; topic2');
    });

    it('should handle minimal extracted content', () => {
      const extracted = {
        userMessages: [],
        assistantMessages: [],
        toolCalls: new Set<string>(),
        topics: new Set<string>(),
        timestamp: new Date().toISOString(),
      };

      const summary = generateExtractiveSummary(extracted);

      expect(summary).toContain('Last activity:');
    });

    it('should handle mixed content with various tool calls', () => {
      const extracted = {
        userMessages: [{ role: 'user', content: 'Test' }] as any[],
        assistantMessages: [],
        toolCalls: new Set(['bash', 'read_file', 'grep', 'edit']),
        topics: new Set(['Test topic']),
        timestamp: new Date().toISOString(),
      };

      const summary = generateExtractiveSummary(extracted);

      expect(summary).toContain('Tools used: bash, read_file, grep, edit');
    });
  });
});