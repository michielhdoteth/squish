/**
 * Auto-Context Injection System
 * Injects relevant context into sessions
 */

import type { PluginContext } from './types.js';
import { searchMemories } from '../../features/memory/memories.js';
import { searchConversations } from '../../features/search/conversations.js';

export interface InjectionBudget {
  maxItems: number;
  maxTokens: number;
  relevanceThreshold: number;
  maxAge: number;
}

interface ContextItem {
  id: string;
  content: string;
  score: number;
}

export interface SelectedContext {
  memories: ContextItem[];
  conversations: ContextItem[];
  totalItems: number;
  estimatedTokens: number;
  injectionText: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

function truncateContent(content: string, maxLength = 100): string {
  return content.substring(0, maxLength).replace(/\n/g, ' ') + '...';
}

function formatInjectionText(memories: ContextItem[], conversations: ContextItem[]): string {
  if (memories.length === 0 && conversations.length === 0) return '';

  const parts: string[] = [];

  if (memories.length > 0) {
    parts.push('## Recent Memory Context');
    parts.push(...memories.map(m => `- ${truncateContent(m.content)}`));
  }

  if (conversations.length > 0) {
    parts.push('\n## Recent Conversation Context');
    parts.push(...conversations.map(c => `- ${truncateContent(c.content)}`));
  }

  return `\n<squish-context>\n${parts.join('\n')}\n</squish-context>\n`;
}

export async function injectContextIntoSession(
  context: PluginContext,
  projectPath: string
): Promise<void> {
  const budget: InjectionBudget = {
    maxItems: context.config?.maxContextItems || 15,
    maxTokens: context.config?.maxContextTokens || 3000,
    relevanceThreshold: 0.5,
    maxAge: 30 * 24 * 60 * 60 * 1000
  };

  const selectedContext = await selectContextToInject(projectPath, budget);

  if (selectedContext.totalItems > 0) {
    console.error(`[squish] Injected ${selectedContext.totalItems} items (${selectedContext.estimatedTokens} tokens)`);
  } else {
    console.error('[squish] No relevant context to inject');
  }
}

export async function selectContextToInject(
  projectPath: string,
  budget: InjectionBudget
): Promise<SelectedContext> {
  const memories: ContextItem[] = [];
  const conversations: ContextItem[] = [];
  let totalTokens = 0;
  let totalItems = 0;

  const memoriesResult = await searchMemories({
    query: projectPath,
    limit: Math.min(budget.maxItems, 10),
    project: projectPath
  }).catch(() => []);

  for (const memory of memoriesResult || []) {
    if (totalItems >= budget.maxItems || totalTokens >= budget.maxTokens) break;

    const m = memory as any;
    const content = m?.content || '';
    const tokens = estimateTokens(content);

    if (totalTokens + tokens <= budget.maxTokens) {
      memories.push({
        id: m?.id || '',
        content,
        score: m?.relevanceScore || 0.5
      });
      totalTokens += tokens;
      totalItems++;
    }
  }

  const remainingItems = budget.maxItems - totalItems;
  if (remainingItems > 0) {
    const conversationsResult = await searchConversations({
      query: projectPath,
      limit: Math.min(remainingItems, 5)
    }).catch(() => []);

    for (const conversation of conversationsResult || []) {
      if (totalItems >= budget.maxItems || totalTokens >= budget.maxTokens) break;

      const c = conversation as any;
      const content = typeof c === 'string' ? c : '';
      const tokens = estimateTokens(content);

      if (totalTokens + tokens <= budget.maxTokens) {
        conversations.push({
          id: c?.id || '',
          content,
          score: 0.5
        });
        totalTokens += tokens;
        totalItems++;
      }
    }
  }

  return {
    memories,
    conversations,
    totalItems,
    estimatedTokens: totalTokens,
    injectionText: formatInjectionText(memories, conversations)
  };
}

export function applyAgeDecay(
  score: number,
  createdAt: Date,
  halfLife = 30 * 24 * 60 * 60 * 1000
): number {
  const ageMs = Date.now() - createdAt.getTime();
  return score * Math.pow(0.5, ageMs / halfLife);
}

export function rankByRelevance<T extends { score: number; createdAt?: Date }>(
  items: T[]
): Array<T & { rankedScore: number }> {
  return items
    .map(item => ({
      ...item,
      rankedScore: item.createdAt ? applyAgeDecay(item.score, item.createdAt) : item.score
    }))
    .sort((a, b) => b.rankedScore - a.rankedScore);
}
