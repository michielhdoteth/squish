/**
 * OpenClaw Gateway Integration
 *
 * WebSocket gateway for OpenClaw to connect to Squish.
 * OpenClaw is a personal AI assistant platform (https://github.com/openclaw/openclaw)
 *
 * This gateway provides an API for OpenClaw agents to:
 * - Search Squish memories
 * - Store new memories
 * - Retrieve specific memories
 * - Check system health
 *
 * Protocol: WebSocket
 * Port: 18789
 *
 * Message Format:
 * {
 *   "type": "search" | "remember" | "recall" | "status",
 *   "id": "unique-request-id",
 *   "payload": { ... }
 * }
 *
 * Response Format:
 * {
 *   "type": "search" | "remember" | "recall" | "status",
 *   "id": "unique-request-id",
 *   "success": true | false,
 *   "data"?: { ... },
 *   "error"?: "error message"
 * }
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { searchMemories, rememberMemory, getMemoryById } from '../memory/memories.js';
import { logger } from '../logger.js';

const OPENCLAW_GATEWAY_PORT = 18789;

export interface OpenClawMessage {
  type: 'search' | 'remember' | 'recall' | 'status';
  id: string;
  payload: any;
}

export interface OpenClawResponse {
  type: string;
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * OpenClaw Gateway class
 *
 * Manages WebSocket connections from OpenClaw agents.
 */
export class OpenClawGateway {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  /**
   * Start the gateway server
   */
  async start(): Promise<void> {
    try {
      this.wss = new WebSocketServer({ port: OPENCLAW_GATEWAY_PORT });

      this.wss.on('connection', (ws) => {
        logger.info('OpenClaw client connected');
        this.clients.add(ws);

        ws.on('message', async (data) => {
          try {
            const message: OpenClawMessage = JSON.parse(data.toString());
            const response = await this.handleMessage(message);
            ws.send(JSON.stringify(response));
          } catch (error) {
            logger.error(`OpenClaw message error: ${error}`);
            ws.send(JSON.stringify({
              type: 'error',
              id: 'unknown',
              success: false,
              error: String(error)
            }));
          }
        });

        ws.on('close', () => {
          logger.info('OpenClaw client disconnected');
          this.clients.delete(ws);
        });

        ws.on('error', (error) => {
          logger.error(`OpenClaw WebSocket error: ${error}`);
        });
      });

      this.wss.on('error', (error) => {
        logger.error(`OpenClaw gateway error: ${error}`);
      });

      logger.info(`OpenClaw gateway listening on port ${OPENCLAW_GATEWAY_PORT}`);
    } catch (error) {
      logger.error(`Failed to start OpenClaw gateway: ${error}`);
      throw error;
    }
  }

  /**
   * Stop the gateway server
   */
  async stop(): Promise<void> {
    if (this.wss) {
      // Close all client connections
      this.clients.forEach(client => {
        try {
          client.close();
        } catch (error) {
          logger.debug(`Error closing client connection: ${error}`);
        }
      });
      this.clients.clear();

      // Close the server
      return new Promise<void>((resolve) => {
        this.wss!.close((err) => {
          if (err) {
            logger.error(`Error closing OpenClaw gateway: ${err}`);
          }
          this.wss = null;
          logger.info('OpenClaw gateway stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle incoming message from OpenClaw
   */
  private async handleMessage(message: OpenClawMessage): Promise<OpenClawResponse> {
    const { type, id, payload } = message;

    try {
      switch (type) {
        case 'search':
          return await this.handleSearch(id, payload);
        case 'remember':
          return await this.handleRemember(id, payload);
        case 'recall':
          return await this.handleRecall(id, payload);
        case 'status':
          return await this.handleStatus(id);
        default:
          return {
            type,
            id,
            success: false,
            error: `Unknown message type: ${type}`
          };
      }
    } catch (error) {
      return {
        type,
        id,
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Handle search request
   */
  private async handleSearch(id: string, payload: any): Promise<OpenClawResponse> {
    const { query, type, limit, project } = payload;

    if (!query) {
      return {
        type: 'search',
        id,
        success: false,
        error: 'query is required'
      };
    }

    try {
      const results = await searchMemories({
        query,
        type,
        limit: limit || 10,
        project
      });

      return {
        type: 'search',
        id,
        success: true,
        data: {
          results,
          count: results.length
        }
      };
    } catch (error) {
      return {
        type: 'search',
        id,
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Handle remember request
   */
  private async handleRemember(id: string, payload: any): Promise<OpenClawResponse> {
    const { content, type, tags, project, metadata } = payload;

    if (!content) {
      return {
        type: 'remember',
        id,
        success: false,
        error: 'content is required'
      };
    }

    try {
      const memory = await rememberMemory({
        content,
        type,
        tags,
        project,
        metadata
      });

      return {
        type: 'remember',
        id,
        success: true,
        data: { memory }
      };
    } catch (error) {
      return {
        type: 'remember',
        id,
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Handle recall request
   */
  private async handleRecall(id: string, payload: any): Promise<OpenClawResponse> {
    const { memoryId } = payload;

    if (!memoryId) {
      return {
        type: 'recall',
        id,
        success: false,
        error: 'memoryId is required'
      };
    }

    try {
      const memory = await getMemoryById(memoryId);

      if (!memory) {
        return {
          type: 'recall',
          id,
          success: false,
          error: 'Memory not found'
        };
      }

      return {
        type: 'recall',
        id,
        success: true,
        data: { memory }
      };
    } catch (error) {
      return {
        type: 'recall',
        id,
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Handle status request
   */
  private async handleStatus(id: string): Promise<OpenClawResponse> {
    const { checkDatabaseHealth } = await import('../database.js');
    const dbHealth = await checkDatabaseHealth();

    return {
      type: 'status',
      id,
      success: true,
      data: {
        version: '1.0.2',
        gateway: 'squish-openclaw',
        database: dbHealth ? 'ok' : 'unavailable',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
let gatewayInstance: OpenClawGateway | null = null;

/**
 * Get the singleton OpenClaw gateway instance
 *
 * @returns OpenClawGateway instance
 */
export async function getOpenClawGateway(): Promise<OpenClawGateway> {
  if (!gatewayInstance) {
    gatewayInstance = new OpenClawGateway();
  }
  return gatewayInstance;
}

/**
 * Reset the singleton gateway instance
 */
export function resetOpenClawGateway(): void {
  if (gatewayInstance) {
    gatewayInstance.stop().catch(() => {});
    gatewayInstance = null;
  }
}

/**
 * Start the OpenClaw gateway if configured
 *
 * Checks for OPENCLAW_GATEWAY_ENABLED environment variable.
 */
export async function maybeStartOpenClawGateway(): Promise<OpenClawGateway | null> {
  const enabled = process.env.OPENCLAW_GATEWAY_ENABLED === 'true';

  if (!enabled) {
    return null;
  }

  try {
    const gateway = await getOpenClawGateway();
    await gateway.start();
    return gateway;
  } catch (error) {
    logger.error(`Failed to start OpenClaw gateway: ${error}`);
    return null;
  }
}
