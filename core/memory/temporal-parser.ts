/**
 * Temporal Parser
 * Parses temporal expressions and creates time-based relationships between memories
 * Handles absolute dates, relative times, durations, and frequencies
 */

import { createAssociation } from '../../core/associations.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

export type TemporalExpressionType = 'absolute' | 'relative' | 'duration' | 'frequency';

export interface TemporalFact {
  type: TemporalExpressionType;
  value: string;
  parsed: {
    start?: Date;
    end?: Date;
    duration?: number; // in milliseconds
    frequency?: string;
  };
  confidence: number; // 0-1
  context: string;
}

export interface TemporalRelation {
  type: 'before' | 'after' | 'during' | 'overlaps' | 'supersedes' | 'contradicts';
  targetMemoryId: string;
  confidence: number;
}

// Regex patterns for temporal expression detection
const PATTERNS = {
  // ISO dates: 2024-01-05, 2024-01-05T10:30:00Z
  isoDate: /\b(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)?\b/g,

  // Natural dates: January 5, Jan 5, 1/5/2024, 01-05-2024
  naturalDate: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s+\d{4})?\b/gi,

  // Relative times: yesterday, today, tomorrow, last week, next month
  relativeTime: /\b(?:yesterday|today|tomorrow|last\s+(?:week|month|year|day|hour)|next\s+(?:week|month|year|day|hour))\b/gi,

  // Time offsets: 3 days ago, in 2 weeks, 5 minutes ago
  timeOffset: /\b(\d+)\s+(?:days?|weeks?|months?|years?|hours?|minutes?|seconds?)\s+(?:ago|from now|in the past|in the future)\b/gi,

  // Durations: for 2 hours, over 3 weeks, during 5 days
  duration: /\b(?:for|during|over)\s+(\d+)\s+(?:days?|weeks?|months?|years?|hours?|minutes?|seconds?)\b/gi,

  // Frequencies: daily, weekly, monthly, every week, once a month
  frequency: /\b(?:daily|weekly|monthly|yearly|hourly|every\s+(?:day|week|month|year)|once\s+a\s+(?:day|week|month|year))\b/gi,
};

/**
 * Parse temporal expressions from content
 */
export async function parseTemporalFacts(
  content: string,
  referenceDate: Date = new Date()
): Promise<TemporalFact[]> {
  const facts: TemporalFact[] = [];

  // Parse absolute dates (ISO and natural format)
  const isoDates = Array.from(content.matchAll(PATTERNS.isoDate));
  for (const match of isoDates) {
    try {
      const date = new Date(match[0]);
      if (!isNaN(date.getTime())) {
        facts.push({
          type: 'absolute',
          value: match[0],
          parsed: { start: date, end: date },
          confidence: 0.95,
          context: extractContext(content, match.index || 0),
        });
      }
    } catch {
      // Invalid date format
    }
  }

  const naturalDates = Array.from(content.matchAll(PATTERNS.naturalDate));
  for (const match of naturalDates) {
    try {
      const date = parseNaturalDate(match[0], referenceDate);
      if (date) {
        facts.push({
          type: 'absolute',
          value: match[0],
          parsed: { start: date, end: date },
          confidence: 0.85,
          context: extractContext(content, match.index || 0),
        });
      }
    } catch {
      // Invalid date format
    }
  }

  // Parse relative times
  const relativeTimes = Array.from(content.matchAll(PATTERNS.relativeTime));
  for (const match of relativeTimes) {
    const date = parseRelativeTime(match[0], referenceDate);
    if (date) {
      facts.push({
        type: 'relative',
        value: match[0],
        parsed: { start: date, end: date },
        confidence: 0.9,
        context: extractContext(content, match.index || 0),
      });
    }
  }

  // Parse time offsets (3 days ago, in 2 weeks, etc.)
  const timeOffsets = Array.from(content.matchAll(PATTERNS.timeOffset));
  for (const match of timeOffsets) {
    const amount = parseInt(match[1]);
    const unit = match[0].split(/\s+/)[1].toLowerCase();
    const date = calculateDateOffset(referenceDate, amount, unit, match[0]);
    if (date) {
      facts.push({
        type: 'relative',
        value: match[0],
        parsed: { start: date, end: date },
        confidence: 0.85,
        context: extractContext(content, match.index || 0),
      });
    }
  }

  // Parse durations
  const durations = Array.from(content.matchAll(PATTERNS.duration));
  for (const match of durations) {
    const amount = parseInt(match[1]);
    const unit = match[0].split(/\s+/)[2].toLowerCase();
    const durationMs = calculateDurationMs(amount, unit);
    if (durationMs > 0) {
      facts.push({
        type: 'duration',
        value: match[0],
        parsed: { duration: durationMs },
        confidence: 0.8,
        context: extractContext(content, match.index || 0),
      });
    }
  }

  // Parse frequencies
  const frequencies = Array.from(content.matchAll(PATTERNS.frequency));
  for (const match of frequencies) {
    facts.push({
      type: 'frequency',
      value: match[0],
      parsed: { frequency: match[0].toLowerCase() },
      confidence: 0.85,
      context: extractContext(content, match.index || 0),
    });
  }

  return facts;
}

