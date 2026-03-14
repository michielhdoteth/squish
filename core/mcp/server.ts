import express from 'express';
import cors from 'cors';
import { Server as HTTPServer } from 'http';
import { z } from 'zod';
import { 
  MCPToolDefinition, 
  MCPToolResult,
  MCPInitializeRequest,
  MCPInitializeResponse 
} from './types.js';
import { logger } from '../logger.js';

export class MCPServer {
  private app = express();
  private httpServer: HTTPServer | null = null;
  private tools: Map<string, MCPToolDefinition> = new Map();
  private port: number;
  private serverName: string;
  private serverVersion: string;

  constructor(
    port: number = 8767,
    serverName: string = 'squish-mcp',
    serverVersion: string = '0.9.0'
  ) {
    this.port = port;
    this.serverName = serverName;
    this.serverVersion = serverVersion;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes() {
    this.app.get('/sse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      res.write('data: {"type":"connected"}\n\n');

      req.on('close', () => {
        logger.info('SSE client disconnected');
      });
    });

    this.app.post('/initialize', async (req, res) => {
      try {
        const request = req.body as MCPInitializeRequest;
        
        const response: MCPInitializeResponse = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
          serverInfo: {
            name: this.serverName,
            version: this.serverVersion,
          },
        };

        res.json(response);
      } catch (error) {
        logger.error('Initialize error:', error);
        res.status(400).json({ error: 'Invalid initialize request' });
      }
    });

    this.app.get('/tools/list', (req, res) => {
      const tools = Array.from(this.tools.values()).map(def => def.tool);
      res.json({ tools });
    });

    this.app.post('/tools/call', async (req, res) => {
      try {
        const { name, arguments: args } = req.body;

        if (!name || typeof name !== 'string') {
          return res.status(400).json({ error: 'Tool name required' });
        }

        const toolDef = this.tools.get(name);
        if (!toolDef) {
          return res.status(404).json({ error: `Tool not found: ${name}` });
        }

        const result = await toolDef.handler(args || {});
        res.json(result);
      } catch (error) {
        logger.error('Tool call error:', error);
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Tool execution failed' 
        });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        server: this.serverName,
        version: this.serverVersion,
        tools: this.tools.size 
      });
    });
  }

  registerTool(definition: MCPToolDefinition) {
    this.tools.set(definition.tool.name, definition);
    logger.info(`Registered MCP tool: ${definition.tool.name}`);
  }

  registerTools(definitions: MCPToolDefinition[]) {
    definitions.forEach(def => this.registerTool(def));
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(this.port, () => {
        logger.info(`MCP server listening on port ${this.port}`);
        logger.info(`SSE endpoint: http://localhost:${this.port}/sse`);
        logger.info(`Tools available: ${this.tools.size}`);
        resolve();
      });

      this.httpServer.on('error', (error) => {
        logger.error('MCP server error:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        resolve();
        return;
      }

      this.httpServer.close((error) => {
        if (error) {
          logger.error('Error stopping MCP server:', error);
          reject(error);
        } else {
          logger.info('MCP server stopped');
          resolve();
        }
      });
    });
  }

  getToolCount(): number {
    return this.tools.size;
  }
}
