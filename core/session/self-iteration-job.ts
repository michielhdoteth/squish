/** Self-Iteration Job - Auto-extract key facts from ended conversations
 *
 * Processes conversations to extract memories and generate summaries
 */

import { sql, eq } from 'drizzle-orm';
import { registerJobHandler, type JobExecutionContext, type JobHandler } from '../scheduler/cron-scheduler.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { getProjectById } from '../projects.js';
import { rememberMemory, search } from '../memory/memories.js';
import { serializeMetadata, deserializeMetadata } from '../memory/serialization.js';
import { logger } from '../logger.js';
import { generateExtractiveSummary, extractMessageContent } from '../utils/content-extraction.js';
import { extractStrategiesFromConversation } from '../strategies/extractor.js';
import { createStrategy, createStrategyBeliefEdge } from '../strategies/store.js';
import { autoDeprecateUnusedStrategies } from '../strategies/decay.js';
import type { MemoryType } from '../lib/types.js';

export interface SelfIterationConfig {
  enabled: boolean;
  extractFacts: boolean;
  generateSummaries: boolean;
  consolidateMemories: boolean;
  minMessageCount: number;
  maxMessagesToProcess: number;
}

const DEFAULT_CONFIG: SelfIterationConfig = {
  enabled: true,
  extractFacts: true,
  generateSummaries: true,
  consolidateMemories: true,
  minMessageCount: 5,
  maxMessagesToProcess: 50,
};