/**
 * Link temporal relations between memories
 */
export async function linkTemporalRelations(
  memoryId: string,
  facts: TemporalFact[]
): Promise<TemporalRelation[]> {
  const relations: TemporalRelation[] = [];

  if (facts.length === 0) return relations;

  try {
    const db = await getDb();
    const schema = await getSchema();

    // Get the target memory
    const targetMemories = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);

    if (targetMemories.length === 0) return relations;
    const targetMemory = targetMemories[0];

    // Find related memories with temporal overlaps
    const allMemories = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.projectId, targetMemory.projectId));

    for (const fact of facts) {
      if (!fact.parsed.start) continue;

      for (const otherMemory of allMemories) {
        if (otherMemory.id === memoryId) continue;

        const relation = analyzeTemporalRelation(
          fact,
          targetMemory,
          otherMemory
        );

        if (relation) {
          relations.push(relation);

          // Create association for temporal relationships
          if (relation.type === 'supersedes') {
            await createAssociation(memoryId, otherMemory.id, 'supersedes', relation.confidence);
          } else if (relation.type === 'contradicts') {
            await createAssociation(memoryId, otherMemory.id, 'contradicts', relation.confidence);
          }
        }
      }
    }

    // Update memory validity dates if we have absolute dates
    const absoluteFacts = facts.filter((f) => f.type === 'absolute');
    if (absoluteFacts.length > 0) {
      const dates = absoluteFacts
        .map((f) => f.parsed.start)
        .filter((d) => d) as Date[];

      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

        await (db as any)
          .update(schema.memories)
          .set({
            validFrom: minDate,
            validTo: maxDate,
            updatedAt: new Date(),
          })
          .where(eq(schema.memories.id, memoryId));
      }
    }

    logger.debug('Temporal relations linked', {
      memoryId,
      factCount: facts.length,
      relationCount: relations.length,
    });
  } catch (error) {
    logger.error('Error linking temporal relations', error);
  }

  return relations;
}

/**
 * Analyze temporal relationship between two memories
 */
function analyzeTemporalRelation(
  fact: TemporalFact,
  targetMemory: any,
  otherMemory: any
): TemporalRelation | null {
  if (!fact.parsed.start || !otherMemory.validFrom) return null;

  const factDate = fact.parsed.start;
  const otherStart = new Date(otherMemory.validFrom);
  const otherEnd = otherMemory.validTo ? new Date(otherMemory.validTo) : otherStart;

  // Determine temporal relationship
  if (factDate < otherStart) {
    return {
      type: 'before',
      targetMemoryId: otherMemory.id,
      confidence: 0.9,
    };
  }

  if (factDate > otherEnd) {
    return {
      type: 'after',
      targetMemoryId: otherMemory.id,
      confidence: 0.9,
    };
  }

  // Check for overlaps or containment
  if (factDate >= otherStart && factDate <= otherEnd) {
    // Check if this memory supersedes or contradicts
    const contentSimilarity = calculateContentSimilarity(
      targetMemory.content,
      otherMemory.content
    );

    if (contentSimilarity > 0.7) {
      // High similarity with different dates suggests supersession or contradiction
      return {
        type: targetMemory.createdAt > otherMemory.createdAt ? 'supersedes' : 'contradicts',
        targetMemoryId: otherMemory.id,
        confidence: contentSimilarity * 0.9,
      };
    }

    return {
      type: 'overlaps',
      targetMemoryId: otherMemory.id,
      confidence: 0.7,
    };
  }

  return null;
}

