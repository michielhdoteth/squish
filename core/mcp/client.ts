import { z } from 'zod';
import { 
  MCPToolCall, 
  MCPToolResult,
  MCPInitializeRequest,
  MCPInitializeResponse 
} from './types.js';
import { logger } from '../logger.js';

export class MCPClient {
  private baseUrl: string;
  private connected = false;
  private serverInfo: { name: string; version: string } | null = null;

  constructor(baseUrl: string = 'http://localhost:8766') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async initialize(): Promise<MCPInitializeResponse> {
    const request: MCPInitializeRequest = {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'squish-mcp-client',
        version: '0.9.0',
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Initialize failed: ${response.statusText}`);
      }

      const result = await response.json() as MCPInitializeResponse;
      this.serverInfo = result.serverInfo;
      this.connected = true;

      logger.info(`Connected to MCP server: ${result.serverInfo.name} v${result.serverInfo.version}`);
      return result;
    } catch (error) {
      logger.error('Failed to initialize MCP connection:', error);
      throw error;
    }
  }

  async listTools(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tools/list`);

      if (!response.ok) {
        throw new Error(`List tools failed: ${response.statusText}`);
      }

      const data = await response.json() as { tools?: any[] };
      return data.tools || [];
    } catch (error) {
      logger.error('Failed to list tools:', error);
      return [];
    }
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    if (!this.connected) {
      await this.initialize();
    }

    const toolCall: MCPToolCall = { name, arguments: args };

    try {
      const response = await fetch(`${this.baseUrl}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolCall),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tool call failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as MCPToolResult;
      return result;
    } catch (error) {
      logger.error(`Tool call error (${name}):`, error);
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServerInfo(): { name: string; version: string } | null {
    return this.serverInfo;
  }
}
