/**
 * Squish Memory Provider for MemoryBench - Direct Integration
 * 
 * This provider directly imports and uses Squish core functions
 * for accurate benchmarking without HTTP overhead.
 */

import type { MemoryProvider, ConversationSession, SearchResult, SearchOptions } from '../types/index.js';

// Import Squish core functions directly
// Note: This requires the benchmark to be run from the squish-cc directory
// with access to the squish codebase

export interface SquishConfig {
  projectId?: string;
}

export class SquishDirectProvider implements MemoryProvider {
  name = 'squish';
  private config: SquishConfig;
  private squishPath: string;

  constructor(config?: SquishConfig) {
    this.config = {
      projectId: config?.projectId || 'benchmark',
    };
    this.squishPath = process.env.SQUISH_PATH || '../squish';
  }

  /**
   * Ingest a conversation session into Squish memory
   */
  async ingest(session: ConversationSession): Promise<void> {
    // Dynamic import to handle the module resolution
    const squishModule = await import(`${this.squishPath}/core/memory/memories.js`);
    const { rememberMemory } = squishModule;

    // Convert conversation to memory format
    const content = this.formatConversation(session);
    
    await rememberMemory({
      content,
      type: 'observation',
      tags: ['benchmark', session.id, 'conversation'],
      project: this.config.projectId,
      metadata: {
        sessionId: session.id,
        turns: session.turns.length,
        ...session.metadata,
      },
    });
  }

  /**
   * Wait for Squish to index the ingested data
   * Squish indexes automatically on insert
   */
  async index(): Promise<void> {
    // Squish indexes automatically, just add a small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Search Squish memory
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const squishModule = await import(`${this.squishPath}/core/memory/memories.js`);
    const { searchMemories } = squishModule;

    const results = await searchMemories({
      query,
      limit: options?.limit || 10,
      project: this.config.projectId,
    });

    return results.map((r: any) => ({
      id: r.id,
      content: r.content,
      score: r.score || r.similarity || 0.5, // Squish may not return scores
      metadata: r.metadata,
    }));
  }

  /**
   * Clear all benchmark memories
   */
  async clear(): Promise<void> {
    // Squish doesn't have a direct clear by tag, but we can use lifecycle
    const lifecycleModule = await import(`${this.squishPath}/core/worker.js`);
    const { forceLifecycleMaintenance } = lifecycleModule;
    
    await forceLifecycleMaintenance({
      project: this.config.projectId,
      olderThan: '1 second',
    });
  }

  /**
   * Format conversation for storage
   */
  private formatConversation(session: ConversationSession): string {
    const lines = [
      `Session: ${session.id}`,
      `Turns: ${session.turns.length}`,
      '',
      ...session.turns.map((turn, i) => 
        `[${i + 1}] ${turn.role.toUpperCase()}: ${turn.content}`
      ),
    ];
    return lines.join('\n');
  }
}

// Factory function
export function createSquishProvider(config?: SquishConfig): SquishDirectProvider {
  return new SquishDirectProvider(config);
}