/**
 * Parse natural date formats (e.g., "January 5", "Jan 5, 2024")
 */
function parseNaturalDate(dateStr: string, referenceDate: Date): Date | null {
  try {
    // Handle "Month Day, Year" or "Month Day"
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      // If year is missing, use reference year
      if (!dateStr.includes(date.getFullYear().toString())) {
        date.setFullYear(referenceDate.getFullYear());
      }
      return date;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Parse relative time expressions
 */
function parseRelativeTime(timeStr: string, referenceDate: Date): Date | null {
  const str = timeStr.toLowerCase();
  const date = new Date(referenceDate);

  if (str === 'yesterday') {
    date.setDate(date.getDate() - 1);
    return date;
  }

  if (str === 'today') {
    return date;
  }

  if (str === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    return date;
  }

  if (str.includes('last week')) {
    date.setDate(date.getDate() - 7);
    return date;
  }

  if (str.includes('next week')) {
    date.setDate(date.getDate() + 7);
    return date;
  }

  if (str.includes('last month')) {
    date.setMonth(date.getMonth() - 1);
    return date;
  }

  if (str.includes('next month')) {
    date.setMonth(date.getMonth() + 1);
    return date;
  }

  if (str.includes('last year')) {
    date.setFullYear(date.getFullYear() - 1);
    return date;
  }

  if (str.includes('next year')) {
    date.setFullYear(date.getFullYear() + 1);
    return date;
  }

  return null;
}

/**
 * Calculate date offset (e.g., "3 days ago")
 */
function calculateDateOffset(
  referenceDate: Date,
  amount: number,
  unit: string,
  fullText: string
): Date | null {
  const date = new Date(referenceDate);
  const isNegative = fullText.includes('ago') || fullText.includes('past');
  const multiplier = isNegative ? -1 : 1;

  const unitLower = unit.replace(/s$/, '').toLowerCase();

  switch (unitLower) {
    case 'day':
      date.setDate(date.getDate() + multiplier * amount);
      break;
    case 'week':
      date.setDate(date.getDate() + multiplier * amount * 7);
      break;
    case 'month':
      date.setMonth(date.getMonth() + multiplier * amount);
      break;
    case 'year':
      date.setFullYear(date.getFullYear() + multiplier * amount);
      break;
    case 'hour':
      date.setHours(date.getHours() + multiplier * amount);
      break;
    case 'minute':
      date.setMinutes(date.getMinutes() + multiplier * amount);
      break;
    default:
      return null;
  }

  return date;
}

/**
 * Calculate duration in milliseconds
 */
function calculateDurationMs(amount: number, unit: string): number {
  const unitLower = unit.replace(/s$/, '').toLowerCase();

  switch (unitLower) {
    case 'day':
      return amount * 24 * 60 * 60 * 1000;
    case 'week':
      return amount * 7 * 24 * 60 * 60 * 1000;
    case 'month':
      return amount * 30 * 24 * 60 * 60 * 1000;
    case 'year':
      return amount * 365 * 24 * 60 * 60 * 1000;
    case 'hour':
      return amount * 60 * 60 * 1000;
    case 'minute':
      return amount * 60 * 1000;
    case 'second':
      return amount * 1000;
    default:
      return 0;
  }
}

/**
 * Extract surrounding context for temporal expression
 */
function extractContext(content: string, index: number, contextLength: number = 50): string {
  const start = Math.max(0, index - contextLength);
  const end = Math.min(content.length, index + contextLength);
  return content.substring(start, end).trim();
}

/**
 * Simple content similarity calculation (token overlap)
 */
function calculateContentSimilarity(content1: string, content2: string): number {
  const tokens1 = new Set(content1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(content2.toLowerCase().split(/\s+/));

  let overlap = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) overlap++;
  }

  const totalUnique = tokens1.size + tokens2.size - overlap;
  return totalUnique > 0 ? overlap / totalUnique : 0;
}
