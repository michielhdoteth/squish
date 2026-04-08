/**
 * Write Gate Enforcement
 * Validates memories before writing to ensure quality, security, and consistency
 * Integrates secret detection, trigger detection, and content validation
 */

import { detectSecrets, redactSecrets, SecretMatch } from '../security/secret-detector.js';
import { detectMemorySignals, MemorySignals } from './trigger-detector.js';
import { resolveContradictions } from './contradiction-resolver.js';
import { supersedeOldTemporalFacts } from './temporal-facts.js';
import { logger } from '../logger.js';

export interface WriteGateResult {
  allowed: boolean;
  sanitized: boolean;
  warnings: string[];
  errors: string[];
  metadata: {
    secretsDetected: number;
    signals: MemorySignals | null;
    contradictions: {
      found: boolean;
      count: number;
    };
    temporalSupersession: {
      count: number;
    };
  };
  sanitizedContent?: string;
}

export interface WriteGateOptions {
  allowSecrets?: boolean; // If true, redact but allow write
  minContentLength?: number;
  maxContentLength?: number;
  projectId?: string;
  skipContradictionCheck?: boolean;
  skipTemporalSupersession?: boolean;
}

const DEFAULT_OPTIONS: WriteGateOptions = {
  allowSecrets: false,
  minContentLength: 5,
  maxContentLength: 50000,
  skipContradictionCheck: false,
  skipTemporalSupersession: false,
};

/**
 * Main write gate function - validates and sanitizes content before write
 */
export async function enforceWriteGate(
  content: string,
  type: string,
  options: WriteGateOptions = {}
): Promise<WriteGateResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: WriteGateResult = {
    allowed: true,
    sanitized: false,
    warnings: [],
    errors: [],
    metadata: {
      secretsDetected: 0,
      signals: null,
      contradictions: { found: false, count: 0 },
      temporalSupersession: { count: 0 },
    },
  };

  let processedContent = content;

  // 1. Content length validation
  if (content.length < opts.minContentLength!) {
    result.errors.push(`Content too short (min ${opts.minContentLength} characters)`);
    result.allowed = false;
    return result;
  }

  if (content.length > opts.maxContentLength!) {
    result.errors.push(`Content too long (max ${opts.maxContentLength} characters)`);
    result.allowed = false;
    return result;
  }

  // 2. Secret detection
  const secrets = detectSecrets(content, 'high');
  result.metadata.secretsDetected = secrets.length;

  if (secrets.length > 0) {
    const secretTypes = [...new Set(secrets.map(s => s.type))];
    
    if (!opts.allowSecrets) {
      result.errors.push(`Potential secrets detected: ${secretTypes.join(', ')}`);
      result.warnings.push('Content contains sensitive data that must be redacted');
      result.allowed = false;
      return result;
    } else {
      // Redact secrets but allow write
      processedContent = redactSecrets(content);
      result.sanitized = true;
      result.sanitizedContent = processedContent;
      result.warnings.push(`Redacted ${secrets.length} potential secrets: ${secretTypes.join(', ')}`);
    }
  }

  // 3. Memory signals detection
  const signals = detectMemorySignals(content);
  result.metadata.signals = signals;

  // Add warnings for high-priority signals
  if (signals.priority === 'high') {
    result.warnings.push('High-priority memory signal detected');
  }

  if (signals.implicit.correction) {
    result.warnings.push('Content appears to be a correction - contradiction check recommended');
  }

  // 4. Contradiction detection (async, non-blocking for write)
  if (!opts.skipContradictionCheck && signals.implicit.correction) {
    try {
      const contradictionResult = await resolveContradictions(
        processedContent,
        type,
        opts.projectId
      );
      
      result.metadata.contradictions = {
        found: contradictionResult.supersededIds.length > 0,
        count: contradictionResult.supersededIds.length,
      };
      
      if (contradictionResult.supersededIds.length > 0) {
        result.warnings.push(
          `This memory supersedes ${contradictionResult.supersededIds.length} older memories`
        );
      }
    } catch (error) {
      logger.error('Contradiction check failed', error);
      result.warnings.push('Contradiction check failed - proceeding with write');
    }
  }

  // 5. Temporal fact handling
  if (!opts.skipTemporalSupersession) {
    try {
      // This would be done after the memory is actually written, but we note it here
      result.metadata.temporalSupersession = { count: 0 };
    } catch (error) {
      logger.error('Temporal check failed', error);
    }
  }

  // 6. Content quality checks
  const qualityIssues = checkContentQuality(processedContent);
  result.warnings.push(...qualityIssues);

  return result;
}

/**
 * Quick validation without async operations
 * Use for fast pre-check before full validation
 */
export function quickValidate(content: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for empty or whitespace-only content
  if (!content || content.trim().length === 0) {
    errors.push('Content is empty');
    return { valid: false, errors };
  }

  // Check for minimum length
  if (content.trim().length < 5) {
    errors.push('Content is too short');
  }

  // Check for obvious secrets (high confidence only)
  const secrets = detectSecrets(content, 'high');
  if (secrets.length > 0) {
    errors.push(`Content contains ${secrets.length} potential secrets`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check content quality and return warnings
 */
function checkContentQuality(content: string): string[] {
  const warnings: string[] = [];

  // Check for excessive repetition
  const words = content.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  
  for (const word of words) {
    if (word.length > 3) { // Only check meaningful words
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  for (const [word, count] of wordCounts.entries()) {
    if (count > 10) {
      warnings.push(`Excessive repetition detected: "${word}" appears ${count} times`);
      break; // Only report one
    }
  }

  // Check for very long lines (might be code or minified content)
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.length > 1000) {
      warnings.push('Content contains very long lines - may not be human-readable');
      break;
    }
  }

  // Check for binary-like content
  const binaryPattern = /[\x00-\x08\x0E-\x1F]/;
  if (binaryPattern.test(content)) {
    warnings.push('Content may contain binary data');
  }

  return warnings;
}

/**
 * Sanitize content for storage
 * Redacts secrets and normalizes whitespace
 */
export function sanitizeForStorage(content: string): string {
  // Redact secrets
  let sanitized = redactSecrets(content);
  
  // Normalize excessive whitespace
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.replace(/ {2,}/g, ' ');
  
  // Trim
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Calculate a quality score for content (0-100)
 */
export function calculateContentQualityScore(content: string): number {
  let score = 100;

  // Deduct for short content
  if (content.length < 20) {
    score -= 30;
  } else if (content.length < 50) {
    score -= 15;
  }

  // Deduct for secrets
  const secrets = detectSecrets(content, 'high');
  score -= secrets.length * 20;

  // Deduct for repetition
  const words = content.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words.filter(w => w.length > 3));
  const repetitionRatio = uniqueWords.size / Math.max(1, words.length);
  if (repetitionRatio < 0.3) {
    score -= 20;
  }

  // Bonus for structure (sentences, punctuation)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 1) {
    score += 10;
  }

  // Bonus for reasonable length
  if (content.length >= 50 && content.length <= 2000) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}
