import { describe, expect, it } from 'bun:test';
import {
  enforceWriteGate,
  quickValidate,
  sanitizeForStorage,
  calculateContentQualityScore,
} from '../../core/memory/write-gate.js';

describe('write-gate', () => {
  describe('quickValidate', () => {
    it('rejects empty content', () => {
      const result = quickValidate('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects whitespace-only content', () => {
      const result = quickValidate('   \n\t  ');
      expect(result.valid).toBe(false);
    });

    it('rejects content that is too short', () => {
      const result = quickValidate('hi');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('short'))).toBe(true);
    });

    it('accepts valid content', () => {
      const result = quickValidate('This is a valid memory content for testing.');
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('detects AWS access keys', () => {
      const result = quickValidate('Use this key: AKIAIOSFODNN7EXAMPLE');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('secrets'))).toBe(true);
    });

    it('detects GitHub tokens', () => {
      const result = quickValidate('Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.valid).toBe(false);
    });
  });

  describe('enforceWriteGate', () => {
    it('allows valid content', async () => {
      const result = await enforceWriteGate(
        'This is a valid memory content.',
        'observation'
      );
      
      expect(result.allowed).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('rejects content that is too short', async () => {
      const result = await enforceWriteGate('hi', 'observation', {
        minContentLength: 5,
      });
      
      expect(result.allowed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects content that is too long', async () => {
      const longContent = 'x'.repeat(1001);
      const result = await enforceWriteGate(longContent, 'observation', {
        maxContentLength: 1000,
      });
      
      expect(result.allowed).toBe(false);
      expect(result.errors.some(e => e.includes('long'))).toBe(true);
    });

    it('detects secrets and rejects by default', async () => {
      const result = await enforceWriteGate(
        'Use API key AKIAIOSFODNN7EXAMPLE for AWS',
        'fact'
      );
      
      expect(result.allowed).toBe(false);
      expect(result.metadata.secretsDetected).toBeGreaterThan(0);
    });

    it('sanitizes secrets when allowed', async () => {
      const result = await enforceWriteGate(
        'Use API key AKIAIOSFODNN7EXAMPLE for AWS',
        'fact',
        { allowSecrets: true }
      );
      
      expect(result.allowed).toBe(true);
      expect(result.sanitized).toBe(true);
      expect(result.sanitizedContent).toContain('[REDACTED]');
    });

    it('detects memory signals', async () => {
      const result = await enforceWriteGate(
        'Remember to always use TypeScript',
        'preference'
      );
      
      expect(result.metadata.signals).not.toBeNull();
      expect(result.metadata.signals?.explicitTriggers.length).toBeGreaterThan(0);
    });

    it('warns on high-priority signals', async () => {
      const result = await enforceWriteGate(
        'Important: the database password has changed',
        'fact'
      );
      
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('sanitizeForStorage', () => {
    it('redacts secrets', () => {
      const sanitized = sanitizeForStorage(
        'Use API key AKIAIOSFODNN7EXAMPLE for AWS'
      );
      
      expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('normalizes whitespace', () => {
      const sanitized = sanitizeForStorage('hello   world\n\n\n\ntest');
      
      expect(sanitized).not.toContain('   ');
      expect(sanitized).not.toContain('\n\n\n');
    });

    it('trims content', () => {
      const sanitized = sanitizeForStorage('  hello world  ');
      expect(sanitized).toBe('hello world');
    });
  });

  describe('calculateContentQualityScore', () => {
    it('penalizes short content', () => {
      const score = calculateContentQualityScore('hi');
      expect(score).toBeLessThan(80);
    });

    it('penalizes secrets', () => {
      const score = calculateContentQualityScore(
        'Use API key AKIAIOSFODNN7EXAMPLE for AWS'
      );
      expect(score).toBeLessThan(80);
    });

    it('rewards structure', () => {
      const score = calculateContentQualityScore(
        'This is a well-structured sentence. And another one follows!'
      );
      expect(score).toBeGreaterThan(70);
    });

    it('returns score between 0 and 100', () => {
      const score1 = calculateContentQualityScore('');
      const score2 = calculateContentQualityScore('x'.repeat(10000));
      
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score1).toBeLessThanOrEqual(100);
      expect(score2).toBeGreaterThanOrEqual(0);
      expect(score2).toBeLessThanOrEqual(100);
    });
  });
});
