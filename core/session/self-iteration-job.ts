/** Self-Iteration Job - Auto-extract key facts from ended conversations
 *
 * Processes conversations to extract memories and generate summaries
 */

import { sql, eq } from 'drizzle-orm';
import { registerJobHandler, type JobExecutionContext, type JobHandler } from '../scheduler/cron-scheduler.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { rememberMemory } from '../memory/memories.js';
import { logger } from '../logger.js';

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
  projectId: string;
  summary: string | null;
  messageCount: number;
  metadata: Record<string, unknown> | null;
}

interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface ExtractedFact {
  content: string;
  type: 'fact' | 'decision' | 'preference' | 'observation';
  confidence: number;
}

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

/**
 * Get conversations ready for self-iteration
 */
async function getConversationsForIteration(maxMessages: number): Promise<ConversationRow[]> {
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
      AND (${schema.conversations.metadata}->>'selfIterationProcessed') IS NULL
      AND ${schema.conversations.messageCount} >= ?`)
    .limit(10);

  return conversations as ConversationRow[];
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

  await sqliteDb.update(schema.conversations)
    .set({
      metadata: sql`json_set(${schema.conversations.metadata}, 'selfIterationProcessed', true)`,
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

  // Extract facts
  if (config.extractFacts) {
    const prompt = buildFactExtractionPrompt(messagesToProcess);

    // Here we would call an LLM client to extract facts
    // For now, we'll use a simple heuristic extraction
    const extractedFacts: ExtractedFact[] = [];

    for (const msg of messagesToProcess) {
      if (msg.role === 'user') {
        const content = msg.content.toLowerCase();

        // Look for user preferences
        if (content.includes('i want') || content.includes('i prefer') || content.includes('i like')) {
          extractedFacts.push({
            content: `User preference: ${msg.content}`,
            type: 'preference',
            confidence: 70,
          });
        }

        // Look for decisions
        if (content.includes('i will') || content.includes('i decide') || content.includes('let\'s')) {
          extractedFacts.push({
            content: `Decision: ${msg.content}`,
            type: 'decision',
            confidence: 80,
          });
        }
      }
    }

    // Store extracted facts as memories
    for (const fact of extractedFacts) {
      if (fact.confidence >= 60) {
        try {
          await rememberMemory({
            content: fact.content,
            type: fact.type,
            project: conversation.projectId,
            metadata: {
              extractionMethod: 'self-iteration',
              confidence: fact.confidence,
              conversationId: conversation.id,
              sessionId: conversation.sessionId,
            },
          });
          memoriesCreated++;
          logger.info(`[SelfIteration] Extracted memory: ${fact.type} - ${fact.content.substring(0, 50)}...`);
        } catch (error) {
          logger.error(`[SelfIteration] Failed to store memory:`, error);
        }
      }
    }
  }

  // Generate summary
  if (config.generateSummaries && messagesToProcess.length > 0) {
    const prompt = buildSummaryPrompt(messagesToProcess);

    // Here we would call an LLM client to generate summary
    // For now, use simple heuristic
    const userMessages = messagesToProcess.filter(m => m.role === 'user');
    const lastMessage = userMessages[userMessages.length - 1]?.content || '';

    const summary = lastMessage.substring(0, Math.min(250, lastMessage.length));

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
      config.maxMessagesToProcess || DEFAULT_CONFIG.maxMessagesToProcess
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
