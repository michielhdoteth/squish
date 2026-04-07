/**
 * Mock Memory Provider for Testing MemoryBench
 * 
 * Simple in-memory implementation to verify the benchmark framework works
 */

import type { MemoryProvider, ConversationSession, SearchResult, SearchOptions } from '../types/index.js';

export class MockProvider implements MemoryProvider {
  name = 'mock';
  private memories: Array<{
    id: string;
    content: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
  }> = [];
  private idCounter = 0;

  async ingest(session: ConversationSession): Promise<void> {
    const content = session.turns.map(t => `${t.role}: ${t.content}`).join('\n');
    this.memories.push({
      id: `mem_${++this.idCounter}`,
      content,
      sessionId: session.id,
      metadata: session.metadata,
    });
  }

  async index(): Promise<void> {
    // No-op for in-memory
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    const results = this.memories
      .map(mem => {
        const content = mem.content.toLowerCase();
        let score = 0;
        
        for (const term of queryTerms) {
          if (content.includes(term)) {
            score += 1;
          }
        }
        
        return {
          id: mem.id,
          content: mem.content,
          score: score / queryTerms.length,
          metadata: mem.metadata,
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.limit || 10);

    return results;
  }

  async clear(): Promise<void> {
    this.memories = [];
    this.idCounter = 0;
  }

  getStats(): { count: number } {
    return { count: this.memories.length };
  }
}

export function createMockProvider(): MockProvider {
  return new MockProvider();
}
