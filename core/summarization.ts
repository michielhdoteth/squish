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
): Promise<string> {
  const finalConfig = { ...DEFAULT_CONFIG, ...customConfig };

  if (!finalConfig.enabled) {
    return '';
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
      return '';
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

        await (db as any).insert(schema.sessionSummaries).values({
          id: randomUUID(),
          conversationId,
          projectId: conversation[0].projectId,
          summaryType,
          content: summary,
          compressedFrom: messages.length,
          tokensSaved,
          embedding: embedding || null,
          createdAt: new Date(),
        });
      }
    }

    return summary;
  } catch (error) {
    console.error('[squish] Error summarizing session:', error);
    return '';
  }
}

/**
 * Create incremental summary (summary in chunks)
 */
async function createIncrementalSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  const chunks: string[] = [];

  for (let i = 0; i < messages.length; i += config.incrementalThreshold) {
    const chunk = messages.slice(i, i + config.incrementalThreshold);
    chunks.push(summarizeChunk(chunk));
  }

  return chunks.join('\n---\n');
}

/**
 * Create rolling summary (last N messages)
 */
async function createRollingSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  // Take the last N messages (rolling window)
  const window = messages.slice(-config.rollingWindowSize);
  return summarizeChunk(window);
}

/**
 * Create final summary (entire conversation)
 */
async function createFinalSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  // Summarize entire conversation
  return summarizeChunk(messages);
}

/**
 * Generate basic extractive summary of messages
 */
function summarizeChunk(messages: any[]): string {
  if (messages.length === 0) return '';

  // Extract key information from messages
  const userMessages = messages.filter((m: any) => m.role === 'user');
  const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

  // Extract tool calls
  const toolCalls = new Set<string>();
  for (const msg of messages) {
    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        toolCalls.add(tc.name);
      }
    }
  }

  // Build summary
  const parts: string[] = [];

  if (userMessages.length > 0) {
    parts.push(`User prompts: ${userMessages.length}`);
  }

  if (assistantMessages.length > 0) {
    parts.push(`Assistant responses: ${assistantMessages.length}`);
  }

  if (toolCalls.size > 0) {
    parts.push(`Tools used: ${Array.from(toolCalls).join(', ')}`);
  }

  // Extract topics from first and last user messages
  const topics = new Set<string>();
  if (userMessages.length > 0) {
    const firstUser = userMessages[0].content || '';
    const lastUser = userMessages[userMessages.length - 1].content || '';

    // Simple topic extraction (first 10 words)
    const extractTopics = (text: string) => {
      const words = text.split(/\s+/).slice(0, 10);
      return words.join(' ');
    };

    if (firstUser) topics.add(extractTopics(firstUser));
    if (lastUser && lastUser !== firstUser) topics.add(extractTopics(lastUser));
  }

  if (topics.size > 0) {
    parts.push(`Topics: ${Array.from(topics).join('; ')}`);
  }

  const timestamp = messages.length > 0 ? messages[messages.length - 1].createdAt : 'unknown';
  parts.push(`Last activity: ${timestamp}`);

  return parts.join('. ');
}

/**
 * Estimate tokens saved by summarization
 */
function estimateTokensSaved(messages: any[], summary: string): number {
  const originalTokens = messages.reduce(
    (sum: number, m: any) => sum + estimateTokens(m.content || ''),
    0
  );
  const summaryTokens = estimateTokens(summary);
  return Math.max(0, originalTokens - summaryTokens);
}

/**
 * Rough token estimation (1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
  try {
    const db = await getDb();
    const schema = await getSchema();

    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await (db as any)
      .delete(schema.sessionSummaries)
      .where((schema.sessionSummaries.createdAt as any) < threshold);

    return result?.rowCount || 0;
  } catch (error) {
    console.error('[squish] Error pruning old summaries:', error);
    return 0;
  }
}
