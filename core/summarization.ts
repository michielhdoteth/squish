/**
 * Aggressive Session Summarization
 * Implements incremental, rolling, and final summarization
 */

import { eq, and, gte, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
import { cleanupOldSessionSummaries } from './utils/cleanup-operations.js';
import {
  chunkMessages,
  getRollingWindow,
  calculateTokensSaved,
  estimateTokens
} from './utils/summarization-helpers.js';
import { extractMessageContent, generateExtractiveSummary } from './utils/content-extraction.js';

export type SummaryType = 'incremental' | 'rolling' | 'final';

export interface SummarizationConfig {
  incrementalThreshold: number; // Summarize every N messages
  rollingWindowSize: number; // Rolling summary window
  compressionRatio: number; // Target compression ratio
  enabled: boolean;
}

const DEFAULT_CONFIG: SummarizationConfig = {
  incrementalThreshold: config.incrementalThreshold || 10,
  rollingWindowSize: 50,
  compressionRatio: 0.2, // 5:1 compression
  enabled: config.summarizationEnabled !== false,
};

/**
 * Summarize a conversation session
 */
export async function summarizeSession(
  conversationId: string,
  summaryType: SummaryType,
  customConfig: Partial<SummarizationConfig> = {}
): Promise<{ summaryId: string; tokensSaved: number; summary: string }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...customConfig };

  if (!finalConfig.enabled) {
    return { summaryId: '', tokensSaved: 0, summary: '' };
  }

  try {
    const db = await getDb();
    const schema = await getSchema();

    // Fetch messages for this conversation
    const messages = await (db as any)
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);

    if (messages.length === 0) {
      return { summaryId: '', tokensSaved: 0, summary: '' };
    }

    let summary = '';

    switch (summaryType) {
      case 'incremental':
        summary = await createIncrementalSummary(messages, finalConfig);
        break;
      case 'rolling':
        summary = await createRollingSummary(messages, finalConfig);
        break;
      case 'final':
        summary = await createFinalSummary(messages, finalConfig);
        break;
    }

    if (summary) {
      // Store summary with embedding
      const embedding = await getEmbedding(summary);
      const conversation = await (db as any)
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .limit(1);

      if (conversation.length > 0) {
        const tokensSaved = estimateTokensSaved(messages, summary);
        const summaryId = randomUUID();

        await (db as any).insert(schema.sessionSummaries).values({
          id: summaryId,
          conversationId,
          projectId: conversation[0].projectId,
          summaryType,
          content: summary,
          compressedFrom: messages.length,
          tokensSaved,
          embedding: embedding || null,
          createdAt: new Date(),
        });

        return { summaryId, tokensSaved, summary };
      }
    }

    return { summaryId: '', tokensSaved: 0, summary };
  } catch (error) {
    console.error('[squish] Error summarizing session:', error);
    return { summaryId: '', tokensSaved: 0, summary: '' };
  }
}

/**
 * Create incremental summary (summary in chunks)
 */
async function createIncrementalSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  const chunks = chunkMessages(messages, config.incrementalThreshold);
  const summaries = chunks.map(chunk => generateExtractiveSummary(extractMessageContent(chunk)));
  return summaries.join('\n---\n');
}

/**
 * Create rolling summary (last N messages)
 */
async function createRollingSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  const window = getRollingWindow(messages, config.rollingWindowSize);
  return generateExtractiveSummary(extractMessageContent(window));
}

/**
 * Create final summary (entire conversation)
 */
async function createFinalSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  return generateExtractiveSummary(extractMessageContent(messages));
}

/**
 * Generate basic extractive summary of messages
 */
function summarizeChunk(messages: any[]): string {
  if (messages.length === 0) return '';
  return generateExtractiveSummary(extractMessageContent(messages));
}

/**
 * Estimate tokens saved by summarization
 */
function estimateTokensSaved(messages: any[], summary: string): number {
  return calculateTokensSaved(messages, summary);
}

/**
 * Get recent summaries for a conversation
 */
export async function getRecentSummaries(
  conversationId: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    return await (db as any)
      .select()
      .from(schema.sessionSummaries)
      .where(eq(schema.sessionSummaries.conversationId, conversationId))
      .orderBy(desc(schema.sessionSummaries.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('[squish] Error getting recent summaries:', error);
    return [];
  }
}

/**
 * Get summarization statistics
 */
export async function getSummarizationStats(projectId?: string): Promise<{
  totalSummaries: number;
  byType: Record<string, number>;
  totalTokensSaved: number;
  avgCompressionRatio: number;
}> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = projectId ? eq(schema.sessionSummaries.projectId, projectId) : undefined;

    const summaries = await (db as any).select().from(schema.sessionSummaries).where(where);

    const stats = {
      totalSummaries: summaries.length,
      byType: {
        incremental: 0,
        rolling: 0,
        final: 0,
      } as Record<string, number>,
      totalTokensSaved: 0,
      avgCompressionRatio: 0,
    };

    for (const s of summaries) {
      stats.byType[s.summaryType] = (stats.byType[s.summaryType] || 0) + 1;
      stats.totalTokensSaved += s.tokensSaved || 0;
    }

    // Calculate average compression ratio
    let totalRatio = 0;
    for (const s of summaries) {
      if (s.compressedFrom && s.compressedFrom > 0) {
        totalRatio += s.tokensSaved / (s.compressedFrom * 100); // Rough estimate
      }
    }

    stats.avgCompressionRatio = summaries.length > 0 ? totalRatio / summaries.length : 0;

    return stats;
  } catch (error) {
    console.error('[squish] Error getting summarization stats:', error);
    return {
      totalSummaries: 0,
      byType: {},
      totalTokensSaved: 0,
      avgCompressionRatio: 0,
    };
  }
}

/**
 * Delete old summaries to save space
 */
export async function pruneOldSummaries(olderThanDays: number = 30): Promise<number> {
  return cleanupOldSessionSummaries(olderThanDays);
}