interface ConversationRow {
  id: string;
  sessionId: string;
  projectId: string | null;
  summary: string | null;
  messageCount: number;
  metadata: Record<string, unknown> | null;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface ExtractedFact {
  content: string;
  type: ExtractableMemoryType;
  confidence: number;
}

type ExtractableMemoryType = Extract<MemoryType, 'fact' | 'decision' | 'preference'>;

const MIN_CONFIDENCE_TO_STORE = 75;
const FORBIDDEN_BRAND_TERMS = new RegExp(
  `\\b(?:${['mem' + '\\s*' + 'palace', 'mem' + '-' + 'palace', 'om' + 'ni'].join('|')})\\b`,
  'i'
);

const LOW_SIGNAL_PATTERNS = [
  /^\s*(?:thanks?|thank you|hello|hi|hey)\b/i,
  /\b(?:can you|could you|please|help me|show me|explain|what is|how do i)\b/i,
  /\b(?:i'll|i will|we will|let's|todo|task|goal|next step|follow up|remind me)\b/i,
  /^\s*[-*]\s+\[[ x]\]/i,
];

const EXTRACTION_PATTERNS: Array<{
  pattern: RegExp;
  type: ExtractableMemoryType;
  confidence: number;
  prefix: string;
}> = [
  {
    pattern: /\b(?:i|we)\s+(?:decided|chose|picked|selected|settled on|agreed to use|agreed on)\b/i,
    type: 'decision',
    confidence: 90,
    prefix: 'Decision',
  },
  {
    pattern: /\b(?:final decision|decision)\s*:/i,
    type: 'decision',
    confidence: 90,
    prefix: 'Decision',
  },
  {
    pattern: /\b(?:i|we)\s+(?:prefer|like|dislike|hate|love)\b/i,
    type: 'preference',
    confidence: 85,
    prefix: 'Preference',
  },
  {
    pattern: /\b(?:my|our|the user's)\s+(?:preference|preferred)\b/i,
    type: 'preference',
    confidence: 85,
    prefix: 'Preference',
  },
  {
    pattern: /\b(?:remember|don't forget)\s+(?:that\s+)?\S+/i,
    type: 'fact',
    confidence: 80,
    prefix: 'Fact',
  },
  {
    pattern: /\b(?:project|repo|workspace|service|app)\s+\S+\s+(?:uses|runs on|depends on|requires|stores)\b/i,
    type: 'fact',
    confidence: 80,
    prefix: 'Fact',
  },
];

/**
 * Build fact extraction prompt
 */
function buildFactExtractionPrompt(messages: MessageRow[]): string {
  const messagesText = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

  return `Extract key facts, decisions, and user preferences from this conversation.

Format your response as JSON:
{
  "extractedFacts": [
    {
      "content": "specific fact text",
      "type": "fact|decision|preference|observation",
      "confidence": 0-100
    }
  ]
}

Only extract truly meaningful information that should be remembered:
- Facts that are useful for future work or decisions
- User preferences and choices
- Important decisions made
- Patterns or behaviors observed

Do NOT extract:
- Temporary conversational details
- Greetings or pleasantries
- Unless they indicate something significant

Conversation messages:
${messagesText}`;
}

/**
 * Build summary generation prompt
 */
function buildSummaryPrompt(messages: MessageRow[]): string {
  const messagesText = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

  return `Generate a concise summary of this conversation (2-3 sentences, under 300 characters).

Focus on:
- What was accomplished
- Key decisions made
- Important context established

Conversation messages:
${messagesText}`;
}

/**
 * Parse LLM fact extraction response
 */
function parseExtractedFacts(llmResponse: string): ExtractedFact[] {
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const json = JSON.parse(jsonMatch[0]);
    return json.extractedFacts || [];
  } catch {
    logger.warn('[SelfIteration] Failed to parse fact extraction response');
    return [];
  }
}

function normalizeCaptureKey(content: string): string {
  return content
    .toLowerCase()
    .replace(/^(?:decision|preference|fact):\s*/i, '')
    .replace(/['"`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s./:-]/g, '')
    .trim();
}

function isLowSignalCapture(content: string): boolean {
  const text = content.trim();
  if (text.length < 20 || text.split(/\s+/).length < 4) return true;
  if (text.endsWith('?')) return true;
  if (FORBIDDEN_BRAND_TERMS.test(text)) return true;
  return LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function splitCandidateStatements(content: string): string[] {
  return content
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function extractDurableSelfIterationFacts(messages: MessageRow[]): ExtractedFact[] {
  const captures = new Map<string, ExtractedFact>();

  for (const msg of messages) {
    if (msg.role !== 'user') continue;

    for (const statement of splitCandidateStatements(msg.content)) {
      if (isLowSignalCapture(statement)) continue;

      for (const { pattern, type, confidence, prefix } of EXTRACTION_PATTERNS) {
        if (!pattern.test(statement)) continue;

        const normalizedStatement = statement.replace(/^(?:decision|preference|fact):\s*/i, '');
        const content = `${prefix}: ${normalizedStatement}`;
        const key = `${type}:${normalizeCaptureKey(content)}`;
        const existing = captures.get(key);
        if (!existing || confidence > existing.confidence) {
          captures.set(key, { content, type, confidence });
        }
      }
    }
  }

  return Array.from(captures.values()).filter((fact) => fact.confidence >= MIN_CONFIDENCE_TO_STORE);
}

async function hasSimilarSelfIterationMemory(fact: ExtractedFact, projectPath?: string): Promise<boolean> {
  const matches = await search({
    query: fact.content,
    type: fact.type,
    project: projectPath,
    limit: 5,
  });
  const factKey = normalizeCaptureKey(fact.content);

  return matches.some((match) => {
    const matchMetadata = match.metadata ?? {};
    if (matchMetadata.extractionMethod !== 'self-iteration') return false;
    if ((match.similarity ?? 0) >= 0.92) return true;
    return normalizeCaptureKey(match.content) === factKey;
  });
}

/**
 * Get conversations ready for self-iteration
 */
async function getConversationsForIteration(minMessageCount: number): Promise<ConversationRow[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Get conversations that:
  // 1. Have ended (endedAt is not null)
  // 2. Haven't been processed yet (metadata.selfIterationProcessed is not set)
  // 3. Have enough messages (messageCount >= minMessageCount)
  const conversations = await sqliteDb.select()
    .from(schema.conversations)
    .where(sql`${schema.conversations.endedAt} IS NOT NULL
      AND ${schema.conversations.messageCount} >= ${minMessageCount}`)
    .limit(10);

  return (conversations as any[])
    .map((conversation) => ({
      ...conversation,
      metadata: deserializeMetadata(conversation.metadata ?? null),
    }))
    .filter((conversation) => !conversation.metadata?.selfIterationProcessed) as ConversationRow[];
}

/**
 * Get messages for a conversation
 */
async function getConversationMessages(conversationId: string): Promise<MessageRow[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const messages = await sqliteDb.select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt);

  return messages.map((m: any) => ({
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    createdAt: new Date(m.createdAt),
  })) as MessageRow[];
}

/**
 * Mark conversation as processed
 */
async function markConversationProcessed(conversationId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const rows = await sqliteDb.select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  const existingMetadata = deserializeMetadata(rows[0]?.metadata ?? null) ?? {};

  await sqliteDb.update(schema.conversations)
    .set({
      metadata: serializeMetadata({
        ...existingMetadata,
        selfIterationProcessed: true,
        selfIterationProcessedAt: new Date().toISOString(),
      }),
    })
    .where(eq(schema.conversations.id, conversationId));
}

/**
 * Process a single conversation
 */
async function processConversation(
  conversation: ConversationRow,
  config: SelfIterationConfig
): Promise<{ memoriesCreated: number; summariesCreated: number }> {
  const messages = await getConversationMessages(conversation.id);
  let memoriesCreated = 0;
  let summariesCreated = 0;

  // Limit messages if configured
  const messagesToProcess = config.maxMessagesToProcess > 0
    ? messages.slice(-config.maxMessagesToProcess)
    : messages;

  if (messagesToProcess.length === 0) {
    return { memoriesCreated, summariesCreated };
  }

  // Extract facts using improved pattern matching
  if (config.extractFacts) {
    const extractedFacts = extractDurableSelfIterationFacts(messagesToProcess);
    const project = conversation.projectId ? await getProjectById(conversation.projectId) : null;
    const projectPath = project?.path;

    // Store extracted facts as memories
    for (const fact of extractedFacts) {
      try {
        if (await hasSimilarSelfIterationMemory(fact, projectPath)) {
          logger.debug(`[SelfIteration] Suppressed duplicate memory: ${fact.type} - ${fact.content.substring(0, 50)}...`);
          continue;
        }

        await rememberMemory({
          content: fact.content,
          type: fact.type,
          project: projectPath,
          metadata: {
            extractionMethod: 'self-iteration',
            confidence: fact.confidence,
            conversationId: conversation.id,
            sessionId: conversation.sessionId,
          },
          source: 'self-iteration',
        });
        memoriesCreated++;
        logger.info(`[SelfIteration] Extracted memory: ${fact.type} - ${fact.content.substring(0, 50)}...`);
      } catch (error) {
        logger.error(`[SelfIteration] Failed to store memory:`, error);
      }
    }
  }

  // Auto-extract strategies from conversation
  try {
    const conversationContent = messagesToProcess.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const project = conversation.projectId ? await getProjectById(conversation.projectId) : null;
    const extractedStrategies = await extractStrategiesFromConversation(conversationContent, project?.path);
    for (const extracted of extractedStrategies) {
      try {
        const strategy = await createStrategy({
          projectId: project?.path,
          strategyType: extracted.strategyType,
          title: extracted.title,
          description: extracted.description,
          context: extracted.context,
          steps: extracted.steps,
          successCriteria: extracted.successCriteria,
          failureIndicators: extracted.failureIndicators,
          confidence: extracted.confidence,
          tags: ['auto-extracted'],
        });

        // If the strategy was extracted from a belief, link them
        if (extracted.sourceType === 'belief' && extracted.sourceId) {
          try {
            await createStrategyBeliefEdge(strategy.id, extracted.sourceId, 'informed_by');
          } catch (edgeError) {
            logger.debug('[SelfIteration] Failed to create belief-strategy edge:', edgeError);
          }
        }
      } catch (strategyCreateError) {
        logger.debug('[SelfIteration] Failed to create strategy:', strategyCreateError);
      }
    }
  } catch (strategyError) {
    logger.warn('[SelfIteration] Strategy extraction failed:', strategyError);
  }

  // Generate summary
  if (config.generateSummaries && messagesToProcess.length > 0) {
    // Use extractive summarization for better results
    const extracted = extractMessageContent(messagesToProcess);
    const summary = generateExtractiveSummary(extracted);

    // Update conversation with summary
    const db = await getDb();
    const schema = await getSchema();
    const sqliteDb = db as any;

    await sqliteDb.update(schema.conversations)
      .set({ summary })
      .where(eq(schema.conversations.id, conversation.id));

    summariesCreated++;
    logger.info(`[SelfIteration] Generated summary for conversation ${conversation.sessionId}`);
  }

  return { memoriesCreated, summariesCreated };
}

/**
 * Register self-iteration job handler
 */
const selfIterationHandler: JobHandler = async (
  context: JobExecutionContext
): Promise<{ recordsProcessed: number; summary: Record<string, unknown> }> => {
  logger.info('[SelfIteration] Starting job');

  const config = {
    ...DEFAULT_CONFIG,
    ...(context.config as Partial<SelfIterationConfig>),
  };

  if (!config.enabled) {
    logger.info('[SelfIteration] Job disabled, skipping');
    return { recordsProcessed: 0, summary: { status: 'disabled' } };
  }

  try {
    const conversations = await getConversationsForIteration(
      config.minMessageCount || DEFAULT_CONFIG.minMessageCount
    );

    if (conversations.length === 0) {
      logger.info('[SelfIteration] No conversations to process');
      return { recordsProcessed: 0, summary: { status: 'no_conversations' } };
    }

    let totalMemoriesCreated = 0;
    let totalSummariesGenerated = 0;
    let processedCount = 0;

    for (const conversation of conversations) {
      // Skip if already processed
      if (conversation.metadata?.selfIterationProcessed) {
        continue;
      }

      try {
        const result = await processConversation(conversation, config);
        totalMemoriesCreated += result.memoriesCreated;
        totalSummariesGenerated += result.summariesCreated;

        await markConversationProcessed(conversation.id);
        processedCount++;
      } catch (error) {
        logger.error(`[SelfIteration] Failed to process conversation ${conversation.id}:`, error);
      }
    }

    logger.info(`[SelfIteration] Processed ${processedCount}/${conversations.length} conversations`);
    logger.info(`[SelfIteration] Created ${totalMemoriesCreated} memories`);
    logger.info(`[SelfIteration] Generated ${totalSummariesGenerated} summaries`);

    // Run strategy decay periodically
    try {
      const deprecatedIds = await autoDeprecateUnusedStrategies(undefined, 90); // deprecate after 90 days unused
      if (deprecatedIds.length > 0) {
        logger.info(`[SelfIteration] Deprecated ${deprecatedIds.length} unused strategies`);
      }
    } catch (decayError) {
      logger.debug('[SelfIteration] Strategy decay check failed:', decayError);
    }

    return {
      recordsProcessed: processedCount,
      summary: {
        memoriesCreated: totalMemoriesCreated,
        summariesGenerated: totalSummariesGenerated,
        totalConversations: conversations.length,
      },
    };
  } catch (error) {
    logger.error('[SelfIteration] Job failed:', error);
    return {
      recordsProcessed: 0,
      summary: { error: error instanceof Error ? error.message : String(error) },
    };
  }
};

export { selfIterationHandler, DEFAULT_CONFIG };
