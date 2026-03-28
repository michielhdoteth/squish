import { MCPClient } from '../core/mcp/client.js';
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import { search, rememberMemory } from '../core/memory/memories.js';

export class ManagedSync {
  private client: MCPClient;
  private syncEnabled: boolean;

  constructor() {
    this.syncEnabled = config.managedMode && !!config.managedApiKey;
    
    this.client = new MCPClient(config.managedApiUrl);
  }

  async sync(): Promise<void> {
    if (!this.syncEnabled) {
      logger.debug('Managed sync disabled');
      return;
    }

    try {
      await this.client.initialize();
      logger.info('Connected to managed storage');
    } catch (error) {
      logger.error('Managed sync connection failed:', error);
    }
  }

  async pushMemory(memoryId: string): Promise<void> {
    if (!this.syncEnabled) return;

    try {
      const memory = await search({ query: memoryId, limit: 1 });
      if (memory.length > 0) {
        await this.client.callTool('managed_memory_store', {
          memory: memory[0],
        });
        logger.debug(`Pushed memory ${memoryId} to managed storage`);
      }
    } catch (error) {
      logger.error(`Failed to push memory ${memoryId}:`, error);
    }
  }

  async pullMemory(memoryId: string): Promise<void> {
    if (!this.syncEnabled) return;

    try {
      const result = await this.client.callTool('managed_memory_retrieve', {
        memoryId,
      });

      if (result.content[0]?.text) {
        const memory = JSON.parse(result.content[0].text);
        await rememberMemory(memory);
        logger.debug(`Pulled memory ${memoryId} from managed storage`);
      }
    } catch (error) {
      logger.error(`Failed to pull memory ${memoryId}:`, error);
    }
  }
}

export async function startManagedSync(): Promise<ManagedSync> {
  const sync = new ManagedSync();
  await sync.sync();
  return sync;
}
