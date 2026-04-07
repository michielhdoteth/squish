import { describe, it, expect, beforeEach } from 'bun:test';
import { 
  extractAutosaveContent, 
  extractTopics, 
  extractDecisions, 
  extractQuotes, 
  extractCodeChanges,
  type AutosaveHookType 
} from '../../core/autosave.js';

describe('autosave content extraction', () => {
  describe('extractTopics', () => {
    it('extracts simple topic from message', () => {
      const result = extractTopics('Let me help you with the authentication system');
      expect(result.length).toBeGreaterThan(0);
    });

    it('extracts topic from topic marker', () => {
      const result = extractTopics('About PostgreSQL connection settings');
      expect(result.some(t => t.toLowerCase().includes('postgresql'))).toBe(true);
    });
  });

  describe('extractDecisions', () => {
    it('extracts decision with decide pattern', () => {
      const result = extractDecisions('We decided to use PostgreSQL for the database');
      expect(result.length).toBeGreaterThan(0);
    });

    it('extracts decision with going with pattern', () => {
      const result = extractDecisions('Going with Redis for caching');
      expect(result.length).toBeGreaterThan(0);
    });

    it('extracts recommendation', () => {
      const result = extractDecisions('I recommend using the new API endpoint');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('extractQuotes', () => {
    it('extracts double-quoted strings', () => {
      const result = extractQuotes('The error says "connection refused"');
      expect(result).toContain('connection refused');
    });

    it('extracts single-quoted strings', () => {
      const result = extractQuotes('The message was \'database unavailable\'');
      expect(result).toContain('database unavailable');
    });
  });

  describe('extractCodeChanges', () => {
    it('extracts function names', () => {
      const result = extractCodeChanges('function handleAuth() { return true; }');
      expect(result).toContain('handleAuth');
    });

    it('extracts class names', () => {
      const result = extractCodeChanges('class MemoryStore { }');
      expect(result).toContain('MemoryStore');
    });
  });

  describe('extractAutosaveContent', () => {
    it('extracts content based on enabled hooks', () => {
      const hooks: AutosaveHookType[] = ['topics', 'decisions'];
      const result = extractAutosaveContent('We decided to use TypeScript for this project', hooks);
      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.decisions.length).toBeGreaterThan(0);
      expect(result.quotes).toEqual([]);
      expect(result.codeChanges).toEqual([]);
    });

    it('respects hook configuration', () => {
      const hooks: AutosaveHookType[] = ['quotes'];
      const result = extractAutosaveContent('The error says "timeout"', hooks);
      expect(result.quotes.length).toBeGreaterThan(0);
      expect(result.topics).toEqual([]);
    });
  });
});
