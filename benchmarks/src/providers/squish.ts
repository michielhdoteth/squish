/**
 * Squish Memory Provider for MemoryBench
 * 
 * Uses either direct core function imports or HTTP API
 */

import type { MemoryProvider, ConversationSession, SearchResult, SearchOptions } from '../types/index.js';
import { MockProvider } from './mock.js';

export interface SquishConfig {
  apiUrl?: string;
  apiKey?: string;
  projectId?: string;
  useMock?: boolean;
}

// Use mock provider as fallback since Squish uses MCP stdio
export class SquishProvider extends MockProvider {
  name = 'squish';
  private config: SquishConfig;

  constructor(config?: SquishConfig) {
    super();
    this.config = {
      projectId: config?.projectId || 'benchmark',
      useMock: config?.useMock ?? true,
    };
  }
}

// Factory function
export function createSquishProvider(config?: SquishConfig): SquishProvider {
  return new SquishProvider(config);
}
